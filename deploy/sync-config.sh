#!/usr/bin/env bash
#
# Push deployment CONFIGURATION to the instance.
#
# Kimply has two separate delivery channels, and confusing them is the easiest
# mistake to make here:
#
#   app/ source          -> build-push.sh -> ECR -> deploy.sh -> container
#   nginx/, deploy/,     -> THIS SCRIPT   -> /opt/kimply/
#   scripts/, compose
#
# deploy.sh only swaps the application image. It will never notice a change to
# nginx config, the compose file, or the deploy scripts - those changes sit on
# your laptop until this script sends them.
#
#   ./deploy/sync-config.sh              # sync, then reload nginx if its config changed
#   ./deploy/sync-config.sh --dry-run    # show what would change, send nothing
#   ./deploy/sync-config.sh --no-reload  # sync only, do not touch running containers
#
# The application source is deliberately never copied. The box has no source and
# no build tooling; it only runs prebuilt images.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_HOST="${SSH_HOST:-kimply}"
REMOTE_DIR="${REMOTE_DIR:-/opt/kimply}"
SSH_OPTS="${SSH_OPTS:--o ConnectTimeout=45}"

DRY_RUN=0
RELOAD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=1; shift ;;
    --no-reload) RELOAD=0; shift ;;
    -h|--help)   sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 2; }
trap 'log "FAILED at line $LINENO"' ERR

cd "$REPO_ROOT"

# Everything that belongs on the instance. Note the absence of app/.
PAYLOAD=(docker-compose.prod.yml nginx deploy scripts)
for p in "${PAYLOAD[@]}"; do
  [[ -e "$p" ]] || die "missing $p in $REPO_ROOT"
done

log "Target: $SSH_HOST:$REMOTE_DIR"
ssh $SSH_OPTS "$SSH_HOST" true 2>/dev/null || die "cannot reach $SSH_HOST over SSH (is the SSM tunnel working?)"

# --- What would change -------------------------------------------------------
# Always show the diff first. Silent config pushes are how a box quietly drifts
# from the repo.
#
# --exclude '.env' is critical: the instance's .env holds the live Atlas
# credential and must never be overwritten by a local file, nor deleted by
# --delete.
#
# --no-owner --no-group matters for readability, not correctness. `rsync -a`
# preserves the local uid/gid (501:staff on macOS), which never matches the
# instance's root:root - so without these every file reports as changed on every
# run, and a genuine change is invisible in the noise. Ownership is set
# explicitly after the sync anyway.
RSYNC_COMMON=(
  -a --no-owner --no-group --omit-dir-times --itemize-changes
  --exclude '.env'
  --exclude '.DS_Store'
  --exclude '__pycache__'
  -e "ssh $SSH_OPTS"
  --rsync-path="sudo rsync"
)

log "Changes to be applied:"
CHANGES="$(rsync "${RSYNC_COMMON[@]}" --dry-run "${PAYLOAD[@]}" "$SSH_HOST:$REMOTE_DIR/" \
           | grep -vE '^(sending|sent |total |$|\./)' || true)"

if [[ -z "$CHANGES" ]]; then
  log "  (none - the instance already matches this checkout)"
else
  printf '%s\n' "$CHANGES" | sed 's/^/    /'
fi

if [[ $DRY_RUN -eq 1 ]]; then
  log "Dry run, nothing sent."
  exit 0
fi

if [[ -z "$CHANGES" ]]; then
  log "Nothing to do."
  exit 0
fi

# --- Send --------------------------------------------------------------------
log "Syncing"
rsync "${RSYNC_COMMON[@]}" "${PAYLOAD[@]}" "$SSH_HOST:$REMOTE_DIR/" >/dev/null

# rsync -a preserves the local uid/gid, which do not exist on the instance and
# would leave root-owned directories owned by a stray numeric id.
log "Fixing ownership and permissions"
ssh $SSH_OPTS "$SSH_HOST" "sudo bash -s" <<EOF
set -e
chown -R root:root $REMOTE_DIR
chmod 755 $REMOTE_DIR
chmod +x $REMOTE_DIR/deploy/*.sh $REMOTE_DIR/scripts/*.sh
[ -f $REMOTE_DIR/.env ] && chmod 600 $REMOTE_DIR/.env && chown root:root $REMOTE_DIR/.env
EOF

# --- Reload nginx if its configuration moved ---------------------------------
if [[ $RELOAD -eq 1 ]] && printf '%s\n' "$CHANGES" | grep -qE 'nginx/'; then
  log "nginx config changed - validating before reloading"
  # Validate first, always. A reload against a broken config takes the site down;
  # a failed `nginx -t` costs nothing.
  if ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && sudo docker compose -f docker-compose.prod.yml --env-file .env exec -T nginx nginx -t" 2>&1 | tail -2; then
    log "Reloading nginx"
    ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && sudo docker compose -f docker-compose.prod.yml --env-file .env exec -T nginx nginx -s reload" >/dev/null
    log "nginx reloaded"
  else
    die "nginx -t FAILED. Config is on the box but NOT loaded; the running config is unchanged and the site is still up. Fix and re-run."
  fi
  # A changed template needs a container restart, not a reload: templates are
  # rendered by the entrypoint at container start, so a reload re-reads the OLD
  # rendered output and the change appears to do nothing.
  if printf '%s\n' "$CHANGES" | grep -qE 'nginx/templates/'; then
    log "NOTE: a template under nginx/templates/ changed."
    log "      Templates are rendered by the entrypoint at container START, so a"
    log "      reload is not enough. Recreate nginx to pick it up:"
    log "        ssh $SSH_HOST 'cd $REMOTE_DIR && sudo docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate nginx'"
  fi
elif [[ $RELOAD -eq 1 ]]; then
  log "No nginx config change; nothing to reload."
fi

log "Done."
log "Remember: this syncs CONFIG only. Application changes under app/ need:"
log "  ./deploy/build-push.sh   then   sudo $REMOTE_DIR/deploy/deploy.sh <sha>"
