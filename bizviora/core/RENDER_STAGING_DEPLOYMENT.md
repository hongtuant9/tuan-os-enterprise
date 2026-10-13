# BIZVIORA Core — Render staging deployment contract

**Scope:** isolated staging only. This file is a deployment runbook, NOT proof of deploy or production approval.

## Render Web Service (manual creation after security review)

- Repository: `hongtuant9/tuan-os-enterprise`
- Branch: `feature/bizviora-core-mvp-001-20261010`
- Root directory: `bizviora/core`
- Runtime: Node.js 22
- Build: `npm install --omit=dev`
- Start: `node server.mjs`
- HTTP health check: `/health`
- Auto Deploy: OFF until CI + rollback gating passes.
- Staging service must be explicitly named, and must NOT use the production domain.

## Required environment (configured in Render's secret manager, never in Git, Drive or chat)

- `BIZVIORA_STAGING_ACK=STAGING_ONLY`
- `BIZVIORA_HOSTING_TARGET=RENDER_STAGING`
- `BIZVIORA_RENDER_PUBLIC_STAGING_ACK=ALLOW_STAGING_INGRESS` — set only after staging ingress/security decision.
- `BIZVIORA_STAGING_PROJECT_REF=oxakhhpyvvymujiwuvnm`
- `BIZVIORA_SUPABASE_URL=https://oxakhhpyvvymujiwuvnm.supabase.co`
- `BIZVIORA_SUPABASE_ANON_KEY` — project publishable/anon key sourced securely from Supabase (NEVER service_role or legacy production key)
- `PORT` — assigned by Render.

The process rejects a different project reference and refuses to start without explicit staging acknowledgement. By default, local use binds only to `127.0.0.1:4317`.

## Gate and smoke testing

1. Confirm GitHub CI runs green on the exact commit, including API, Founder and hosting security tests.
2. Read-only database inspection: ensure `bv_is_platform_manager()` permits authenticated only, anon denied; verify JWT-based RLS A/B.
3. Deploy as a separate *staging* service, not by repurposing production routes or existing customer preview sites.
4. Check `GET /health => 200`, `GET /v1/founder/access` without authorization `=> 401`, non-manager `=> 403`, authorized manager `=> 200` using independently verified staging JWTs. Avoid logging tokens.
5. Test cross-tenant negative reads/writes, audit and failure handling. Record response codes and timestamps only.
6. Keep production and DNS unchanged. Rollback to the previously verified Render deployment artifact if any gate fails.

## 24/7 AI Customer is a separate gate

Render free/sleeping services are NOT suitable for AI Customer production ingress. Until paid always-on configuration, queue durability, idempotency, monitoring and recovery have passed, AI Customer remains **SHADOW / NO AUTO-SEND / NO BOOKING WRITE**.

## Cost review

Before activating a paid plan, gather exact Render, Supabase, OVH, GitHub and AI API billing/usage to build Cost Baseline V1.0 and obtain owner approval.
