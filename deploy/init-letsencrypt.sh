#!/usr/bin/env bash
#
# First-time TLS certificate setup for Kimply.
#
# Solves the chicken-and-egg problem: nginx will not start if its config points at
# a certificate that does not exist, but certbot's HTTP-01 challenge needs nginx
# already serving on port 80.
#
# The fix is a self-signed placeholder certificate. nginx starts against it, certbot
# then replaces it over HTTP-01, and nginx reloads. This keeps ONE nginx config for
# every environment, which matters because it means local validation exercises the
# exact same file that runs in production rather than a stripped-down variant.
#
# Usage:
#   ./deploy/init-letsencrypt.sh --self-signed   # local validation, no Let's Encrypt
#   ./deploy/init-letsencrypt.sh --dry-run       # full ACME path, no rate-limit cost
#   ./deploy/init-letsencrypt.sh                 # real certificate
#
# Always run --dry-run first. Let's Encrypt allows only 5 duplicate certificates
# per week, and iterating on a broken setup will exhaust that quota quickly.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"
COMPOSE_FILE="$REPO_ROOT/docker-compose.prod.yml"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
trap 'log "FAILED at line $LINENO"' ERR

[[ -f "$ENV_FILE" ]] || die "no env file at $ENV_FILE (copy .env.production.example and fill it in)"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${DOMAIN:?DOMAIN must be set in $ENV_FILE}"

# Names to put on the certificate. Defaults to the apex alone; set CERT_DOMAINS in
# the env file to a space-separated list to cover more, e.g.
#   CERT_DOMAINS="kimply.online www.kimply.online"
# The FIRST name becomes the certificate lineage name, which is what the nginx
# ssl_certificate paths refer to, so it must stay $DOMAIN.
CERT_DOMAINS="${CERT_DOMAINS:-$DOMAIN}"
CERT_ARGS=()
for d in $CERT_DOMAINS; do CERT_ARGS+=(-d "$d"); done

SELF_SIGNED=0
CERTBOT_EXTRA=()
case "${1:-}" in
  --self-signed) SELF_SIGNED=1 ;;
  --dry-run)     CERTBOT_EXTRA+=(--dry-run) ;;
  "")            ;;
  *)             die "unknown argument: $1" ;;
esac

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

# ---------------------------------------------------------------------------
log "Creating placeholder certificate for $DOMAIN so nginx can start"
compose run --rm --entrypoint sh certbot -c "
  set -e
  mkdir -p '$CERT_DIR'
  if [ ! -f '$CERT_DIR/fullchain.pem' ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
      -keyout '$CERT_DIR/privkey.pem' \
      -out '$CERT_DIR/fullchain.pem' \
      -subj '/CN=$DOMAIN'
    echo 'placeholder certificate created'
  else
    echo 'certificate already present, leaving it alone'
  fi
"

log "Starting nginx"
compose up -d nginx

# Give nginx a moment, then prove the config is valid before going further.
compose exec -T nginx nginx -t

if [[ $SELF_SIGNED -eq 1 ]]; then
  log "Self-signed mode: stopping here. nginx is serving with a placeholder certificate."
  log "Browsers and curl will warn about it; use 'curl -k' for local checks."
  exit 0
fi

: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL must be set in $ENV_FILE for a real certificate}"

# ---------------------------------------------------------------------------
# certbot refuses to overwrite an existing lineage, so the placeholder has to go
# first. Only do this for a real issuance, never for --dry-run, which would leave
# nginx with no certificate at all if the dry run then failed.
if [[ ${#CERTBOT_EXTRA[@]} -eq 0 ]]; then
  log "Removing placeholder certificate"
  compose run --rm --entrypoint sh certbot -c "rm -rf '$CERT_DIR' '/etc/letsencrypt/archive/$DOMAIN' '/etc/letsencrypt/renewal/$DOMAIN.conf'"
fi

log "Requesting certificate for: $CERT_DOMAINS"
compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  "${CERT_ARGS[@]}" \
  --cert-name "$DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos --no-eff-email --non-interactive \
  "${CERTBOT_EXTRA[@]}"

if [[ ${#CERTBOT_EXTRA[@]} -gt 0 ]]; then
  log "Dry run succeeded. Re-run without --dry-run to issue the real certificate."
  exit 0
fi

# ---------------------------------------------------------------------------
# Always validate before reloading. A reload against a broken config takes the
# site down, whereas a failed 'nginx -t' costs nothing.
log "Validating nginx configuration"
compose exec -T nginx nginx -t

log "Reloading nginx"
compose exec -T nginx nginx -s reload

log "Done. Certificate installed for $DOMAIN."
log "Once you have confirmed HTTPS works, uncomment the Strict-Transport-Security"
log "header in nginx/templates/kimply.conf.template and reload."
