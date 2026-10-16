V1.0.2 QA integrity patch (2026-10-16):
- bv_industry.services now requires same business_unit_id and property_id.
- Agent run requested_by, tool grant approved_by, agent approval decided_by,
  owner finance owner_user_id must match public.bv_memberships in same tenant.
- Five synthetic negative tests PASS on isolated PostgreSQL 16.
- This does NOT authorize staging/production, financial posting, live Agent
  execution, production Auth modifications or use of synthetic demo as real.
- Full Core/Auth restore, Supabase real JWT E2E, security adviser remediation,
  UI API read-only integration and production approval remain HARD HOLD.
- SQL file lives in reference/, NOT supabase/migrations, and is not auto-deployed.
