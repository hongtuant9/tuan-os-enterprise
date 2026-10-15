#!/usr/bin/env bash
# BIZVIORA Founder staging synthetic-only watchdog.
# Must be installed, tested and separately authorized BEFORE temporary Founder grant.
# Owner-operated; no implicit grant. Per-user cron must call 'tick' once per minute.
set -euo pipefail
umask 077
DB='bizv20-founder-staging-qa-db-1'
FOUNDER='b8ce8b92-31a5-49aa-9264-0d08abd5fc4e'
HOME_STATE="$HOME/.local/state/bizviora-founder-qa"
STATE="$HOME_STATE/deadline"
LOCK="$HOME_STATE/lock"
mkdir -p "$HOME_STATE"; chmod 700 "$HOME_STATE"
exec 9>"$LOCK"; flock -w 5 9
count(){ docker exec "$DB" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d bizviora_phase1 -c 'SELECT count(*) FROM bv_platform_managers;'; }
revoke(){
  # Never delete other users; fail closed if someone else has a grant.
  docker exec "$DB" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d bizviora_phase1 \
    -c "DELETE FROM bv_platform_managers WHERE user_id='$FOUNDER';" >/dev/null
  [[ "$(count)" == '0' ]] || { echo 'FAIL OTHER_PLATFORM_GRANTS_PRESENT'; exit 1; }
  rm -f "$STATE"
  echo 'PASS FOUNDER_PRIVILEGES_ZERO'
}
case "${1:-}" in
 arm)
   [[ "$(count)" == '0' ]] || { echo 'FAIL GRANTS_NOT_ZERO'; exit 1; }
   [[ ! -e "$STATE" ]] || { echo 'FAIL ALREADY_ARMED'; exit 1; }
   # Deadline is UTC epoch seconds; eight minutes, checked by independent cron.
   deadline=$(( $(date -u +%s) + 480 ))
   printf '%s\n' "$deadline" >"$STATE.tmp"
   mv "$STATE.tmp" "$STATE"
   echo 'ARMED_EIGHT_MINUTES; NO_PRIVILEGES_GRANTED'
   ;;
 tick)
   [[ -f "$STATE" ]] || exit 0
   read -r deadline <"$STATE"
   [[ "$deadline" =~ ^[0-9]{10,11}$ ]] || { echo 'FAIL_INVALID_DEADLINE'; exit 1; }
   if (( $(date -u +%s) >= deadline )); then revoke; fi
   ;;
 revoke) revoke;;
 status)
   if [[ -f "$STATE" ]]; then echo 'ARMED'; else echo 'DISARMED'; fi
   [[ "$(count)" == '0' ]] && echo 'GRANTS_ZERO' || echo 'GRANT_ACTIVE_OR_UNEXPECTED'
   ;;
 *) echo 'Usage: founder-qa-watchdog.sh arm|tick|revoke|status';exit 2;;
esac
