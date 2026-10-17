# BIZVIORA 2.0 — Supabase QA connection gate (2026-10-17)

**Status: CODE_REVIEW_ONLY / QA_SYNTHETIC_READ_ONLY / NO LIVE CUTOVER.**
This code configures an isolated **QA data adapter**, not live TUAN OS data migration or production deployment.

## Verified project identity

- Old, still-active Supabase Auth/Core source: `oxakhhpyvvymujiwuvnm` (do not change or delete).
- New BIZVIORA 2.0 QA target: `yohtwbdfcaeibwsupqyg`, Singapore, currently contains 4 synthetic tenant fixtures, 7 draft AI Agent templates and 9 disabled Agents.
- New target is missing real Auth users, real membership, TUAN OS Tenant 001, original registration Core tables, Google OAuth, tested Owner login, signed JWT A/B E2E.
- Backup from old project was encrypted and restored independently on owner Mac, but offsite protection and full Auth runtime/role/restore gate are still HOLD.

## Isolated QA environment (LOCAL only)

These are **placeholder variable names**, not credentials:

```sh
BIZVIORA_STAGING_ACK=STAGING_ONLY
BIZVIORA_STAGING_PROJECT_REF=yohtwbdfcaeibwsupqyg
BIZVIORA_SUPABASE_URL=https://yohtwbdfcaeibwsupqyg.supabase.co
BIZVIORA_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY_FROM_SECURE_LOCAL_ENV>
BIZVIORA_V2_QA_ACK=BIZVIORA_V2_SYNTHETIC_READ_ONLY
BIZVIORA_V2_QA_MODE=LOCAL_READ_ONLY
BIZVIORA_HOSTING_TARGET=LOCAL_STAGING
```

Never copy keys, database passwords, signed JWTs, service-role keys, private keys, or Auth backup into Git, Drive or chat. Only use published, restricted client keys for per-user JWT/RLS; no service role access. Do **not** set `NODE_ENV=production` for QA mode. This mode cannot use `RENDER_STAGING`, public ingress acknowledgement, or a production deploy. Legacy staging continues to accept its existing variables and the former project ref with unchanged behavior.

## Enforced boundaries

- Ref must match HTTPS Supabase hostname, and be exactly one of the two explicit nonproduction refs; forbidden refs remain blocked.
- A new V2 target additionally requires exact synthetic-only ACK and local read-only mode.
- V2 adapter connects using the **caller-issued JWT** for membership/RLS once Auth data is migrated, never impersonates Owner or uses service-role.
- QA API rejects **all POST operations** with HTTP 405 *before* user verification, database access or audit write; no settings, tenant creation, task, approval, booking, finance, agent execution or outbound tools.
- QA `GET /health` says `scope: V2_SYNTHETIC_QA`, `readyForCustomerData: false` (liveness, **not** release readiness).
- Auth required for GET endpoints; without real new-project Auth users/JWT, calls fail closed (401). No synthetic tenant fixture is real TUAN OS company data.

## Validation steps

1. Run `node --test bizviora/core/tests/v2-qa-connection.test.mjs` (pure unit tests, no external keys).
2. In *owner-controlled* local QA, set publishable key only in secure ephemeral env and start `node bizviora/core/server.mjs` bound to localhost. Verify health and negative 401/405 without real JWT.
3. Validate target migrations, RLS and permissions with the DB-specific QA checks; do **not** write tenant/customer data as part of this smoke.
4. Before any actual customer-data read: complete encrypted source backup + second secure offsite copy/key recovery, Auth+Core migration with unchanged user/tenant UUIDs, three missing Core tables/RLS/RPC/function reconciliation, 3 real signed-JWT users across tenants A/B, Founder identity and full read-only E2E.
5. Before any production deployment: separate owner L3 approval, full rollback tested, monitored canary and parallel old-project availability. Do not merge either related draft PR solely because this QA adapter test passes.

## Change scope

- Base branch `review/biz2-tenant-settings-readonly-20261015` (PR #596).
- This PR changes only Core adapter/QA gate/API health/write guard and their tests/docs; it does not modify Supabase databases, GitHub `main`, App env, Render, OVH, DNS, project billing, or real data.
- UI PR #597 remains separate and must not be implicitly approved or deployed.

**STOP/ROLLBACK:** If any wrong project identity, Auth provider mismatch, signed-JWT failure, RLS bypass, missing data, or missing restore evidence, stop. Revert this review branch or unset QA env; legacy staging remains unchanged.
