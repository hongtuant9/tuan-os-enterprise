#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

REPO_URL="${REPO_URL:-https://github.com/hongtuant9/tuan-os-enterprise.git}"
BRANCH="${MAIN_BRANCH:-main}"
APP_ROOT="${APP_ROOT:-/opt/tuan-ai/tce-control-center}"
SECRETS_DIR="${SECRETS_DIR:-/opt/tuan-ai/secrets}"
STATE_DIR="${STATE_DIR:-/opt/tuan-ai/deploy-state}"
CADDY_DIR="${CADDY_DIR:-/opt/tuan-ai/caddy}"

echo "[OVH bootstrap] installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ufw fail2ban docker.io

systemctl enable --now docker
systemctl enable --now fail2ban

mkdir -p "$SECRETS_DIR" "$STATE_DIR" "$CADDY_DIR"
chmod 700 "$SECRETS_DIR"

if [ ! -d "$APP_ROOT/.git" ]; then
  rm -rf "$APP_ROOT"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_ROOT"
else
  cd "$APP_ROOT"
  git fetch origin "$BRANCH" --prune
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

install -m 0644 "$APP_ROOT/scripts/ovh/Caddyfile" "$CADDY_DIR/Caddyfile"
install -m 0644 "$APP_ROOT/scripts/ovh/tce-autodeploy.service" /etc/systemd/system/tce-autodeploy.service
install -m 0644 "$APP_ROOT/scripts/ovh/tce-autodeploy.timer" /etc/systemd/system/tce-autodeploy.timer
chmod +x "$APP_ROOT/scripts/ovh/"*.sh "$APP_ROOT/scripts/deploy-tce-15-agents-vps.sh"

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

docker volume create tce_caddy_data >/dev/null
docker volume create tce_caddy_config >/dev/null
docker ps -aq --filter "ancestor=caddy:2-alpine" | xargs -r docker rm -f >/dev/null 2>&1 || true
docker rm -f tce-caddy >/dev/null 2>&1 || true

docker run -d \
  --name tce-caddy \
  --restart unless-stopped \
  --network host \
  -v "$CADDY_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v tce_caddy_data:/data \
  -v tce_caddy_config:/config \
  caddy:2-alpine >/dev/null

systemctl daemon-reload
systemctl enable --now tce-autodeploy.timer

if [ -s "$SECRETS_DIR/tce-app.env" ]; then
  systemctl start tce-autodeploy.service
fi

echo "[OVH bootstrap] PASS"
echo "[OVH bootstrap] Autodeploy timer is active; if the env file is present, the first deployment has been triggered."
echo "[OVH bootstrap] After local /health PASS, change only the Tenten A record for app to 57.128.186.45."
