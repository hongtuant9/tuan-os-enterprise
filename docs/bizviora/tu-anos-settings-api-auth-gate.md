# TUAN OS Internal-First — read-only API authorization gate

Status: REVIEW ONLY. No production/staging deployment authorized by this document.

1. Verify signed JWT issuer, audience, signature and expiry before deriving user ID. Never trust tenant ID supplied solely by URL, header or user metadata.
2. Resolve tenant membership from `bv_memberships` using verified user ID and requested tenant ID; reject missing or ambiguous membership (403).
3. Read `bv_tenants`, `bv_business_units`, `bv_properties` using tenant-scoped queries. Do not use unrestricted service-role queries; if service role is necessary, enforce membership before every query and test tenant B denial.
4. For proposed new settings tables, current migration revokes `anon`/`authenticated` access and has RLS default deny. Do not wire these through a user-scoped PostgREST client until a separately reviewed SELECT grant plus membership RLS policy is implemented and tested. An authenticated JWT alone is insufficient.
5. Expose no write endpoints. Missing or unverified company profile, services or knowledge sources must return `NOT_CONFIGURED`/`NOT_VERIFIED`, not fabricated data.
6. Required evidence: valid TUAN OS user → tenant A reads; same token → tenant B denied; unsigned/expired token denied; anon denied; service role not exposed to browser; API GET only; audit/logs omit credentials.
7. Keep PR #596 and #597 draft until isolated and real staging integration gates pass. Founder registration, approvals and audit changes belong to Lane B.

Known staging preflight: existing `bv_tenants`, `bv_properties`, `bv_memberships` have authenticated SELECT grants with RLS; proposed three new tables intentionally have no authenticated SELECT grant. Existing public SECURITY DEFINER approval RPC advisor finding is a separate Lane B security handoff.
