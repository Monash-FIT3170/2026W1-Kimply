#!/usr/bin/env bash
#
# Deploy a specific Kimply image to an ECS service, or roll back to an older one.
#
#   ./deploy/ecs-deploy.sh <full-40-char-git-sha>
#
# Rollback is the same command with an older SHA, exactly like deploy/deploy.sh:
# it goes through the same register-and-roll path as any deploy.
#
# Renders the environment's task definition template with the image for that SHA,
# registers it as a new revision, points the service at it, and waits for ECS to
# report the rollout COMPLETED. That wait includes the alarm bake period when the
# canary is enabled. It then probes /health/ready on the public URL.
#
# ECS does its own rollback. If the circuit breaker or the canary alarm fails the
# rollout, ECS returns the service to the previous revision and this script
# reports the failure, with the service events and the task logs that explain it.
#
# Under GitHub Actions it also writes a summary table to the run page and groups
# its noisier output, so a run can be understood without opening the full log.
#
# Configuration, all overridable from the environment:
#   AWS_REGION         ap-southeast-2
#   ECS_CLUSTER        kimply-prod
#   ECS_SERVICE        kimply-prod
#   ECR_REPOSITORY     kimply
#   TASK_DEF_TEMPLATE  infra/ecs/task-definition.prod.json
#   SERVICE_URL        https://ecs.kimply.online
#   LOG_GROUP          /ecs/<ECS_CLUSTER>
#   ROLLOUT_TIMEOUT    seconds to wait for the rollout, default 1800
#
# Exit codes:
#   0  deployed, rollout COMPLETED, public readiness probe passed
#   1  deploy failed. ECS rolled back or the probe failed; investigate
#   2  usage or precondition error. Nothing was changed

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
ECS_CLUSTER="${ECS_CLUSTER:-kimply-prod}"
ECS_SERVICE="${ECS_SERVICE:-kimply-prod}"
ECR_REPOSITORY="${ECR_REPOSITORY:-kimply}"
TASK_DEF_TEMPLATE="${TASK_DEF_TEMPLATE:-$REPO_ROOT/infra/ecs/task-definition.prod.json}"
SERVICE_URL="${SERVICE_URL:-https://ecs.kimply.online}"
LOG_GROUP="${LOG_GROUP:-/ecs/$ECS_CLUSTER}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-1800}"
export AWS_REGION

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 2; }

# Collapsible sections in the Actions log, plain headings elsewhere.
group()     { if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::group::$*"; else log "--- $*"; fi; }
endgroup()  { [[ -n "${GITHUB_ACTIONS:-}" ]] && echo "::endgroup::" || true; }
summary()   { [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && printf '%s\n' "$*" >> "$GITHUB_STEP_SUMMARY" || true; }

# --- Preconditions -----------------------------------------------------------
IMAGE_SHA="${1:-}"
[[ -n "$IMAGE_SHA" ]] || die "usage: $0 <full-40-char-git-sha>"
[[ "$IMAGE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "not a 40-character git SHA: '$IMAGE_SHA'"
[[ -f "$TASK_DEF_TEMPLATE" ]] || die "no task definition template at $TASK_DEF_TEMPLATE"

placeholders="$(grep -o '\${IMAGE}' "$TASK_DEF_TEMPLATE" | wc -l | tr -d ' ')"
[[ "$placeholders" == "1" ]] || die "template must contain \${IMAGE} exactly once, found $placeholders"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
IMAGE="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_SHA"

RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT

# A literal substitution of the one placeholder. Terraform renders the same file
# with templatefile(), so both produce the same task definition.
sed "s|\${IMAGE}|$IMAGE|" "$TASK_DEF_TEMPLATE" > "$RENDERED"

STARTED_AT=$(date +%s)

# --- Register and roll ---------------------------------------------------------
log "Registering a task definition revision for $IMAGE"
TASK_DEF_ARN="$(aws ecs register-task-definition \
  --cli-input-json "file://$RENDERED" \
  --query 'taskDefinition.taskDefinitionArn' --output text)"
REVISION="${TASK_DEF_ARN##*/}"
log "Registered $TASK_DEF_ARN"

log "Updating $ECS_CLUSTER/$ECS_SERVICE"
DEPLOYMENT_ID="$(aws ecs update-service \
  --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
  --task-definition "$TASK_DEF_ARN" \
  --query "service.deployments[?taskDefinition=='$TASK_DEF_ARN'] | [0].id" --output text)"
[[ -n "$DEPLOYMENT_ID" && "$DEPLOYMENT_ID" != "None" ]] || { log "ERROR: no deployment started for $TASK_DEF_ARN"; exit 1; }
log "Deployment $DEPLOYMENT_ID started"

# Everything known before the outcome, so the summary is useful even on failure.
summary "## Deploy to \`$ECS_CLUSTER\`"
summary ""
summary "| | |"
summary "|---|---|"
summary "| Revision | \`$REVISION\` |"
summary "| Image | \`$ECR_REPOSITORY:${IMAGE_SHA:0:12}\` |"
summary "| Deployment | \`$DEPLOYMENT_ID\` |"
summary "| Smoke test | $SERVICE_URL/health/ready |"

finish() {
  local outcome="$1" detail="${2:-}"
  summary "| Rollout | $outcome |"
  summary "| Duration | $(( $(date +%s) - STARTED_AT ))s |"
  [[ -n "$detail" ]] && summary "| Detail | $detail |"
  summary ""
}

# Everything the app itself said, which is usually the real reason for a failure.
dump_diagnostics() {
  group "Service events"
  aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
    --query 'services[0].events[0:10].message' --output text | tr '\t' '\n' | sed 's/^/  /'
  endgroup

  group "Task logs ($LOG_GROUP, last 15 minutes)"
  aws logs filter-log-events --log-group-name "$LOG_GROUP" \
    --start-time "$(( (STARTED_AT - 900) * 1000 ))" \
    --query 'events[-50:].message' --output text 2>/dev/null | sed 's/^/  /' \
    || echo "  (could not read $LOG_GROUP)"
  endgroup
}

# --- Wait for this deployment's own outcome -------------------------------------
# Not `aws ecs wait services-stable`: after a circuit-breaker rollback the service
# is stable again on the OLD revision, and that waiter would report success.
deadline=$(( STARTED_AT + ROLLOUT_TIMEOUT ))
group "Rollout"
while :; do
  read -r state running pending failed reason < <(aws ecs describe-services \
    --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
    --query "services[0].deployments[?id=='$DEPLOYMENT_ID'] | [0].[rolloutState, runningCount, pendingCount, failedTasks, rolloutStateReason]" \
    --output text)

  log "$state  running=$running pending=$pending failed=$failed"

  case "$state" in
    COMPLETED) endgroup; break ;;
    FAILED)
      endgroup
      log "Deploy FAILED: $reason"
      log "ECS rolls the service back to the previous revision on its own."
      dump_diagnostics
      finish "❌ FAILED" "$reason"
      exit 1
      ;;
    None | "")
      endgroup
      log "Deploy FAILED: deployment $DEPLOYMENT_ID is no longer on the service (replaced or rolled back)"
      dump_diagnostics
      finish "❌ FAILED" "deployment replaced or rolled back"
      exit 1
      ;;
  esac

  if (( $(date +%s) > deadline )); then
    endgroup
    log "Deploy FAILED: rollout still $state after ${ROLLOUT_TIMEOUT}s"
    dump_diagnostics
    finish "❌ TIMED OUT" "still $state after ${ROLLOUT_TIMEOUT}s"
    exit 1
  fi
  sleep 15
done

# --- What is actually running now -------------------------------------------------
group "Running tasks"
TASK_ARNS="$(aws ecs list-tasks --cluster "$ECS_CLUSTER" --service-name "$ECS_SERVICE" \
  --desired-status RUNNING --query 'taskArns' --output text 2>/dev/null || true)"
TASK_ROWS=""
if [[ -n "$TASK_ARNS" && "$TASK_ARNS" != "None" ]]; then
  # shellcheck disable=SC2086
  TASK_ROWS="$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks $TASK_ARNS \
    --query 'tasks[].[availabilityZone, lastStatus, healthStatus, taskDefinitionArn]' --output text 2>/dev/null || true)"
  echo "$TASK_ROWS" | sed 's/^/  /'
fi
endgroup

# --- Public probe ----------------------------------------------------------------
# Proves DNS, the ALB, a task and MongoDB Atlas together, which ECS itself cannot see.
log "Probing $SERVICE_URL"
if ! "$REPO_ROOT/scripts/health-check.sh" "$SERVICE_URL"; then
  log "Deploy FAILED: the rollout completed but $SERVICE_URL/health/ready did not pass"
  log "If the canary is enabled, its alarm will roll this back. Otherwise redeploy a known-good SHA:"
  log "  ./deploy/ecs-deploy.sh <known-good-sha>"
  dump_diagnostics
  finish "❌ FAILED" "rollout completed but the readiness probe failed"
  exit 1
fi

TASK_COUNT="$(printf '%s' "${TASK_ROWS:-}" | grep -c . || true)"
AZS="$(printf '%s' "${TASK_ROWS:-}" | awk '{print $1}' | sort -u | paste -sd', ' -)"
finish "✅ COMPLETED"
summary "$TASK_COUNT task(s) running in ${AZS:-unknown}, readiness probe passed."

log "SUCCESS: $IMAGE is live on $ECS_CLUSTER/$ECS_SERVICE"
