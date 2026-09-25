#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/tuan-ai/secrets/tce-app.env}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-/opt/tuan-ai/tce-control-center/scripts/deploy-tce-15-agents-vps.sh}"

if [ "$(id -u)" -ne 0 ]; then
  echo "[Trello config] HOLD — cần quyền root để cập nhật secret store."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[Trello config] FAIL — không tìm thấy env file chuẩn."
  exit 1
fi

read -r -s -p "Trello API Key: " TRELLO_API_KEY_INPUT
printf '\n'
read -r -s -p "Trello Token: " TRELLO_TOKEN_INPUT
printf '\n'

if [ -z "$TRELLO_API_KEY_INPUT" ] || [ -z "$TRELLO_TOKEN_INPUT" ]; then
  echo "[Trello config] FAIL — thiếu credential."
  exit 1
fi

BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

printf '%s\n%s\n' "$TRELLO_API_KEY_INPUT" "$TRELLO_TOKEN_INPUT" | python3 -c '
import os, sys
path = sys.argv[1]
api_key = sys.stdin.readline().rstrip("\n")
token = sys.stdin.readline().rstrip("\n")
with open(path, "r", encoding="utf-8") as f:
    lines = f.read().splitlines()
updates = {
    "TRELLO_API_KEY": api_key,
    "TRELLO_TOKEN": token,
    "TRELLO_BOARD_ID": "6aa89e205549d35a039608ab",
    "TCE_TRELLO_WORKER_ENABLED": "true",
    "TCE_TRELLO_WORKER_INTERVAL_MS": "300000",
}
seen = set()
out = []
for line in lines:
    key = line.split("=",1)[0] if "=" in line else ""
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
os.chmod(tmp, 0o600)
os.replace(tmp, path)
' "$ENV_FILE"

unset TRELLO_API_KEY_INPUT TRELLO_TOKEN_INPUT
chmod 600 "$ENV_FILE"

for key in TRELLO_API_KEY TRELLO_TOKEN TRELLO_BOARD_ID TCE_TRELLO_WORKER_ENABLED TCE_TRELLO_WORKER_INTERVAL_MS; do
  if grep -Eq "^${key}=.+" "$ENV_FILE"; then
    echo "${key}: SET=yes"
  else
    echo "${key}: SET=no"
  fi
done

echo "[Trello config] Secret write PASS. Backup đã tạo; không in giá trị secret."

if [ -x "$DEPLOY_SCRIPT" ] || [ -f "$DEPLOY_SCRIPT" ]; then
  echo "[Trello config] Chạy canonical deploy để nạp env mới + candidate health + rollback protection."
  ENV_FILE="$ENV_FILE" bash "$DEPLOY_SCRIPT"
else
  echo "[Trello config] HOLD — chưa tìm thấy deploy script chuẩn; không restart thủ công."
  exit 2
fi

echo "[Trello config] Xác minh runtime sau deploy."
if docker inspect tce-control-center --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | grep -qx 'TRELLO_API_KEY'; then
  echo "TRELLO_API_KEY(runtime): SET=yes"
else
  echo "TRELLO_API_KEY(runtime): SET=no"
fi
if docker inspect tce-control-center --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | grep -qx 'TRELLO_TOKEN'; then
  echo "TRELLO_TOKEN(runtime): SET=yes"
else
  echo "TRELLO_TOKEN(runtime): SET=no"
fi
HEALTH="$(curl -fsS http://127.0.0.1:3000/health 2>/dev/null || true)"
MIRROR="$(printf '%s' "$HEALTH" | sed -n 's/.*"trelloExecutionMirror":"\([^"]*\)".*/\1/p')"
echo "trelloExecutionMirror=${MIRROR:-UNKNOWN}"
if [ "$MIRROR" != "ACTIVE" ]; then
  echo "[Trello config] HOLD — credential đã nhập nhưng runtime chưa ACTIVE."
  exit 3
fi
echo "[Trello config] PASS — Trello runtime ACTIVE."
