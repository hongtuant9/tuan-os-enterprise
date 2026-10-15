# BIZ20-009 — Staging-only migration and rollback review (NOT EXECUTED)

## Preconditions
1. Owner's scope applies to isolated QA only; SECURITY_GATE_HOLD and PRODUCTION_HOLD remain.
2. Capture the exact running API image, dirty runtime source diff, full Core DB and Auth DB backups and nonsecret configuration manifest.
3. Independently test restore plus recovery of Auth issuer/audience and existing tenant/task/audit data.
4. Test on a disposable database clone with two synthetic tenants, signed auth and RLS. Do not migrate real staging or production.

## Proposed apply
Review `005_STAGING_ONLY_TENANT_SETTINGS_ATOMIC_DRAFT.sql` manually and run only against an approved disposable QA clone. Verify the new version column, new `bv_tenant_profile_audit` table, RLS read policy and `bv_update_tenant_profile_atomic` RPC. Client cannot directly UPDATE `bv_tenants`, INSERT audit or bypass RLS.

## Required tests
Owner A version1 updates A to version2 and gets Audit event; retry with version1 yields conflict, A remains version2 with one event. Concurrent Owner A submissions yield one commit and one version conflict. Staff A / Owner B against A denied. Inject audit insertion error: entire update rolls back, including version; no external side effect. Revoked membership and wrong JWT fail closed; no secrets in error/log.

## Rollback
**Preferred**: Restore full verified Core/Auth backup and previous immutable API image according to recovery runbook. Recheck tenant and audit counts, RLS and Founder grants=0.

**Schema rollback (only when no new settings changes need preservation):**
```sql
BEGIN;
REVOKE ALL ON FUNCTION public.bv_update_tenant_profile_atomic(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
DROP FUNCTION IF EXISTS public.bv_update_tenant_profile_atomic(uuid,bigint,text);
DROP TABLE IF EXISTS public.bv_tenant_profile_audit;
ALTER TABLE public.bv_tenants DROP COLUMN IF EXISTS settings_version;
COMMIT;
```
This loses settings revisions and version data. **Never run** it after live writes without approved backup/export and owner recovery decision.

## Verified so far
Source-only draft migration and API adapter created in PR #596; Node focused test suite 35/35 PASS on Mac. SQL migration not applied; PostgreSQL concurrency, audit failure, two-tenant real JWT and restore all NOT RUN. No claim of working database adapter until these are proven.
