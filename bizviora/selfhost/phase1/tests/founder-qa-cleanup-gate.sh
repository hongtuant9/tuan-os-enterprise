#!/usr/bin/env bash
# Founder QA owner-operated cleanup gate, staging only.
# This command DOES NOT grant privileges. It verifies any time-bound test has been cleaned up.
set -euo pipefail
db='bizv20-founder-staging-qa-db-1'
founder='b8ce8b92-31a5-49aa-9264-0d08abd5fc4e'
mode="${1:-check}"
case "$mode" in
  check)
    total="$(docker exec "$db" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d bizviora_phase1 -c 'SELECT count(*) FROM bv_platform_managers;')"
    own="$(docker exec "$db" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d bizviora_phase1 -c "SELECT count(*) FROM bv_platform_managers WHERE user_id='$founder';")"
    if [[ "$total" == 0 && "$own" == 0 ]]; then echo 'PASS FOUNDER_QA_ZERO_PRIVILEGES'; else echo 'FAIL FOUNDER_QA_PRIVILEGE_PRESENT'; exit 1; fi
    ;;
  *)
    echo 'Usage: founder-qa-cleanup-gate.sh check'
    exit 2
    ;;
esac
