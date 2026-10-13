# Landing Editor V3 — 2026-10-13

## Verified
- Render preview editor-v3.html deployed on isolated Static Site, commit 525fed3d090e217216d930e5b64808b8c21d5f7b.
- Chrome headless: 7 starter widgets, add-widget increments to 8, mobile switch toggles mobile canvas, save reports browser-only draft, no JavaScript page errors.
- UI contains draggable widgets and reorder handlers, media upload and responsive per-device options. Full pointer drag/drop and media/undo/redo interaction suites are NOT TESTED.

## Founder-only shared drafts — NOT IMPLEMENTED / HOLD
- The review-only static site must not accept shared drafts or expose an unauthenticated write API.
- Need separate server-side HTTPS API with independently verified founder identity using current approved Auth provider; authorization must check immutable user ID and dedicated founder role server-side on every read/write; no client-side role claim.
- Keep drafts outside production tenant data. Draft fields: draft_id, content JSON validated against safe widget schema, schema_version, revision (optimistic concurrency), updated_at, updated_by; media object references, checksum, type, and storage ACL.
- Use private image storage signed upload after auth, virus/content-type/size screening, immutable asset versions; never store base64 media inside production DB.
- API GET/PUT draft must return 401 unauthenticated, 403 non-founder, 409 stale revision; support only allowlisted origins, CSRF defense, rate limit, bounded input, logs without PII, backups and rollback.
- Synthetic E2E: Founder A save/read-back; non-Founder B 403; anonymous 401; cross-tenant denied; revision conflict 409; unauthorized media read denied; XSS attempts escaped; restore old draft; production publish remains separate L3 approval.
- No permissions, Supabase policies, DNS, Render production or authenticated Founder environment changed.

STATUS: EDITOR_V3_LOCAL_REVIEW / CENTRAL_SAVE_NOT_IMPLEMENTED / FOUNDER_AUTH_NOT_TESTED / PUBLISH_HOLD.
