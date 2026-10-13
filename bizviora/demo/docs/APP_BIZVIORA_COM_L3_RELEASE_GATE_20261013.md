# BIZVIORA app.bizviora.com — Conditional L3 Release Gate (2026-10-13)

Status: DOMAIN_HOLD / PRODUCTION_HOLD / NOT ACTIVATED

## Approved scope
- app.bizviora.com = customer application gateway for BIZVIORA.
- TUAN OS Enterprise (tuan-os-enterprise-001) is customer tenant 001.
- Accepted customer UI: V1.7.3, synthetic until data integration security approval.
- L3 conditional approval to configure domain ONLY AFTER Auth/RLS, HTTPS and rollback all PASS. No production TUAN OS or real business data changes.

## Observed facts
- Render review service: bizviora-tenant-v173-auth-review, service id srv-db6qgoff3r2c73c4kke0; branch review/bizviora-tenant-v173-integration-20261013; autoDeploy off.
- Its HTTPS review origin responds HTTP 200.
- DNS NS for bizviora.com: ns-a1.tenten.vn, ns-a2.tenten.vn, ns-a3.tenten.vn.
- app.bizviora.com does not yet resolve publicly in the checked network.
- Supabase staging project: oxakhhpyvvymujiwuvnm (not TUAN OS production).
- Verified tenant 001 with 1 membership and 1 approved registration request in staging.
- Existing policy expressions constrain tenant data by auth.uid and membership; live two-tenant authenticated E2E is NOT RUN.
- Anonymous PostgREST access to bv_tenants, bv_memberships, bv_business_units and bv_tasks returned HTTP 401 in read-only tests.
- The V1.7.3 UI displays synthetic business figures; treat it as demonstration only, never real reporting.

## Required release gates (all must PASS)
1. Two independently authenticated staging QA accounts: owner and unrelated tenant user; verify isolation, unauthorized reads/writes, role escalation denial, session expiry and logout.
2. RLS permission checks for core tenant tables, including negative tests and immutable audit; no production data involved.
3. Verified target service security posture; protect platform manager/admin routes on backend.
4. Render custom domain ownership/verification, HTTPS certificate, redirect URLs, OAuth callback and cookies; staged smoke test on the actual domain before opening access.
5. DNS backup (zone export/screenshot + existing TTL/records), exact change plan, monitored rollback and post-rollback verification.
6. CEO final go/no-go based on evidence, even under this conditional preapproval.

## Intended DNS rollout
- Confirm who administers the TenTen DNS zone. Record current A/CNAME/CAA for app and ancestor, including TTL.
- Validate Render's exact domain instructions, then create only the app subdomain record after gates 1-5 pass.
- Do not modify apex bizviora.com, www, email MX/TXT or TUAN OS production.
- Rollback: restore prior DNS record or remove newly created app record, detach custom domain if required, revert allowed callback additions only after traffic has drained; confirm DNS/TLS/login restoration.
- Keep the existing onrender.com review service available.

## Hold and source-of-truth
No DNS changes, no custom domain activation, no production deploy, no migration or role grants conducted under this checkpoint. This branch is review only. Google Drive/TASK-001 update: NOT RECORDED.

## Checkpoint 2026-10-13: Read-only release readiness
- Render Settings for service srv-db6qgoff3r2c73c4kke0: Custom Domains supports Add Custom Domain; service onrender.com subdomain is enabled. app.bizviora.com was NOT submitted to Render.
- Direct TenTen UI DNS inventory: @ A 216.24.57.1, www CNAME bizviora-synthetic-demo.onrender.com, no app entry. Local baseline file: /Users/admin/bizviora-domain-checkpoints/bizviora-dns-baseline-20261013.txt. TTL not yet established. No DNS changes performed.
- Public staging RLS audit: all 8 reviewed bv_* tables have relrowsecurity=true. No authenticated two-tenant negative E2E evidence; RLS_GATE_HOLD.
- Anonymous API read-only probes on bv_tenants, bv_memberships, bv_business_units and bv_tasks returned HTTP 401.
- Status: DNS_BASELINE_PASS, RLS_SCHEMA_CHECK_PASS, AUTH_RLS_E2E_NOT_RUN, CUSTOM_DOMAIN_NOT_ADDED, HTTPS_APP_DOMAIN_NOT_ISSUED, ROLLBACK_DRILL_NOT_RUN, PRODUCTION_HOLD.

## SQL RLS simulation — 2026-10-13 additional checks
Read-only SQL transactions with SET LOCAL ROLE authenticated and simulated auth.uid claims for owner fixtures in core002-e2e-tenant-a and core002-e2e-tenant-b. No production users or data changed.
- QA A sees A tenant:1; B tenant:0; TUAN OS tenant:0. QA B sees B tenant:1; A tenant:0; TUAN OS tenant:0.
- QA A: own membership=1, foreign membership=0; own tasks=1, foreign tasks=0.
- QA B: own membership=1, foreign membership=0; own tasks=0, foreign tasks=0. QA B tasks result is NOT a positive own-row test because there is no visible own task.
- Tested SELECT and role-context simulation only. No live OAuth E2E, cross-tenant write denial, expired session/logout, signed JWT, platform-manager escalation or full tenant table suite tested. Do NOT mark AUTH_RLS_E2E_PASS.
- Therefore custom domain addition and TenTen DNS remain HOLD per the CEO's conditional L3 authorization.

## Render Custom Domain registration — 2026-10-13
- Registered app.bizviora.com in Render STATIC SITE srv-db6qgoff3r2c73c4kke0 via Render dashboard UI (NOT DNS activation).
- Exact Render-provided CNAME: hostname `app`, target `bizviora-tenant-v173-auth-review.onrender.com`.
- Render reports VERIFIED STATUS `Waiting for DNS`, CERTIFICATE STATUS `Waiting for Verification`. Render onrender.com fallback remains enabled.
- TenTen DNS not edited: no app CNAME yet. No custom-domain HTTPS issued. App still does not resolve.
- Conditional L3 release HOLD remains for live Auth/RLS E2E, denied writes, end-to-end session expiry/logout, HTTPS and rehearsed rollback. DO NOT add TenTen record until preconditions achieved. No production data enabled.
