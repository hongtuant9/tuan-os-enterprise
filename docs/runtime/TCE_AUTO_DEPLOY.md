# TCE GitHub → Coolify Auto-Deploy

Status: configured on 2026-09-18.

Purpose: verify that a push to `main` is delivered by GitHub Webhooks to the existing Coolify application and starts a deployment without requiring Mac/Windows interaction.

Guardrails:
- This file changes documentation only.
- No environment variables, credentials, pricing, booking writes, Ads budget, payment, refund, or security permissions are changed.
- Production acceptance remains `/health` HTTP 200 with `runtime=tce-executive-org-v1`, `agentRegistry=15`, `executiveOrgRoles=11`, `executiveWorkerEnabled=true`, and database/app checks OK.
