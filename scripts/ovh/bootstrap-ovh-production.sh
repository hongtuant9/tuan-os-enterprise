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

# Foundation used a bridge-network Caddy container. Stop any legacy Caddy
# before the canonical host-network Caddy takes ownership of :80/:443.
legacy_caddies="$(docker ps --format '{{.Names}}' | grep -E '(^|[-_])caddy([-_]|$)' | grep -v '^tce-caddy$' || true)"
if [ -n "$legacy_caddies" ]; then
  echo "[OVH bootstrap] stopping legacy Caddy container(s): $legacy_caddies"
  # shellcheck disable=SC2086
  docker stop $legacy_caddies >/dev/null || true
fi

docker rm -f tce-caddy >/dev/null 2>&1 || true
docker run -d   --name tce-caddy   --restart unless-stopped   --network host   -v "$CADDY_DIR/Caddyfile:/etc/caddy/Caddyfile:ro"   -v tce_caddy_data:/data   -v tce_caddy_config:/config   caddy:2-alpine >/dev/null

systemctl daemon-reload

ENV_FILE="$SECRETS_DIR/tce-app.env"
if [ -f "$ENV_FILE" ]; then
  ENV_FILE="$ENV_FILE" "$APP_ROOT/scripts/ovh/preflight-env.sh"
  systemctl start tce-autodeploy.service
  systemctl enable --now tce-autodeploy.timer
  echo "[OVH bootstrap] app deploy + autodeploy timer PASS"
else
  systemctl enable tce-autodeploy.timer
  echo "[OVH bootstrap] env missing; app deploy held fail-closed"
fi

echo "[OVH bootstrap] PASS"
echo "[OVH bootstrap] After local /health PASS, change only the Tenten A record for app to 57.128.186.45."
