#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/tuan-ai/secrets/tce-app.env}"
STATE_DIR="${STATE_DIR:-/opt/tuan-ai/deploy-state}"
SEARCH_ROOT="${TCE_RECEPTIONIST_RECOVERY_SEARCH_ROOT:-/opt/tuan-ai}"
BACKUP_DIR="${STATE_DIR}/env-backups"
ROLLFORWARD_ID="airec-ovh-rollforward-20260924"

log() { printf '[AI Receptionist rollforward] %s\n' "$*"; }

[ -f "$ENV_FILE" ] || { log "SKIP: env file missing"; exit 0; }
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || true
chmod 600 "$ENV_FILE" || true

BACKUP_FILE="$BACKUP_DIR/tce-app.env.before-$ROLLFORWARD_ID"
if [ ! -f "$BACKUP_FILE" ]; then
  cp -p "$ENV_FILE" "$BACKUP_FILE"
  chmod 600 "$BACKUP_FILE" || true
  log "Rollback snapshot created."
fi

has_key() {
  local key="$1"
  grep -Eq "^$key=.+$" "$ENV_FILE"
}

get_value_from_file() {
  local key="$1" source="$2"
  awk -v key="$key" '
    index($0, key "=") == 1 {
      sub("^[^=]*=", "", $0)
      print $0
      exit
    }
  ' "$source" 2>/dev/null || true
}

set_key() {
  local key="$1" value="$2"
  ENV_TARGET_FILE="$ENV_FILE" ENV_TARGET_KEY="$key" ENV_TARGET_VALUE="$value" python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["ENV_TARGET_FILE"])
key = os.environ["ENV_TARGET_KEY"]
value = os.environ["ENV_TARGET_VALUE"]
lines = path.read_text().splitlines()
out = []
replaced = False
for line in lines:
    if line.startswith(key + "="):
        if not replaced:
            out.append(f"{key}={value}")
            replaced = True
        continue
    out.append(line)
if not replaced:
    out.append(f"{key}={value}")
tmp = path.with_suffix(path.suffix + ".tmp")
tmp.write_text("\n".join(out) + "\n")
os.chmod(tmp, 0o600)
tmp.replace(path)
os.chmod(path, 0o600)
PY
}

set_literal() {
  local key="$1" value="$2"
  set_key "$key" "$value"
  log "$key=SET=yes"
}

recover_key() {
  local key="$1"
  if has_key "$key"; then
    log "$key=SET=yes"
    return 0
  fi

  local source value
  while IFS= read -r source; do
    [ "$source" = "$ENV_FILE" ] && continue
    value="$(get_value_from_file "$key" "$source")"
    if [ -n "$value" ]; then
      set_key "$key" "$value"
      unset value
      log "$key=SET=yes"
      return 0
    fi
  done < <(
    {
      for root in "$SEARCH_ROOT" /root /home/tuanadmin; do
        [ -d "$root" ] || continue
        find "$root" -type f \
          \( -name '*.env' -o -name '*.env.*' -o -name '*backup*' -o -name '*secret*' \) \
          -size -2097152c \
          ! -path '*/.git/*' \
          ! -path '*/node_modules/*' \
          2>/dev/null
      done
    } | sort -u
  )

  log "$key=SET=no"
  return 1
}

# Keep all high-risk writes and non-Facebook channels fail-closed.
set_literal "AI_PILOT_ALLOWLIST_ENABLED" "true"
set_literal "AI_PILOT_OUTBOUND_ENABLED" "false"
set_literal "AI_PILOT_KIOTVIET_WRITE_ENABLED" "false"
set_literal "KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED" "false"
set_literal "TCE_CUSTOMER_CHANNEL_STAGE" "facebook_only"
set_literal "TCE_ENABLED_CUSTOMER_CHANNELS" "facebook"

# Restore approved non-secret AI Receptionist controls.
set_literal "AI_RECEPTIONIST_CONVERSATION_MODEL" "gpt-5.6-luna"
set_literal "AI_RECEPTIONIST_DAILY_BUDGET_USD" "1"
set_literal "AI_RECEPTIONIST_MONTHLY_BUDGET_USD" "10"

# Recover secrets only from files already present on the OVH host.
openai_ready=false
facebook_secrets_ready=true
recover_key "AI_RECEPTIONIST_OPENAI_API_KEY" && openai_ready=true || true
for key in FACEBOOK_APP_ID FACEBOOK_APP_SECRET FACEBOOK_PAGE_ACCESS_TOKEN FACEBOOK_VERIFY_TOKEN; do
  recover_key "$key" || facebook_secrets_ready=false
done

# Restore optional multi-page routing config when an on-host copy exists.
for key in FACEBOOK_PAGE_ACCESS_TOKENS_JSON FACEBOOK_PAGE_ENTITY_MAP_JSON FACEBOOK_LEGACY_UNSCOPED_PAGE_ID; do
  recover_key "$key" || true
done

facebook_probe=false
set_literal "FACEBOOK_PILOT_VERIFIED" "false"

if [ "$facebook_secrets_ready" = true ]; then
  set +e
  probe_result="$(
    ENV_TARGET_FILE="$ENV_FILE" python3 - <<'PY'
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlencode

env_file = Path(os.environ["ENV_TARGET_FILE"])
vals = {}
for line in env_file.read_text().splitlines():
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    k, v = line.split("=", 1)
    vals[k] = v

app_id = vals.get("FACEBOOK_APP_ID", "").strip()
app_secret = vals.get("FACEBOOK_APP_SECRET", "").strip()
page_token = vals.get("FACEBOOK_PAGE_ACCESS_TOKEN", "").strip()
page_id = vals.get("FACEBOOK_LEGACY_UNSCOPED_PAGE_ID", "").strip() or "1297673160095513"
version = vals.get("FACEBOOK_GRAPH_API_VERSION", "").strip() or "v23.0"

if not all([app_id, app_secret, page_token]):
    print("FAIL")
    raise SystemExit(0)

def fetch(url):
    try:
        req = Request(url, headers={"User-Agent": "TCE-Receptionist-Rollforward/1.0"})
        with urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

debug_q = urlencode({
    "input_token": page_token,
    "access_token": f"{app_id}|{app_secret}",
})
debug = fetch(f"https://graph.facebook.com/{version}/debug_token?{debug_q}")
data = (debug or {}).get("data") or {}
scopes = set(data.get("scopes") or [])
debug_ok = (
    data.get("is_valid") is True
    and data.get("app_id") == app_id
    and "pages_messaging" in scopes
)

me_q = urlencode({"fields": "id", "access_token": page_token})
me = fetch(f"https://graph.facebook.com/{version}/me?{me_q}")
me_ok = bool(me and str(me.get("id", "")) == page_id)

print("PASS" if debug_ok and me_ok else "FAIL")
PY
  )"
  set -e
  if [ "$probe_result" = "PASS" ]; then
    facebook_probe=true
    set_literal "FACEBOOK_PILOT_VERIFIED" "true"
    log "FACEBOOK_PROVIDER_PROBE=PASS"
  else
    log "FACEBOOK_PROVIDER_PROBE=FAIL"
  fi
else
  log "FACEBOOK_PROVIDER_PROBE=SKIP_MISSING_SECRET"
fi

if [ "$openai_ready" = true ] && [ "$facebook_probe" = true ]; then
  set_literal "AI_RECEPTIONIST_MODE" "limited_auto"
  log "PRIVATE_PILOT_READINESS=PASS_OUTBOUND_STILL_OFF"
else
  set_literal "AI_RECEPTIONIST_MODE" "simulation"
  log "PRIVATE_PILOT_READINESS=HOLD"
fi

log "Rollback file: $BACKUP_FILE"
log "No secret values were printed."
