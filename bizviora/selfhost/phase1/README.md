# BIZVIORA — VPS-only Phase 1 isolated QA candidate

**Status:** REVIEW / NOT DEPLOYED / NOT A PRODUCTION STACK.

## Isolation contract

- No Render dependency; no Supabase/PostgREST API, Supabase Auth, or production database.
- PostgreSQL 16, Keycloak self-hosted Auth and existing BIZVIORA Core API on an isolated Docker network, with unique database volume.
- Only ports `127.0.0.1:18093` (Keycloak) and `127.0.0.1:18094` (Core API) are published; SSH tunnel is required for operator access.
- Existing `api.mjs` and `access.mjs` are reused from BIZVIORA Core; no dashboard, AI Agent, or new product module.
- PostgreSQL RLS runs using `bv_api_member` (NO BYPASSRLS). Membership, Audit and synthetic finance isolation are enforced by DB policies/triggers.
- `bv_qa_business_finance` and `bv_qa_private_finance` are **test fixtures only**. The finance product remains disabled; there are no public finance endpoints.
- Keycloak uses `start-dev` and direct access grant **ONLY** for loopback-isolated synthetic testing. It is not approved production Auth hardening.
- Do not import or connect any TUAN OS, KiotViet or real customer data.

## Deploy after controlled gate approval and direct OVH access returns

1. Review code and GitHub CI. Save existing VPS evidence/backup first. Check port conflicts and free memory. Never overwrite the current lab.
2. Fetch the review branch into a separate directory on OVH (do not checkout into an existing production worktree).
3. `cd bizviora/selfhost/phase1 && cp .env.example .env && chmod 600 .env`. Generate **four different strong random credentials locally**; populate `.env` on the VPS without pasting them into ChatGPT or Git. Never print `.env` or run `docker compose config` without `--quiet` where it may expose secrets.
4. `docker compose config --quiet`; verify that no service exposes public ports.
5. `docker compose up -d --build`; inspect health/logs using secret-safe filters. **The initial database MUST be a NEW empty volume**; scripts only run on first DB initialization.
6. Via a temporary SSH tunnel, use the local Keycloak admin console to create independent **synthetic** QA A/B identities (do not migrate their Supabase passwords or sessions). Obtain their Keycloak UUIDs. Assign matching tenant memberships via an approved DBA-controlled seed script, not via API self-registration.
7. Run local Keycloak JWT → Core API GET/POST Tasks and approvals, cross-tenant 403, staff role denial, RLS finance fixture tests, audit correlation. Ensure 50 distinct QA tenants under realistic business sessions; record 50-concurrent HTTP and 24–72h soak separately.
8. Backup and restore all four components to an independent target: PostgreSQL business DB, Keycloak DB, Docker application configuration, audit and worker state as applicable. Test RTO/RPO and failure injection. Never mark Full DR PASS based on a single DB dump.

## Automated review gate

GitHub workflow `bizviora-phase1-standalone-review.yml` performs JavaScript syntax and existing Core unit tests, then launches a temporary isolated PostgreSQL container with randomly generated ephemeral credentials and runs `tests/rls-finance-audit.sql` in a transaction that ends with `ROLLBACK`.

**This workflow does not certify Keycloak login or production readiness.** Run JWT HTTP E2E on the actual isolated VPS after CI PASS.

## Failure handling

- If any Auth issuer/JWKS, database host or environment acknowledgement differs from expected isolated values, Core fails closed at startup.
- To stop QA: `docker compose stop`. Do not use `down -v` until the owner approves destruction of this isolated QA volume.
- No DNS changes, no Render/production switch, no migration or purchase of additional VPS under this task.

**Acceptance state remains `PHASE1_HOLD / PRODUCTION_HOLD` until full end-to-end and restore evidence is verified.**
