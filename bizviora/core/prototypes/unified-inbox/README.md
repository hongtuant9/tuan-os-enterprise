# BIZVIORA — Unified Customer Inbox / Booking Resolution POC
Status: SYNTHETIC_ONLY / NO_DEPLOY / SECURITY_GATE_HOLD. Date: 2026-10-11.

## Scope
Isolated branch: feature/bizviora-unified-inbox-synthetic-20261011 from feature/bizviora-core-mvp-001-20261010; main and approved Customer UI V1.7.6 are unchanged.
- Interactive standalone index.html, fake Booking.com/WhatsApp/Email/Facebook/Zalo chat with source metadata and booking-centric timelines.
- Tenant A/B actor and staff role switch in UI is MOCK ONLY, NOT authentication.
- Channel filters, two bookings for one customer, same-name collision, unassigned inquiry queue, manual link/unlink in-memory audit.
- No API, provider send, OAuth, persistent DB, production, payments, or secrets.

## Run locally — no packages required
In this folder run: node --test matcher.test.mjs
And: python3 -m http.server 8769 --bind 127.0.0.1
Then open http://127.0.0.1:8769/ . Never bind the demo to a public interface.

## Read-only schema inventory on 2026-10-11
Connector: Supabase list_tables and information_schema. No production guest data read.
PRODUCTION TUAN OS — reference only:
- public.hospitality_customers = customer CRM
- public.hospitality_customer_identities = channel/contact identity
- public.hospitality_bookings (+ reconciliation view) = stay records
- public.ai_conversations = chat conversations
- public.ai_messages = message records.
ISOLATED BIZVIORA staging oxakhhpyvvymujiwuvnm:
- public.bv_tenants, public.bv_memberships, public.bv_business_units, public.bv_properties, plus tasks/approvals/audit and registration.
- Matching customer/identity/booking/conversation/message tables NOT PRESENT.
These production tables are not an immediate safe multi-tenant drop-in: the enumerated production customer/conversation/message schemas lack tenant_id. Use reusable logical contract/patterns only, not production data or RLS assumptions. Do not create DB tables before separate staging schema/migration approval.

## Matching contract (mock)
AUTO_VERIFIED only for trusted SERVER-VALIDATED provider booking reference within same tenant/property, or verified channel identity with exactly one verified stay.
MANUAL_REVIEW when multiple stays match same contact, claimed booking number is self-reported, or provider trust unverified.
UNASSIGNED for same name, dates, or unverified email alias with no safe evidence. REJECT wrong/missing tenant and disallow cross-tenant link.
IMPORTANT: providerTrust in fixtures is a test-only server-auth predicate, never safe to accept as a user-submitted field. Real backend must independently validate provider authorization.
Dedupe by provider message_id scoped to tenant/account/thread, or bridge correlation verified independently. Equal content across channels is not proof.
EMAIL_SENT_UNVERIFIED cannot be shown as OTA_SYNCED without native OTA read-back.

## Verification / boundaries
Node test suite is synthetic; its PASS does not prove server RLS, OAuth grants, mail delivery, OTA read-back or customer production readiness.
Default OFF: outbound messages, payments, booking writes, public customers, real mailbox, real OTA/Facebook, live deployment. Preserve 7-day trial policy unless separately approved. Reuse V1.7.6 UI baseline, introduce a versioned change request for future integration.
Rollback: stop local HTTP server and abandon isolated branch; no DB or production state touched.
Links: REQ-BIZ-AIC-20261011-001 / TASK-BIZ-20261011-007 / DEC-BIZ-20261010-006.
