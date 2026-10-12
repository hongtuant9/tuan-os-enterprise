# BIZVIORA Hospitality Hero & Lead QA — 2026-10-12
Status: REVIEW ONLY. PRODUCTION_HOLD.
Hero graphic concept generated in conversation. Do NOT publish the illustrated screenshots wholesale: synthetic metrics, prices, simulated message bubbles and 'live 24/7' feature claims are illustrative, not evidenced. Production asset requires cropping/redesign to remove fabricated metrics/text and owner review, usage rights confirmed.
Source lead code at bizviora/lead-intake/api/lead.mjs, lead.test.mjs, sheets-adapter.mjs, sheets-adapter.test.mjs on review/bizviora-pain-first-landing-20261012.
Local authorized Mac Node tests PASS: 11 handler assertions using in-memory mock; Sheets HTTP adapter mocked response PASS; NO authenticated live Google Sheets append/read-back performed.
Critical gaps: host HTTPS route, actual rateLimit adapter, secret-backed OAuth token provider, replay/idempotency persistent store, PII retention/privacy text, CORS/origin and CSRF design, production monitoring, integration tests and rollback. No live form activation, no keys in frontend/repo.
Existing LEADS Google spreadsheet 1iUci1yByxSIa5aQEFnglV4bHVxhaTRmhjwfhgbQOkWE 20-column schema, preserved.
No app routes, Render live deploy, DNS, SaaS Auth/RLS, customer data changed.
