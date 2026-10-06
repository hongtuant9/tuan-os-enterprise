#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
FROM_DATE="${2:-}"
TO_DATE="${3:-}"
ENV_FILE="${ENV_FILE:-/opt/tuan-ai/secrets/tce-app.env}"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"

case "$MODE" in
  finance|finance-expense-probe|finance-expense-backfill)
    ENDPOINT="/api/internal/finance/kiotviet-finance-bot/worker"
    HEADER="x-tce-kiotviet-finance-bot-worker-token"
    SALT="kiotviet-finance-bot-worker-v1"
    ;;
  inventory)
    ENDPOINT="/api/internal/operations/kiotviet-inventory-bot/worker"
    HEADER="x-tce-kiotviet-inventory-bot-worker-token"
    SALT="kiotviet-inventory-bot-worker-v1"
    ;;
  reception-ota)
    ENDPOINT="/api/internal/tce/ota-email/worker"
    HEADER="x-tce-ota-email-worker-token"
    SALT="tce-ota-email-worker-v1"
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


BODY_ARGS=()
if [ "$MODE" = "finance-expense-probe" ] || [ "$MODE" = "finance-expense-backfill" ]; then
  if ! [[ "$FROM_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$TO_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "[TCE read worker] mode=$MODE state=INVALID_DATE_RANGE"
    exit 2
  fi
  worker_mode="expense_probe"
  [ "$MODE" = "finance-expense-backfill" ] && worker_mode="expense_backfill"
  BODY_ARGS=(-H "Content-Type: application/json" --data "{\"mode\":\"$worker_mode\",\"from\":\"$FROM_DATE\",\"to\":\"$TO_DATE\"}")
fi

tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

http_code="$(curl -sS   --max-time 240   -o "$tmp"   -w '%{http_code}'   -X POST   -H "$HEADER: $TOKEN"   "${BODY_ARGS[@]}"   "$APP_URL$ENDPOINT" || true)"

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
if mode == "reception-ota":
    print(
        f"[TCE read worker] mode={mode} ok={data.get('ok', False)} "
        f"configured={data.get('configured', False)} mailboxes={data.get('mailboxesConfigured',0)} "
        f"scanned={data.get('scanned',0)} actionable={data.get('actionable',0)} "
        f"drafted={data.get('drafted',0)} duplicates={data.get('duplicates',0)} failed={data.get('failed',0)} "
        f"direct_enabled={data.get('directReceiveEnabled',False)} direct_scanned={data.get('directScanned',0)} "
        f"direct_drafted={data.get('directDrafted',0)} direct_duplicates={data.get('directDuplicates',0)} "
        f"direct_filtered={data.get('directFiltered',0)}"
    )
else:
    if mode in ("finance-expense-probe", "finance-expense-backfill"):
        x = data.get("expenseActualSync") or {}
        states = ",".join(
            f"{item.get('system')}:{item.get('kind')}={item.get('state')}:{item.get('fetched')}/{item.get('expected')}"
            for item in (x.get("sourceStates") or [])
        )
        preview = x.get("previewByUnitCategory") or {}
        preview_text = ";".join(
            f"{k}:count={v.get('count',0)}:amount={v.get('amount',0)}" for k,v in sorted(preview.items())
        ) or "none"
        print(
            f"[TCE read worker] mode={mode} ok={data.get('ok', False)} state={x.get('state','?')} "
            f"dry_run={x.get('dryRun',False)} range={x.get('from','?')}..{x.get('to','?')} "
            f"candidate_rows={x.get('candidateRows',0)} upserted={x.get('upserted',0)} "
            f"excluded_non_pnl={x.get('excludedNonPnl',0)} unmapped_pnl={x.get('unmappedPnl',0)} held_review={x.get('heldReview',0)} "
            f"sources=[{states}] preview=[{preview_text}]"
        )
        raise SystemExit(0)
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
