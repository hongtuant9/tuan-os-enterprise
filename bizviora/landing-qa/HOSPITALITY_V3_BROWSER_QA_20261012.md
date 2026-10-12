# Hospitality Landing V3 — Release QA checkpoint 2026-10-12
Status: SOURCE UPDATED / LOCAL CHROMIUM SMOKE PASS / VISUAL FIDELITY & LEAD E2E HOLD
Target source commit 492a85e95d820acd66cd30d2a72404f4a83d882f. Render production unchanged.
Source retrieved via immutable GitHub commit URL, local file /tmp/bizviora-v3-review.html on authorized Mac, Google Chrome headless.
Browser checked desktop 1440x900 and mobile 390x844:
- page JavaScript exceptions: 0 in both;
- horizontal overflow: false in both;
- guest journey cards: 6 in both;
- hospitality sector cards: 2 in both;
- form has no action and no network submit: fail closed as designed.
Screenshots created LOCALLY on authorized Mac at /tmp/bizviora-v3-desktop.png and /tmp/bizviora-v3-mobile.png; no independent human infographic pixel-fidelity review has occurred.
Design mapping: hero hospitality pains, 6-step guest journey, 4 pain cards, 3 capability clusters, Lavender/Cozy proof placeholders, 2 customer vertical cards, FAQ, CTA. Still requires approved high-quality hero photography/illustrations and exact infographic review.
Lead destination: BIZVIORA — Landing Lead Intake, sheet LEADS, ID 1iUci1yByxSIa5aQEFnglV4bHVxhaTRmhjwfhgbQOkWE. Header A1:T1 exists, A2:T2 blank at last check.
Security design for lead:
- Endpoint MUST be server-side HTTPS, rate-limited and authenticated to Sheets with credentials held in secret manager; reject missing opt-in, unsafe fields, spam, oversized payload; strip formula-leading symbols before writing.
- Capture only opted-in name, business name/type, at least phone/email, main problem, consent/version/time, UTM and source. Implement dedupe and bounded retries/idempotency. Log only non-sensitive request IDs/status; retention and privacy contact sign-off.
- Synthetic E2E must verify append+read-back, no-secret client bundle, no duplicate on retry, error rejects, consent/no-consent, mobile submission, rollback.
- No connector credentials or public endpoint currently wired. Form remains explicitly demo/non-submitting. NO real lead has been written in this test.
Release gates: infographic fidelity HOLD; owner visual approval HOLD; secure endpoint and synthetic E2E HOLD; backup/restore HOLD; owner explicit production rollout approval HOLD.
