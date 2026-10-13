# BIZVIORA landing cutover & rollback runbook — 2026-10-12

## Evidence of hosting
Public bizviora.com/ and bizviora-synthetic-demo.onrender.com/ returned identical ETag W/"9e4bd479f99920068a1410464d7638c1", same last-modified 2026-10-12 06:31:50 UTC. Their /account/ routes shared ETag W/"9fc0e1700d38d778e391e8a7f9f4ab9c". Render service srv-db4i2aad0e5s73ce2660 (workspace tea-db4hj6e0tbcc73edllag), configured branch feature/bizviora-tenant-platform, static publishPath bizviora/demo, autoDeploy off, latest live deploy dep-db67tecs728c73fgece0 from commit ca95a41b230da30e72ac69cc31fbdef4768493b5.

This is strong content-level evidence of hosting equivalence. Explicit custom-domain mapping is NOT accessible through current Render connector; check Render Domains UI before release.

## Review branch
review/bizviora-pain-first-landing-20261012, draft PR #579, page at bizviora/landing-review/index.html. Current review is not yet wired to root publish index. Keep /account/, Founder and Auth/RLS untouched.

## QA gates before release
- Desktop at 1440 and mobile 390 screenshot inspection for hero, typography, overflow, navigation and CTA.
- 320px mobile plus tablet viewport and real browser interactions.
- Logo and illustration approved source assets, no screenshot-cropped UI or unlicensed image.
- Lead collection endpoint, consent/privacy disclosure and anti-spam; test receipt with synthetic contact only.
- No fabricated testimonials, KPIs or implied guaranteed results.
- Accessibility (keyboard and focus), SEO, Core Web Vitals, 404 routes, domain TLS, /account/ unaffected.
- Staging preview sign-off and explicit owner L3 for public landing production release.

## Release procedure — ONLY after approval
1. Confirm service domain binding and branch HEAD SHA in Render; retain deploy ID dep-db67tecs728c73fgece0 and current live artifact/hash as baseline.
2. Tag or otherwise preserve known-good source commit ca95a41b230da30e72ac69cc31fbdef4768493b5 and export verified backup of currently served bizviora/demo/index.html.
3. Merge only approved landing replacement to publish directory, never modify account or founder paths.
4. Trigger Render static-site deploy for the approved commit (auto deploy remains off).
5. Verify content hashes and HTTP 200 for /, /account/, /founder-v2/ and other retained routes; desktop/mobile screenshots, submission end-to-end on test lead.
6. Record release commit, deploy ID, timestamps and operator in canonical TASK-001/approval record after successful verification.

## Rollback trigger and method
Trigger on HTTP 5xx, broken domain/TLS, missing account route, failed lead form, misleading claims, visual blockers or privacy/security anomalies.
- Stop further deploys; restore the last known-good homepage file/commit ca95a41b or redeploy the exact previous verified artifact using Render dashboard/API if supported.
- Recheck /, /account/, /founder-v2/ and domain after cache propagation; verify ETag and screenshots.
- Retain incident evidence, incident timeline and owner approval for any further production change.

## Status
PLAN ONLY: rollback NOT EXECUTED, no production deploy. Exact Render rollback API capability and full service domain binding require independent confirmation.
