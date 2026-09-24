#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/tuan-ai/secrets/tce-app.env}"

# Runtime env is injected when Docker creates the container. After an approved env-only change,
# use the canonical deploy flow so candidate health checks and rollback protections still apply.

if [ ! -f "$ENV_FILE" ]; then
  echo "[OVH preflight] MISSING env file: $ENV_FILE"
  exit 1
fi


required=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
)

missing=()
for key in "${required[@]}"; do
  if ! grep -Eq "^${key}=.+" "$ENV_FILE"; then
    missing+=("$key")
  fi
done

if ! grep -Eq '^APP_URL=https://app\.tamcocexperience\.com/?$' "$ENV_FILE" \
  && ! grep -Eq '^NEXT_PUBLIC_APP_URL=https://app\.tamcocexperience\.com/?$' "$ENV_FILE"; then
  missing+=("APP_URL_or_NEXT_PUBLIC_APP_URL=https://app.tamcocexperience.com")
fi

for key in TCE_COMPANY_AUTOPILOT_ENABLED TCE_EXECUTIVE_WORKER_ENABLED TCE_SYNC_WORKER_ENABLED TCE_STAFF_OPS_WORKER_ENABLED CMI_BROWSER_ENABLED CMI_QUEUE_WORKER_ENABLED; do
  if grep -Eqi "^${key}=false$" "$ENV_FILE"; then
    missing+=("${key}=must_not_be_false")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "[OVH preflight] FAIL — missing required configuration names:"
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi

echo "[OVH preflight] PASS — required production configuration is present."
echo "[OVH preflight] Secret values were not printed."
