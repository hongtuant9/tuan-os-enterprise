#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/tuan-ai/tce-control-center}"
STATE_DIR="${STATE_DIR:-/opt/tuan-ai/deploy-state}"
REPO_URL="${REPO_URL:-https://github.com/hongtuant9/tuan-os-enterprise.git}"
BRANCH="${MAIN_BRANCH:-main}"
DEPLOY_SCRIPT="${APP_ROOT}/scripts/deploy-tce-15-agents-vps.sh"
PREFLIGHT_SCRIPT="${APP_ROOT}/scripts/ovh/preflight-env.sh"

mkdir -p "$APP_ROOT" "$STATE_DIR"

if [ ! -d "$APP_ROOT/.git" ]; then
  rm -rf "$APP_ROOT"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_ROOT"
fi

remote_sha="$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" | awk '{print $1}')"
[ -n "$remote_sha" ] || { echo "[OVH autodeploy] cannot resolve remote SHA"; exit 1; }
remote_short="${remote_sha:0:12}"
current_sha="$(cat "$STATE_DIR/current-sha" 2>/dev/null || true)"

if [ "$current_sha" = "$remote_short" ]; then
  echo "[OVH autodeploy] no change sha=$remote_short"
  exit 0
fi

cd "$APP_ROOT"
git fetch origin "$BRANCH" --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

bash "$PREFLIGHT_SCRIPT"

echo "[OVH autodeploy] deploying sha=$remote_short"
bash "$DEPLOY_SCRIPT"

caddy_ids="$(docker ps -q --filter label=com.docker.compose.service=caddy || true)"
if [ -n "$caddy_ids" ]; then
  docker restart $caddy_ids >/dev/null
  echo "[OVH autodeploy] reloaded existing Caddy container(s)"
fi

echo "[OVH autodeploy] PASS sha=$remote_short"
