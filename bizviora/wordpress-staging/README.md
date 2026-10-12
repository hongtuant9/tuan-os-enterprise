# BIZVIORA WordPress Marketing — staging runbook
Status: SOURCE PREPARED / WORDPRESS STAGING NOT INSTALLED / NO DOMAIN CHANGES.
Decision scope: WordPress for marketing website only. SaaS application remains outside WordPress.

## Environment inventory 2026-10-12
- Render workspace My Workspace currently only exposes bizviora-synthetic-demo STATIC SITE, publishing bizviora/demo; do not overwrite.
- WPVibe has tamcocexperience.com connected but no BIZVIORA WordPress site; do not reuse the Tam Coc site.
- hongtuan Windows did not resolve docker/php/mysql; Mac has Docker CLI, but engine readiness and resource/cost review not established.
- No public WordPress hosting/staging domain selected or paid for.

## Staging installation gate
Choose isolated staging infrastructure, perform cost/security sizing and owner L3 approval for paid hosting or domain changes. Create isolated WordPress + database, HTTPS, least-privilege administrator, patching, backup and tested restore; block indexing and production traffic. No secrets in Git/Drive/chat.

## Theme
Path: wp-content/themes/bizviora-marketing. Includes front-page.php, header.php, footer.php, functions.php, index.php, style.css.
Built without page builders. Page content is pain-first. Image is placeholder SVG, icons simplified; replace with licensed approved media before public launch.
Form is DISABLED and does not claim to collect leads.

## Lead architecture
Destination Google Sheet: 1iUci1yByxSIa5aQEFnglV4bHVxhaTRmhjwfhgbQOkWE (LEADS). Backend must handle consent, validation, rate limit and write via protected server-side identity; NEVER expose Sheets tokens, Apps Script keys or a public unprotected write URL in the browser. Must test synthetic roundtrip + failure before enabling form. See Lead Intake SOP for purpose and statuses.

## QA acceptance
- Desktop 1440 and mobile 390/320 screenshots, no horizontal overflow, readable type, working FAQ/navigation.
- WordPress admin editability; posts/pages, preview/publish, SEO metadata, caching, canonical and robots.
- WAF/rate limit, plugin inventory, updates, administrator MFA, SSL, backup restore proof.
- Lead end-to-end verified with synthetic input and consent; records remain private.
- Preserve /account/, /founder-v2/ and related routes via independent app domain/route migration; never cutover until links and authenticated access proven.
- Explicit rollback exercise and owner sign-off before production DNS/domain cutover.

## Rollback
Keep current Render deploy dep-db67tecs728c73fgece0 and commit ca95a41b230da30e72ac69cc31fbdef4768493b5 intact. Preserve DNS records and TTL baseline. Rollback by restoring old domain route to Render after validating certificates and availability; test from multiple resolvers. Do not claim rollback PASS from source-file parse alone.

## Cost
Cost not yet verified. No hosting expense authorized or incurred in this PR.
