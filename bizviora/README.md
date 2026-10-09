# BIZVIORA — staging brand and architecture

BIZVIORA is the current product brand (formerly BIZNEST). This branch is isolated from the production `main` auto-deploy lane.

## Product meaning
BIZ = Business, VI = Vision; ORA is a distinctive coined suffix, not a dictionary etymology.
Positioning: intelligent business operating system for SMEs. Tagline proposal: Run Smarter. Grow Stronger.

## Tenant architecture
- Stable tenant IDs; independently verified domains mapped to tenants.
- Membership + backend permissions + database RLS; hostname alone never grants access.
- Owner-private finance is not readable by employees or other tenants.
- All unverified/unmapped hosts fail closed.
- Custom domain cutover must include HTTPS, auth callbacks, cookies, webhooks, redirect and rollback checks.

## Current status
- Existing pure JavaScript resolver tests have been reported PASS 9/9 with synthetic A/B identities.
- This branch is **NOT deployed**. Supabase RLS, backup/restore and Git full-history secret gates are unverified.
- `app.tamcocexperience.com` continues serving original TUAN OS production. Do not change production `main`, DNS, credentials or production data from this branch.
- `bizviora.vn` and any other domain remain unpurchased and legally uncleared.

Acceptance before online deployment: separate staging runtime and database, verified hosting cost, real auth and RLS negative tests, rollback evidence, and owner approval for any production-impacting or paid change.
