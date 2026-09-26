#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/tuan-ai/tce-control-center}"
ENV_FILE="${TCE_ENV_FILE:-/opt/tuan-ai/secrets/tce-app.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "HOLD_CONFIG: missing $ENV_FILE"
  exit 2
fi

if ! grep -q '^TELEGRAM_BOT_TOKEN=.' "$ENV_FILE"; then
  read -r -s -p "Paste Telegram BotFather token (hidden): " TELEGRAM_TOKEN
  echo
  if [ -z "$TELEGRAM_TOKEN" ]; then
    echo "HOLD_CONFIG: empty Telegram token"
    exit 3
  fi
  TELEGRAM_TOKEN="$TELEGRAM_TOKEN" ENV_FILE="$ENV_FILE" python3 - <<'PY'
import os
from pathlib import Path
path=Path(os.environ["ENV_FILE"])
token=os.environ["TELEGRAM_TOKEN"]
lines=path.read_text().splitlines()
out=[]
done=False
for line in lines:
    if line.startswith("TELEGRAM_BOT_TOKEN="):
        out.append("TELEGRAM_BOT_TOKEN="+token)
        done=True
    else:
        out.append(line)
if not done:
    out.append("TELEGRAM_BOT_TOKEN="+token)
path.write_text("\n".join(out).rstrip()+"\n")
path.chmod(0o600)
PY
  unset TELEGRAM_TOKEN
fi

echo "STEP 1 PASS: TELEGRAM_BOT_TOKEN SET=yes"
echo "Now open Telegram, open the new TUAN OS bot and send /start."
read -r -p "After sending /start, press Enter to continue..."

cd "$APP_ROOT"
if command -v node >/dev/null 2>&1; then
  TCE_ENV_FILE="$ENV_FILE" node scripts/ovh/configure-telegram-owner.mjs
else
  APP_IMAGE="$(docker inspect -f '{{.Config.Image}}' tce-control-center 2>/dev/null || true)"
  if [ -z "$APP_IMAGE" ]; then
    echo "HOLD_RUNTIME: host has no node and tce-control-center image cannot be resolved"
    exit 4
  fi
  docker run --rm --user 0:0 --network host \
    -v "$APP_ROOT:/app" \
    -v "$(dirname "$ENV_FILE"):$(dirname "$ENV_FILE")" \
    -w /app \
    "$APP_IMAGE" \
    node scripts/ovh/configure-telegram-owner.mjs
fi

echo "Reloading production with the updated secret file..."
bash scripts/deploy-tce-15-agents-vps.sh

echo "Verifying sanitized health signals..."
python3 - <<'PY'
import json, urllib.request
data=json.load(urllib.request.urlopen("http://127.0.0.1:3000/health", timeout=20))
signals=data.get("runtimeSignals") or {}
telegram=signals.get("telegramOwnerChannel") or {}
checks={
  "status_ok": data.get("status")=="ok",
  "runtime_vps_only": signals.get("runtimeDependencyPolicy")=="VPS_ONLY",
  "telegram_enabled": telegram.get("enabled") is True,
  "token_set": telegram.get("botTokenConfigured") is True,
  "owner_chat_set": telegram.get("ownerChatConfigured") is True,
  "webhook_secret_set": telegram.get("webhookSecretConfigured") is True,
}
for k,v in checks.items():
    print(f"{k}={'PASS' if v else 'FAIL'}")
if not all(checks.values()):
    raise SystemExit(5)
PY

echo "PASS: TUAN OS Telegram Owner Channel is ACTIVE."
