# Founder OVH JWT E2E — QA execution gate (synthetic only)

**Status:** PREPARED, NOT EXECUTED WITH LIVE JWT. Production HOLD.

Environment: isolated OVH Compose project `bizv20-founder-staging-qa`, Keycloak loopback 18103, Core loopback 18104, PostgreSQL database `bizviora_phase1`. Never use old standalone QA project, production database, customer data or Keycloak `master` admin account for application login.

## Mandatory gates before temporarily granting access
1. Verify exact QA identities in realm `bizviora-phase1`, using DB read-only check and Keycloak GUI. Founder: `b8ce8b92-31a5-49aa-9264-0d08abd5fc4e`; Applicant A: `0c6e0568-2aa0-4283-8c64-50f7d4c462d7`; Applicant B: `15b42f7e-95ea-4b6e-aa83-6cdc6aac0f3a`.
2. `SELECT count(*) FROM bv_platform_managers;` must return **0** before the run.
3. Confirm Core `GET /health` HTTP 200, Keycloak realm discovery HTTP 200, and **no JWT** `GET /v1/founder/access` HTTP 401.
4. Obtain **three short-lived signed JWTs** via each user's interactive, authorized Keycloak browser login, using a correctly configured public OIDC client and PKCE. Only provide tokens to local process memory; **never paste them in chat, shell command history, repository, Google Drive, logs or URL query parameters**. The mechanism for local token handoff is NOT IMPLEMENTED; do not grant Founder privilege until it is installed and verified. Avoid Direct Access Grant/password-based admin shortcuts.
5. Explicit owner/authorized DBA approval applies only to synthetic staging and precisely the Founder QA UUID. No production changes.

## Live run after safe browser-token handoff becomes available
- Check all three JWTs correspond to intended `sub` and issuer/audience, with short expiry, **without printing token bytes** (future enhancement required).
- Owner-authorized DBA temporarily grants exactly one `bv_platform_managers` row for Founder QA UUID using trusted local SQL. Verify row count exactly 1. This is an L3 scoped action; do not automate by circumventing blocked tool calls.
- Run `node bizviora/selfhost/phase1/tests/founder-ovh-jwt.e2e.mjs execute` locally against SSH tunnel `127.0.0.1:18104` with bearer tokens passed via ephemeral local environment, never logged. It tests 401/403/200, applicant A and B submissions, Founder approve A/reject B, replay denial, applicant list isolation.
- Capture only `QA_RUN_ID` (12 lowercase hex), status codes, and sanitized failure names. On **VPS**, run `bash bizviora/selfhost/phase1/tests/founder-ovh-audit-verify.sh <QA_RUN_ID>` to inspect persisted audit, tenant activation and memberships. This is read-only; no mutation.
- Independently check owner A tenant context and B access denial using signed user JWT once the tenant ID and expected API schema are verified; absent that step, mark `TENANT_HTTP_RLS_HOLD`, not PASS.

## Mandatory cleanup / stop condition
On **every** test outcome (PASS, FAIL, timeout or interruption), owner-authorized DBA promptly removes only `b8ce8b92-31a5-49aa-9264-0d08abd5fc4e` from `bv_platform_managers` using an approved interactive staging DB channel:
```sql
DELETE FROM bv_platform_managers
WHERE user_id = 'b8ce8b92-31a5-49aa-9264-0d08abd5fc4e';
SELECT count(*) FROM bv_platform_managers;
```
Expected `count=0`. Also verify Keycloak and API health HTTP 200, and retain three ordinary synthetic users for repeatability. If cleanup verification fails, stop the gate and escalate as security incident; never proceed to production. Do not `docker compose down -v` or erase QA database merely to clean up.

**Pass labels are independent:** `JWT_HTTP_PASS`, `AUDIT_DB_PASS`, `TENANT_HTTP_RLS_PASS`, `TEMP_GRANT_REVOKED_PASS`. Only claim full E2E PASS when **all four** have evidence, and never infer it from CI or SQL rollback tests.
