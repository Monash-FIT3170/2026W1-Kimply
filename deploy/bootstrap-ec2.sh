#!/usr/bin/env bash
#
# One-time setup for a fresh Ubuntu 24.04 arm64 EC2 instance.
#
# Run once, as root, over SSM Session Manager (there is no SSH port open):
#   aws ssm start-session --target <instance-id>
#   sudo bash /tmp/bootstrap-ec2.sh
#
# Idempotent: safe to re-run.

set -Eeuo pipefail

APP_DIR=/opt/kimply
SWAP_FILE=/swapfile
SWAP_SIZE_MB=4096

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
trap 'log "FAILED at line $LINENO"' ERR

[[ $EUID -eq 0 ]] || die "must run as root (use sudo)"

ARCH="$(dpkg --print-architecture)"
log "Architecture: $ARCH"
[[ "$ARCH" == "arm64" ]] || log "WARNING: expected arm64 (t4g). Images are built for linux/arm64 only."

# --- Base packages -----------------------------------------------------------
log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg unzip cron

# --- Docker ------------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  log "Docker already installed: $(docker --version)"
else
  log "Installing Docker CE"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# --- AWS CLI v2 --------------------------------------------------------------
# Required by deploy/deploy.sh for `aws ecr get-login-password`. Ubuntu does not
# ship AWS CLI v2, and the v1 in apt cannot do ECR auth the same way.
if command -v aws >/dev/null 2>&1; then
  log "AWS CLI already installed: $(aws --version 2>&1)"
else
  log "Installing AWS CLI v2 (aarch64)"
  tmp="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "$tmp/awscliv2.zip"
  unzip -q "$tmp/awscliv2.zip" -d "$tmp"
  "$tmp/aws/install"
  rm -rf "$tmp"
fi

# --- SSM agent ---------------------------------------------------------------
# This is what replaces SSH. Canonical's AWS images ship it, but make sure.
if snap list amazon-ssm-agent >/dev/null 2>&1; then
  snap start amazon-ssm-agent 2>/dev/null || true
  log "SSM agent present (snap)"
elif systemctl list-unit-files | grep -q amazon-ssm-agent; then
  systemctl enable --now amazon-ssm-agent
  log "SSM agent present (systemd)"
else
  log "WARNING: no SSM agent found. Without it you have no shell access, since no SSH port is open."
fi

# --- Swap --------------------------------------------------------------------
# Insurance only. Builds happen on a developer machine and are pulled from ECR,
# so nothing here should need swap - but a 4 GB instance with no swap turns any
# memory spike into an OOM kill.
if swapon --show | grep -q "$SWAP_FILE"; then
  log "Swap already active"
else
  log "Creating ${SWAP_SIZE_MB}MB swap file"
  fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB"
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE" >/dev/null
  swapon "$SWAP_FILE"
  grep -q "^$SWAP_FILE" /etc/fstab || echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  # Prefer RAM; only reach for swap under real pressure.
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

# --- Application directory ---------------------------------------------------
log "Preparing $APP_DIR"
mkdir -p "$APP_DIR"
chown root:root "$APP_DIR"
chmod 755 "$APP_DIR"

if [[ -f "$APP_DIR/.env" ]]; then
  chown root:root "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  log ".env permissions enforced: $(stat -c '%a %U:%G' "$APP_DIR/.env")"
else
  log "NOTE: $APP_DIR/.env does not exist yet."
  log "      Create it from .env.production.example with: umask 077"
fi

# --- Certificate renewal -----------------------------------------------------
# certbot no-ops unless the certificate is within 30 days of expiry, so a daily
# run is correct and cheap. nginx -t runs before the reload so a broken config
# can never be loaded by the cron job.
CRON_FILE=/etc/cron.d/kimply-certbot-renew
log "Installing certificate renewal cron at $CRON_FILE"
cat > "$CRON_FILE" <<EOF
# Kimply: renew the Let's Encrypt certificate and reload nginx.
# Installed by deploy/bootstrap-ec2.sh - do not edit by hand.
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
0 3 * * * root cd $APP_DIR && docker compose -f docker-compose.prod.yml --env-file .env run --rm certbot renew --webroot -w /var/www/certbot --quiet && docker compose -f docker-compose.prod.yml --env-file .env exec -T nginx nginx -t && docker compose -f docker-compose.prod.yml --env-file .env exec -T nginx nginx -s reload >> /var/log/kimply-certbot.log 2>&1
EOF
chmod 644 "$CRON_FILE"

# --- Log rotation for the deploy/certbot log ---------------------------------
cat > /etc/logrotate.d/kimply <<'EOF'
/var/log/kimply-*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
EOF

# --- Summary -----------------------------------------------------------------
cat <<EOF

--------------------------------------------------------------------
Bootstrap complete.

  docker          $(docker --version 2>/dev/null)
  docker compose  $(docker compose version --short 2>/dev/null)
  aws             $(aws --version 2>&1)
  swap            $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')

Next:
  1. Copy docker-compose.prod.yml, nginx/, deploy/ and scripts/ into $APP_DIR
     (the application source is NOT needed on this instance).
  2. Create $APP_DIR/.env from .env.production.example, using: umask 077
     Verify with: stat -c '%a %U:%G' $APP_DIR/.env   -> 600 root:root
  3. $APP_DIR/deploy/init-letsencrypt.sh --dry-run
  4. $APP_DIR/deploy/init-letsencrypt.sh
  5. $APP_DIR/deploy/deploy.sh <commit-sha>
--------------------------------------------------------------------
EOF
