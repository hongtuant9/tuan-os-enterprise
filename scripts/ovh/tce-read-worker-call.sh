#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
ENV_FILE="${ENV_FILE:-/opt/tuan-ai/secrets/tce-app.env}"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"

case "$MODE" in
  finance)
    ENDPOINT="/api/internal/finance/kiotviet-finance-bot/worker"
    HEADER="x-tce-kiotviet-finance-bot-worker-token"
    SALT="kiotviet-finance-bot-worker-v1"
    ;;
  inventory)
    ENDPOINT="/api/internal/operations/kiotviet-inventory-bot/worker"
    HEADER="x-tce-kiotviet-inventory-bot-worker-token"
    SALT="kiotviet-inventory-bot-worker-v1"
    ;;
  *)
    echo "[TCE read worker] invalid mode"
    exit 2
    ;;
esac

[ -r "$ENV_FILE" ] || { echo "[TCE read worker] env file unavailable"; exit 1; }

TOKEN="$(python3 - "$ENV_FILE" "$SALT" <<'PY'
import hashlib, sys
path, salt = sys.argv[1], sys.argv[2]
secret = None
with open(path, "r", encoding="utf-8") as fh:
    for raw in fh:
        line = raw.rstrip("\n")
        if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            secret = line.split("=", 1)[1].strip()
            break
if not secret:
    raise SystemExit(3)
print(hashlib.sha256(f"{secret}:{salt}".encode()).hexdigest())
PY
)"

tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

http_code="$(curl -sS   --max-time 240   -o "$tmp"   -w '%{http_code}'   -X POST   -H "$HEADER: $TOKEN"   "$APP_URL$ENDPOINT" || true)"

if [ "$http_code" != "200" ]; then
  echo "[TCE read worker] mode=$MODE http=$http_code state=FAIL"
  exit 1
fi

python3 - "$MODE" "$tmp" <<'PY'
import json, sys
mode, path = sys.argv[1], sys.argv[2]
try:
    data = json.load(open(path, "r", encoding="utf-8"))
except Exception:
    print(f"[TCE read worker] mode={mode} state=BAD_JSON")
    raise SystemExit(1)
parts = []
for item in data.get("results", []) or []:
    system = item.get("system", "?")
    state = item.get("state", "?")
    if mode == "finance":
        cb = item.get("cashbook") or {}
        rec = cb.get("reconciliation") or {}
        parts.append(
            f"{system}:{state}:rows={item.get('rowCount',0)}:"
            f"cashbook={cb.get('reportedTotalRows','?')}:"
            f"reconciled={rec.get('verified',False)}"
        )
    else:
        parts.append(
            f"{system}:{state}:modules={item.get('verifiedModules',0)}/{item.get('moduleCount',0)}"
        )
print(f"[TCE read worker] mode={mode} ok={data.get('ok', False)} " + " | ".join(parts))
PY
