#!/usr/bin/env bash
# Read-only OVH Founder QA DB evidence. Requires a completed authenticated HTTP E2E.
set -euo pipefail
suffix="${1:-}"
if [[ ! "$suffix" =~ ^[0-9a-f]{12}$ ]]; then
  echo 'USAGE: founder-ovh-audit-verify.sh <12-hex-qa-run-id>'
  exit 2
fi
db=bizv20-founder-staging-qa-db-1
approved="bvqa-a-$suffix"
rejected="bvqa-b-$suffix"
result="$(docker exec "$db" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d bizviora_phase1 \
  -v approved="$approved" -v rejected="$rejected" <<'SQL'
BEGIN READ ONLY;
WITH apps AS (
 SELECT * FROM bv_company_applications
 WHERE requested_slug IN (:'approved',:'rejected')
), a AS (SELECT * FROM apps WHERE requested_slug=:'approved'),
 b AS (SELECT * FROM apps WHERE requested_slug=:'rejected')
SELECT CASE WHEN
 (SELECT count(*) FROM apps)=2
 AND (SELECT count(*) FROM a WHERE status='APPROVED' AND tenant_id IS NOT NULL)=1
 AND (SELECT count(*) FROM b WHERE status='REJECTED' AND tenant_id IS NULL)=1
 AND (SELECT count(*) FROM bv_tenants t JOIN a ON a.tenant_id=t.id WHERE t.slug=:'approved')=1
 AND (SELECT count(*) FROM bv_memberships m JOIN a ON a.tenant_id=m.tenant_id AND a.applicant_user_id=m.user_id)=1
 AND (SELECT count(*) FROM bv_memberships m JOIN b ON b.applicant_user_id=m.user_id AND m.tenant_id=b.tenant_id)=0
 AND (SELECT count(*) FROM bv_company_audit e JOIN apps ON e.application_id=apps.id)>=4
 THEN 'PASS' ELSE 'FAIL' END;
COMMIT;
SQL
)"
if [[ "$(printf '%s\n' "$result" | grep -xc PASS || true)" != 1 ]]; then
 echo 'FAIL OVH_FOUNDER_DB_AUDIT_INVARIANTS'
 exit 1
fi
echo 'PASS OVH_FOUNDER_DB_AUDIT_INVARIANTS'
echo 'NOTE: Read-only DB verification is not a substitute for application-level RLS tests.'
