#!/usr/bin/env bash
#
# Build the Kimply production image and push it to ECR, tagged with the exact
# commit SHA.
#
# Run this from a developer machine, NOT from the EC2 instance. Keeping the Meteor
# build off the production host is the whole reason ECR is in this architecture:
# builds are slow and memory-hungry, and rebuilding an old commit during an
# incident is a terrible way to roll back.
#
#   ./deploy/build-push.sh                 # build, verify, push
#   ./deploy/build-push.sh --no-push       # build and verify only
#
# Requires: AWS credentials with the kimply-ecr-push policy, and docker buildx.
# On Apple Silicon the linux/arm64 build is native; on x86 it runs under QEMU
# emulation and will be considerably slower.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM=linux/arm64
PUSH=1

[[ "${1:-}" == "--no-push" ]] && PUSH=0

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
trap 'log "FAILED at line $LINENO"' ERR

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
ECR_REPOSITORY="${ECR_REPOSITORY:-kimply}"

# --- The tag must correspond to a real, pushed commit ------------------------
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain -- app docker-compose.prod.yml nginx)" ]]; then
  die "working tree is dirty. Commit first - an image tag must correspond to a real commit."
fi

SHA="$(git rev-parse HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "could not determine commit SHA"

if ! git merge-base --is-ancestor "$SHA" "@{upstream}" 2>/dev/null; then
  log "WARNING: HEAD is not on the upstream branch. Nobody else can reproduce this image."
fi

# --- Resolve the registry ----------------------------------------------------
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)" \
  || die "no working AWS credentials (try: aws configure / aws sso login)"
ECR_REGISTRY="${ECR_REGISTRY:-$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com}"
IMAGE="$ECR_REGISTRY/$ECR_REPOSITORY:$SHA"

log "Commit:   $SHA"
log "Image:    $IMAGE"
log "Platform: $PLATFORM"

# --- Refuse to overwrite -----------------------------------------------------
# The repository is set to IMMUTABLE so a push would fail anyway, but failing here
# gives a clear message instead of a registry error.
if aws ecr describe-images --region "$AWS_REGION" \
     --repository-name "$ECR_REPOSITORY" --image-ids "imageTag=$SHA" >/dev/null 2>&1; then
  die "$SHA is already in ECR. Tags are immutable; commit a change to produce a new tag."
fi

# --- Build -------------------------------------------------------------------
log "Building"
docker buildx build --platform "$PLATFORM" -t "$IMAGE" --load "$REPO_ROOT/app"

# --- Verify before pushing ---------------------------------------------------
# A broken image must never reach the registry. Boot it against a throwaway
# MongoDB and confirm it actually serves.
log "Verifying the image boots and serves health endpoints"
NET="kimply-verify-$$"
MONGO="kimply-verify-mongo-$$"
APP="kimply-verify-app-$$"

cleanup() {
  docker rm -f "$APP" "$MONGO" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap 'cleanup; log "FAILED at line $LINENO"' ERR
trap cleanup EXIT

docker network create "$NET" >/dev/null
docker run -d --name "$MONGO" --network "$NET" --platform "$PLATFORM" mongo:7.0 >/dev/null
docker run -d --name "$APP" --network "$NET" --platform "$PLATFORM" \
  -e MONGO_URL="mongodb://$MONGO:27017/verify" \
  -e ROOT_URL="http://localhost:3000" \
  "$IMAGE" >/dev/null

ok=0
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)"
  if [[ "$status" == "healthy" ]]; then ok=1; break; fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$APP" 2>/dev/null)" == "false" ]]; then
    log "container exited during verification:"
    docker logs --tail 40 "$APP" || true
    die "image does not boot"
  fi
  sleep 2
done

[[ $ok -eq 1 ]] || { docker logs --tail 40 "$APP" || true; die "image never became healthy"; }

# Readiness additionally proves it can reach MongoDB.
docker exec "$APP" node -e "
require('http').get('http://127.0.0.1:3000/health/ready', r => {
  console.log('health/ready -> ' + r.statusCode);
  process.exit(r.statusCode === 200 ? 0 : 1);
}).on('error', e => { console.error(e.message); process.exit(1); });
" || die "health/ready did not return 200"

log "Image verified"
cleanup
trap 'log "FAILED at line $LINENO"' ERR

# --- Push --------------------------------------------------------------------
if [[ $PUSH -eq 0 ]]; then
  log "--no-push set, stopping here. Local image: $IMAGE"
  exit 0
fi

log "Authenticating to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null

log "Pushing"
docker push "$IMAGE"

cat <<EOF

Pushed: $IMAGE

Deploy it from the instance:
  aws ssm start-session --target <instance-id>
  sudo /opt/kimply/deploy/deploy.sh $SHA
EOF
