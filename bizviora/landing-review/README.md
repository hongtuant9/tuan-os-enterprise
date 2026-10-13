# BIZVIORA Pain-first Landing — Review

Status: REVIEW ONLY, not production. Created 2026-10-12.
Source: bizviora/landing-review/index.html. Branch: review/bizviora-pain-first-landing-20261012.

## Scope
Self-contained HTML/CSS/JavaScript, pain-first content, responsive layout, accordion FAQ, local checklist, demo lead form. No integration with Auth/RLS, accounts, tenant data, payment, database, or production.

## Differences from infographic
The hero uses an original inline SVG placeholder, **not** the exact generated photo/illustration. Icons use simple text glyphs pending approved SVG asset library. The proof section deliberately includes placeholders rather than fabricated customer testimonials or growth KPIs.

## Release gates
1. Identify current authoritative Render service, repo, branch, publish path, and custom-domain binding for bizviora.com.
2. Verify desktop/mobile rendered screenshots, visual QA, keyboard accessibility, performance, SEO, responsive layout.
3. Replace illustration and icons using original approved assets.
4. Implement consent, privacy notice, spam protection, secured lead submission and end-to-end receipt test before claiming to capture leads.
5. Confirm backup and rollback, obtain explicit owner L3 production release approval, and post-deploy smoke test.
6. Keep SECURITY_GATE_HOLD and PRODUCTION_HOLD for core system unchanged.

No production deployment has been performed.