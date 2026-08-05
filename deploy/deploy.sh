#!/usr/bin/env bash
#
# Deploy a specific Kimply image to this instance, or roll back to a previous one.
#
#   ./deploy/deploy.sh <full-40-char-git-sha>
#
# Rollback is the same command with an older SHA. There is deliberately no separate
# rollback script: rolling back should go through the exact same health-gated path
# as a deploy, not a less-tested one.
#
# List what is available to roll back to:
#   aws ecr describe-images --repository-name "$ECR_REPOSITORY" --region "$AWS_REGION" \
#     --query 'sort_by(imageDetails,&imagePushedAt)[*].[imageTags[0],imagePushedAt]' --output table
#
# Exit codes:
#   0  deployed and verified
#   1  deploy failed, previous image restored and verified
#   2  usage or precondition error
#   3  deploy failed AND rollback failed - the site is down, intervene manually

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/kimply}"
ENV_FILE="$APP_DIR/.env"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
HEALTH_SCRIPT="$APP_DIR/scripts/health-check.sh"
CONTAINER=kimply-app

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die()  { log "ERROR: $*" >&2; exit 2; }
trap 'log "FAILED at line $LINENO"' ERR

# --- Preconditions -----------------------------------------------------------
IMAGE_SHA="${1:-}"
[[ -n "$IMAGE_SHA" ]] || die "usage: $0 <full-40-char-git-sha>"

# Reject anything that is not an exact commit SHA. Guards against deploying an
# empty string, a branch name, or a truncated tag by accident.
[[ "$IMAGE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "not a 40-character git SHA: '$IMAGE_SHA'"

[[ -f "$ENV_FILE" ]]      || die "no env file at $ENV_FILE"
[[ -f "$COMPOSE_FILE" ]]  || die "no compose file at $COMPOSE_FILE"
[[ -x "$HEALTH_SCRIPT" ]] || die "no executable health check at $HEALTH_SCRIPT"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${ECR_REGISTRY:?ECR_REGISTRY must be set in $ENV_FILE}"
: "${ECR_REPOSITORY:?ECR_REPOSITORY must be set in $ENV_FILE}"
: "${AWS_REGION:?AWS_REGION must be set in $ENV_FILE}"
: "${ROOT_URL:?ROOT_URL must be set in $ENV_FILE}"

NEW_IMAGE="$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_SHA"
PREV_IMAGE="${APP_IMAGE:-}"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# Rewrite APP_IMAGE in place, atomically, preserving the file's 0600 mode.
set_app_image() {
  local image="$1" tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  chmod 600 "$tmp"
  if grep -q '^APP_IMAGE=' "$ENV_FILE"; then
    sed "s|^APP_IMAGE=.*|APP_IMAGE=${image}|" "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"
    printf 'APP_IMAGE=%s\n' "$image" >> "$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
}

# Bring up the app container on a given image and prove it is serving.
# Returns non-zero if either the container healthcheck or the public probe fails.
activate() {
  local image="$1" label="$2"

  log "[$label] setting APP_IMAGE=$image"
  set_app_image "$image"

  log "[$label] validating compose configuration"
  compose config -q || return 1

  # --no-deps leaves nginx and certbot untouched, so TLS termination never blips.
  log "[$label] recreating the app container"
  compose up -d --no-deps app || return 1

  log "[$label] waiting for the container healthcheck"
  local status
  for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
    case "$status" in
      healthy) log "[$label] container healthy"; break ;;
      unhealthy) log "[$label] container reported unhealthy"; return 1 ;;
    esac
    sleep 2
  done
  [[ "$status" == "healthy" ]] || { log "[$label] container did not become healthy in time"; return 1; }

  # The public probe is the one that matters: it also proves DNS, nginx and TLS.
  log "[$label] probing the public endpoint"
  "$HEALTH_SCRIPT" "$ROOT_URL" || return 1

  return 0
}

# --- Deploy ------------------------------------------------------------------
log "Deploying $NEW_IMAGE"
log "Currently deployed: ${PREV_IMAGE:-<none>}"

# Authenticate with the EC2 instance role. No credentials are stored on the box;
# this token is short-lived and derived from the role at call time.
log "Authenticating to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null

# Pull BEFORE touching anything running: if the image is missing or the pull
# fails, the current deployment is completely undisturbed.
log "Pulling image"
docker pull "$NEW_IMAGE"

if activate "$NEW_IMAGE" "deploy"; then
  log "SUCCESS: $NEW_IMAGE is live"

  # Time-filtered, NOT `docker system prune -a`, which would delete the previous
  # image and turn an instant rollback into a re-pull.
  log "Pruning images older than 7 days"
  docker image prune -f --filter "until=168h" >/dev/null || true

  exit 0
fi

# --- Rollback ----------------------------------------------------------------
log "Deploy verification FAILED"

if [[ -z "$PREV_IMAGE" ]]; then
  log "No previous image recorded, so there is nothing to roll back to."
  log "The site may be down. Investigate with: compose logs --tail=100 app"
  exit 3
fi

log "Rolling back to $PREV_IMAGE"
if activate "$PREV_IMAGE" "rollback"; then
  log "Rolled back successfully. $PREV_IMAGE is live again."
  log "The failed image $NEW_IMAGE was NOT deleted; inspect it with:"
  log "  docker run --rm -it --entrypoint sh $NEW_IMAGE"
  exit 1
fi

log "ROLLBACK ALSO FAILED. The site is down and needs manual intervention."
log "  compose logs --tail=100 app"
log "  compose ps"
exit 3
