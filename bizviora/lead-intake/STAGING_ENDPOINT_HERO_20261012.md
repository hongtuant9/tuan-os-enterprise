# BIZVIORA Lead Staging / Hero Checkpoint — 2026-10-12
Current STATUS: PARTIAL PASS / PUBLIC RELEASE HOLD.

## Live staging proof
Render web service: bizviora-lead-staging-20261012; srv-db6gkalg1s2s73964ce0; FREE plan, Singapore; automatic deploy OFF; deployment dep-db6gkbdg1s2s73964dbg was LIVE, from ea2af4592c65fa93f7342bbd64e358f541947af3. Public HTTPS staging URL https://bizviora-lead-staging-20261012.onrender.com, independent of production bizviora.com.
Mac live HTTPS reads: GET /healthz returned 200 {ok:true,mode:staging,intakeReady:false}; POST /api/leads returned 503 {error:not_configured}. No real leads accepted or Google Sheets modified.
Source gateway file server.mjs. Google auth secret unavailable and not configured; endpoint intentionally fail closed. HTTPS verified by successful TLS request. In-memory rate limit is NOT distributed/durable. Staging token and origin gate specified but not provisioned; never publish a browser staging token. Safe production design must replace short-lived env access token with secure workload identity, add persistent deduplication, idempotency, CSRF/origin, rate limiter, data retention, audit and secret rotation.
Mocked node tests previously passed lead.test.mjs and sheets-adapter.test.mjs. Live Google Sheets E2E NOT PASS; no append/read-back. Do not call service functional lead intake.

## Hero
Review branch now has bizviora/demo/hospitality-hero.svg (original vector drawing, no fabricated numbers, discounts or working-AI claims). Incorporated into bizviora/demo/index.html at commit 0c7820e42729ccb431b98ecf176dfeb22dbb0eb3. Source read-back verifies img path, guest journey and HTML closing. Previous local browser test desktop/mobile 1440x900 and 390x844 on BEFORE latest hero had 0 JS errors and no horizontal overflow.
Latest hero-integrated revision has NOT been screenshot-tested, due remote process safety block. Infographic match/owner visual signoff pending. Generated full landing mockup images were NOT used as site assets, as they contain invented example metrics and unverified features.
No change to live Render static site, DNS, SaaS Founder, Auth/RLS, existing production customer data.
Next: visual screenshot exact commit on authorized staging browser; server-side Google identity/Sheet sharing with owner approval; persistent dedupe/rate limiting; synthetic E2E write/read/delete or mark test with audit trail; post-pass production release approval.
