#!/usr/bin/env bash
#
# Probe a Kimply deployment's readiness endpoint with retry and backoff.
#
# Used by deploy/deploy.sh to gate a release, and runnable by hand to check a
# live deployment. Hitting the PUBLIC URL is the point: it exercises DNS, the
# Elastic IP, the security group, nginx, TLS, the app and MongoDB in one call, so
# a pass means the whole path works rather than just the container.
#
# Usage:
#   ./scripts/health-check.sh https://kimply.example.com
#   ./scripts/health-check.sh https://localhost --insecure   # self-signed cert
#
# Exit codes:
#   0  ready
#   1  did not become ready within the retry budget
#   2  usage error

set -Eeuo pipefail

BASE_URL="${1:-}"
shift || true

if [[ -z "$BASE_URL" ]]; then
  echo "usage: $0 <base-url> [--insecure] [--attempts N]" >&2
  exit 2
fi

CURL_OPTS=(--silent --show-error --max-time 5)
ATTEMPTS=30

while [[ $# -gt 0 ]]; do
  case "$1" in
    --insecure) CURL_OPTS+=(--insecure); shift ;;
    --attempts) ATTEMPTS="${2:?--attempts needs a value}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

URL="${BASE_URL%/}/health/ready"
log "Probing $URL (up to $ATTEMPTS attempts)"

delay=1
for ((i = 1; i <= ATTEMPTS; i++)); do
  # Capture body and status separately so a failure message is actually useful.
  if body=$(curl "${CURL_OPTS[@]}" --fail --write-out '\n%{http_code}' "$URL" 2>/dev/null); then
    status="${body##*$'\n'}"
    payload="${body%$'\n'*}"
    if [[ "$status" == "200" ]]; then
      log "READY after $i attempt(s): $payload"
      exit 0
    fi
    log "attempt $i/$ATTEMPTS: HTTP $status"
  else
    log "attempt $i/$ATTEMPTS: no response"
  fi

  [[ $i -eq $ATTEMPTS ]] && break

  sleep "$delay"
  # Back off gently, capped, so a slow boot is tolerated without the total budget
  # ballooning.
  delay=$(( delay < 5 ? delay + 1 : 5 ))
done

log "NOT READY after $ATTEMPTS attempts"
log "Diagnose with:"
log "  curl -v ${CURL_OPTS[*]} $URL"
log "  docker compose -f docker-compose.prod.yml logs --tail=50 app"
log "  docker compose -f docker-compose.prod.yml logs --tail=50 nginx"
exit 1
