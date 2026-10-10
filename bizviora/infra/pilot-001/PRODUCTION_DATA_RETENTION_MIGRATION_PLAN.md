# TUAN OS production → BIZVIORA tenant TUAN-OS — Cleanup and migration plan

Status: INVENTORY-PARTIAL / NO-VPS-DISK-MEASUREMENT / NO-DELETION / NO-CREDENTIAL-TRANSFER / NO-GO-LIVE.
Date: 2026-10-11. Sources: read-only Supabase schema and stats, official Technical Build Guide, GitHub.

## Source and target separation
- OVH VPS-2 physical disk: OS, Docker/images/volumes, Next build/cache, logs, browser sessions, backups (NO direct host measurement yet).
- Managed Supabase TUAN OS production: ACTIVE_HEALTHY, separate cloud-hosted database, NOT the VPS disk.
- Supabase BIZVIORA staging: tenant, membership, business-unit/property structure; lacks tenant-scoped booking/customer/message and credential migration tables.
- Existing TUAN OS production remains authoritative until scoped owner approval and independent source + target readback.
- Do not move current production Docker, secrets, OAuth, or live OTA sessions before backup and rollback approval.

## Supabase database metadata only
2026-10-11 relation total sizes (including TOAST/indexes) on *external Supabase*, not VPS:
- import_logs ~836 MB; estimated ~535k rows.
- finance_audit_log ~185 MB; estimated ~116k rows.
- activity_logs ~40 MB; estimated ~89k rows.
- sync_runs ~17 MB; estimated ~59k rows.
Not proof of duplicate records or safely reclaimable space. No rows containing private data or any token value were read. No DELETE/VACUUM/DDL ran.

## Classification / treatment
KEEP: current deployment, active configs, encryption/backup keys under secret store, OTA sessions until reauthorization, audit/finance ledgers, rollback images, source backup. These must survive trial and legal retention.
SCOPED DATA MIGRATION: tenant property/business unit, verified hospitality customers and identities, bookings and provider references, AI conversation/message history with original channel and direction, active SOPs and business settings, necessary operational finance only with explicit rights.
REAUTHORIZE, NOT RAW COPY: Google OAuth, Zalo OA, Facebook Page, WhatsApp, OTA account logins, KiotViet and other provider API. Obtain fresh provider/tenant consent or controlled encrypted secret-manager transition followed by rotation. Never read/export token values in a text report, chat, Google Sheets, GitHub, app logs or unsupported destination. Browser sessions and OTP/MFA may require fresh login.
REGENERATE: Next build outputs, node_modules, inactive Docker build layers, disposable caches, computed reporting data, expired transient job state — ONLY after dependency audit.
CANDIDATE DELETION: verified unused duplicate bundles, orphaned images, stale releases, expired transient logs, obsolete temp files — must be itemized with ownership, size, retention deadline, backup/restore evidence, rollback and separate L3 owner approval. Do not assume old == removable.
EXCLUDE FROM CUSTOMER TENANT: owner PRIVATE finance, unrelated tenant data, internal platform secrets. Keep separately permissioned, signed Auth/RLS negative-test required.

## VPS physical disk audit phase A
1. Execute the companion read-only inventory script audit_vps_readonly.sh from an authorized shell on VPS-2 only during low-load time. It reports aggregate CPU/memory/filesystem/container sizes, not secrets or file contents. No mutation. Need regain trusted remote access first.
2. Record storage by volumes: used/free/inodes and top-level heavy directories; Docker image/volume references; backup paths and restore PASS; logs and build releases. Avoid a full filesystem recursive hash scan under production load.
3. Produce sanitized cleanup manifest per candidate: opaque ID, location class, bytes, service, active dependency, duplicate hash verification for NONsecret items, last active evidence, backup ref, retention rule, reversible quarantine window, proposed owner decision.
4. Prohibited before approval: rm, prune, truncate, drop, VACUUM FULL, cache clearing while in use, system service stop, production reboot, moving cookies or credential files.

## Production-to-tenant migration phase B
- Map source business_unit/property and each source booking reference to immutable target booking_id with tenant_id and property_id. Use composite source key (tenant, property, provider, provider_booking_reference).
- One customer may have many bookings; same name/date does NOT verify identity. Quarantine unresolved matches for human review. Preserve original channel source for each message.
- Inventory business-essential tables by metadata and row counts only, not PII: hospitality_customers, hospitality_customer_identities, hospitality_bookings, ai_conversations, ai_messages; separately review logs and SOP/marketing for retention.
- Create target schema and migrator only in isolated staging after separate approval. No bulk clone of legacy public schema, which lacks tenant_id in some tables.
- Connect provider accounts via official OAuth/API or owner-authorized re-login to OTA; never copy raw Google/Zalo OAuth access_token/refresh_token records.
- Run validation: source-target record counts and hash/checksum, booking linkage, provider account permissions, RLS tenant A/B, owner-private finance negative tests, message provenance, consent and data minimization.

## Cutover and cleanup phase C
- Source database/data and VPS services remain working during dual-run, with backup AND independent restore demonstrated. Record agreed RPO/RTO before moving writes.
- After signed staging E2E UAT, owner separately approves provider authorization and production cutover L3.
- Deploy target with human-approved actions only; no silent OTA/email outbound; keep source read-only/rollback-capable through an approved observation period.
- Revoke rotated old tokens/access only after replacement works, with explicit access change approval; do not remove necessary original OTA history.
- Deletion only for owner-approved itemized candidates after retention period, confirmed backup, no active references, no legal/audit hold, and recovery pathway tested. Verify space delta after mutation only when approved.

## Hold criteria
No current VPS capacity inventory; source backup/restore independent test missing; target production customer schema not deployed; RLS E2E not done; OAuth/OTA migration rights not verified. All deletion, copying secrets, provider changes, production deploy and purchasing remain HOLD. Worker co-location on existing VPS-2 also HOLD pending resource and owner approval.
Read-only GitHub branch file only; no runtime side effects.


## Latest L0 checkpoint 11 Oct 2026 — missing field linkages

Verified with read-only aggregate SELECTs: 479 source bookings; all 479 have NULL property_id; 85 have NULL customer_id; all 479 have source_system=KIOTVIET_HOTEL and source_booking_uuid. 288 AI conversations; 0 linked to hospitality_booking_id, 0 to ai_booking_record_id, 0 to property_id, 90 with business_unit_id, 63 with customer_id. 536 messages with 0 orphaned messages; 484 customer identities with 394 verified. BIZVIORA staging has TUAN OS Enterprise tenant slug tuan-os-enterprise-001, but bv_business_units and bv_properties are both empty. Therefore cutover mapping is **BLOCKED** until authoritative KiotViet property and legacy conversation mapping can be proven. See companion READONLY_MIGRATION_BASELINE_20261011.md. No customer PII or actual OAuth/token values exported.
OVH billing Gmail notifications were inspected without credential values: invoice total US$10.00 in September and October, plus renewal notices naming VPS and Auto Backup entries. Invoice line items / VPS hardware remain unverified. No VPS disk access possible because Remote Desktop Commander remote_calls_left_pct=0.
