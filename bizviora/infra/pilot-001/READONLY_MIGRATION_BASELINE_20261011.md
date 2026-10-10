# TUAN OS → BIZVIORA tenant 001: read-only migration baseline

Checkpoint: **2026-10-11**. Record type: **aggregates and schema metadata ONLY**, not a customer data dump.
Status: **MAPPING_BLOCKED / BACKUP_RESTORE_NOT_RUN / PRODUCTION_READ_ONLY / NO_SECRET_EXPORT / NO_DELETE**.
Canonical business authorization: **DEC-BIZ-20261011-015 / TASK-BIZ-20261011-009**.
All SQL was SELECT-only against public metadata or aggregate counts, and **NO production mutation** occurred.

## Verified source: TUAN OS Supabase production

Project: `tuan-os-enterprise` (separate Supabase service; not the OVH VPS disk).

| Metric | Checked value | Migration implication |
|---|---:|---|
| Bookings in `hospitality_bookings` | 479 | Reconcile counts and source references |
| Bookings with `property_id IS NULL` | **479** | **BLOCK**: cannot assign target BIZVIORA property without authoritative property mapping |
| Bookings with `customer_id IS NULL` | **85** | Quarantine pending verified identity reconciliation |
| Bookings missing `source_system` or `source_booking_code` | 0 | Reference mapping candidate exists, but still needs provider/business ownership check |
| Extra rows with repeated `(property_id, source_system, source_booking_code)` | 0 | Specific key duplicate check PASS, **not proof of no duplicates globally** |
| Bookings with `source_booking_uuid IS NOT NULL` | 479 | Safe candidate source key; keep source-specific namespaces |
| Conversations in `ai_conversations` | 288 | To migrate only after provenance and consent screening |
| Conversations with `hospitality_booking_id IS NOT NULL` | **0** | **BLOCK**: no direct canonical booking link |
| Conversations with `booking_record_id IS NOT NULL` | **0** | Alternative AI booking link also missing |
| Conversations with `property_id IS NOT NULL` | **0** | **BLOCK**: no direct property assignment |
| Conversations with `business_unit_id IS NOT NULL` | 90 | Partial BU hints, not proof of correct property |
| Conversations with `customer_id IS NOT NULL` | 63 | Partial customer link only |
| Messages in `ai_messages` | 536 | Preserve source metadata and chronological integrity |
| Messages without conversation parent | 0 | Relational parent check PASS |
| Customers in `hospitality_customers` | 468 | Check consent and uniqueness separately |
| Contact identities in `hospitality_customer_identities` | 484 | Verify actor ownership before linking |
| Identities with `verified_at IS NOT NULL` | 394 | Not all identities verified |
| Customer records with unknown consent status (null) | 0 | Does **not** imply all consent is affirmative |

Source booking channel groups (counts only): Agoda 196, Booking.com 116, unspecified 95, Expedia 39, Airbnb 26, Trip.Com 6, Zalo 1; all records report `source_system=KIOTVIET_HOTEL`. Unspecified channel bookings include 85 with no customer link, but this coincidence is NOT a verified cause.
Source legacy entities: 3 properties, 6 business units, 35 sync sources; no automatic property assignment from these aggregate counts.

## Verified destination: BIZVIORA isolated Supabase staging

Project: `bizviora-staging-core-002`.
- Existing tenant slug **`tuan-os-enterprise-001`**, name **TUAN OS Enterprise**, alongside two synthetic QA tenants.
- 3 tenants, 4 membership rows total. No business unit and no property rows are present in the staging `bv_business_units`/`bv_properties` tables.
- `bv_tenants`, `bv_memberships`, `bv_business_units` and `bv_properties` have RLS enabled and at least one policy each. **RLS presence is NOT an end-to-end PASS**.
- Required tenant-scoped customer/identity/booking/message/conversation/provider-account target tables **NOT PRESENT** in current staging public schema. New schema DRAFT must undergo approved staging migration and signed principal RLS tests before data import.

## Physical OVH VPS-2 — still NOT measured

Remote Desktop Commander state confirmed: `remote_calls_left_pct=0`, only the owner's Mac online; home/server devices offline. No direct OVH account/SSH tool in active tool set. `audit_vps_readonly.sh` is committed but **not executed**. Thus 0 GB reclaimed, no file cleanup candidate can be validated, no production backup can be assumed restorable.

Source PostgreSQL size metadata (managed Supabase, NOT local OVH disk):
- `import_logs` ~837 MB, `finance_audit_log` 185 MB, `activity_logs` 40 MB, `sync_runs` 17 MB.
- Physical table size and metadata alone cannot justify deletion. `finance_audit_log` uses before/after JSON and is subject to audit retention.
- Do not use `VACUUM FULL`, `DELETE`, `TRUNCATE` or `DROP` without itemized owner approval.

## Source-to-target data mapping, DRAFT only

| Domain | Source tables/metadata | Proposed tenant-scoped target | Pre-migration gate |
|---|---|---|---|
| Tenant/property | `business_units`, `properties`, KiotViet source ownership | `bv_tenants` existing → `bv_business_units` → `bv_properties` | Owner approves source-to-property mapping; no fabricated property_id |
| Bookings | `hospitality_bookings` source_system + source_booking_uuid/code + timestamps | `booking_id`, `tenant_id`, `property_id`, provider reference mapping | All 479 require property resolution; no ambiguity and no duplicate source composite |
| Customers | `hospitality_customers` + consent metadata | `customer_id` tenant scoped, minimal permitted fields | Verified ownership and purpose limitation; separate private finance |
| Customer contact identity | `hospitality_customer_identities` | Per-provider identity with `verified_at` evidence and manual queue | Only verified auto-match; unverified identity NOT merged |
| Conversations | `ai_conversations` | Per-stay `conversation_id`, source thread bridge, optional unassigned | 0/288 legacy booking IDs linked; cannot guess using names/dates |
| Messages | `ai_messages` | Message events with source channel + native provider id/provenance | 0 orphans in source, but source/booking linkage must be verified; email is not native OTA readback |
| Operational settings | Approved SOP/knowledge, booking settings | Tenant/property config and restricted knowledge | Owner/operator signoff on policies and pricing |
| OAuth/API integrations | Google/Zalo provider metadata; other external adapters | Tenant-scoped connection metadata + reference to encrypted secret manager | **Do not copy access_token, refresh_token, app_secret, cookies/session profiles**; per-account authorized re-consent |
| Financial/audit logs | `finance_audit_log`, other audits | Separate retained source/archive, NOT general inbox | Legal retention & backup/restore proof; owner-private access controls |

## Blocking questions before moving real records

1. Which authoritative KiotViet property/hotel identity owns the 479 bookings? Obtain provider account/property mapping **via authorized connector metadata**, not by assuming all belong to one hotel.
2. How to reconcile 288 conversations when none has `hospitality_booking_id` or `booking_record_id`? Build a controlled evidence-based matching queue. **Never fuzzy match name, date or message text directly into confirmed stays**.
3. Which bookings are within the owner's permitted TUAN OS Enterprise 001 tenant scope? Exclude anything from other legal entities or personal data.
4. Verify consent and legal retention separately for messages/identities and financial logs.
5. Confirm full source backup and independently tested restore, plus target staging schema/RLS and dry-run counts/hash checks.

## Next review gates

**G1 OVH READ-ONLY**: authorized shell/disk report with free space and active mounts, backup IDs and restore verification, owner-approved itemized candidate list.
**G2 TARGET SCHEMA**: reviewed migration DRAFT, authenticated tenant A/B signed negative tests, tenant TUAN OS property records, no secret export.
**G3 DATA SHADOW**: owner-approved limited non-sensitive or synthetic pilot, source/target counts and checksums, explicit booking-property and conversation-booking manual queue.
**G4 PROVIDER**: official OAuth reauthorization or secured owner-approved secret rotation; provider ToS and separation of API/OTA identity.
**G5 CUTOVER/CLEANUP**: separate explicit owner L3 for any production mutation, data removal, service stop or credential revocation, after backup/restore and rollback.

No production data migrated. No change to VPS, Supabase tables, Auth/OAuth, provider systems, DNS, billing or Render.


## Read-only OVH billing evidence (no authentication data)

Gmail messages from OVHcloud were reviewed for invoice metadata only, with no credentials/IP/hostnames exported.
- OVHcloud issued invoice notification dated **2026-10-08**, **US$10.00 total**.
- Another invoice notification dated **2026-09-07** also shows **US$10.00**.
- 2026-09-30 and 2026-10-04 renewal notices refer to VPS service and **Auto Backup** option entries, under manual renewal.
- The messages do **not** itemize invoice lines with sufficient precision to assert actual per-month VPS-2 price, VPS hardware size, exact backups quantity or that $10 is the full monthly charge. OVH authenticated billing console verification remains required.
- No payment action, purchase, account setting change or VPS login performed.
