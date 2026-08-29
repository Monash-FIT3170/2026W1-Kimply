#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
ECR_REPOSITORY="${ECR_REPOSITORY:-kimply}"
PLATFORM="linux/arm64"

cd "$REPO_ROOT"

SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"

ACCOUNT_ID="$(aws sts get-caller-identity \
  --query Account \
  --output text)"

ECR_REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE="$ECR_REGISTRY/$ECR_REPOSITORY:$SHA"

echo "Building: $IMAGE"

# Build the exact production image.
docker buildx build \
  --platform "$PLATFORM" \
  --file "$REPO_ROOT/app/Dockerfile" \
  --tag "$IMAGE" \
  --load \
  "$REPO_ROOT/app"

# Make sure the Dockerfile healthcheck actually made it into the image.
HEALTHCHECK="$(docker image inspect "$IMAGE" \
  --format '{{json .Config.Healthcheck}}')"

if [[ "$HEALTHCHECK" == "null" ]]; then
  echo "ERROR: production image has no Docker healthcheck"
  exit 1
fi

echo "Healthcheck present:"
echo "$HEALTHCHECK"

# Authenticate to ECR.
aws ecr get-login-password \
  --region "$AWS_REGION" |
docker login \
  --username AWS \
  --password-stdin "$ECR_REGISTRY"

# Push only after the image passed basic verification.
docker push "$IMAGE"

echo "Pushed: $IMAGE"