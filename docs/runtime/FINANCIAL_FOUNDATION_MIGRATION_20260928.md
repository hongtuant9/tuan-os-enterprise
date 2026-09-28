# TUAN OS Financial Foundation — Migration Package 2026-09-28

## Status
APPROVED FOR IMPLEMENTATION. Production database apply remains gated by verified logical backup.

## SSOT decision
- BUSINESS FINANCE: FIN-HOSPITALITY-001 + authenticated KiotViet/OTA/bank/evidence. FIN-HOSPITALITY-001 remains Hospitality Finance summary/reporting SSOT; it is not Personal Finance.
- PERSONAL/FAMILY FINANCE: Supabase Personal Finance layer introduced by migration 20260928090000.
- CONSOLIDATED OWNER VIEW: verified-only database views joining Personal Finance with explicit owner/business transfers. Business revenue/P&L never crosses automatically.
- KIOTVIET: source system for its own transactions. TUAN OS draft layer is preparation only.

## Migration
UP:
- supabase/migrations/20260928090000_financial_foundation_personal_finance.sql
DOWN:
- supabase/rollback/20260928090000_financial_foundation_personal_finance_down.sql

New tables:
- personal_finance_access
- personal_finance_accounts
- personal_finance_transactions
- personal_finance_debts
- personal_finance_assets
- personal_finance_goals
- owner_business_transfers
- kiotviet_document_drafts
- kiotviet_document_draft_lines

New views:
- personal_finance_monthly_v
- owner_finance_summary_v

Existing table touched additively:
- sync_sources: registers KiotViet invoice/purchase/booking sources. No business transaction data is overwritten.

## RLS
Personal Finance and KiotViet draft tables are RLS-protected.
Access is independent from Hospitality operational staff through personal_finance_access.
Views use security_invoker=true.
No public API should expose Personal Finance.

## Backfill
1. Do not copy Hospitality P&L transactions into Personal Finance.
2. Import Personal/Family transactions from canonical family-finance source only after row-level source/status mapping.
3. Import debt/assets/goals only with source_reference and verification_status.
4. Create owner_business_transfers only for real owner draw/distribution/contribution/owner-paid-business events.
5. Backfill KiotViet runtime into sync_records incrementally; KiotViet remains authority.
6. FIN-HOSPITALITY-001 should later be reduced to monthly/quarterly summary after Supabase runtime reconciliation passes.

## KiotViet draft workflow
READ -> PREPARE -> DRAFT -> VALIDATE -> READY_FOR_APPROVAL.
No COMMIT handler is introduced by this package.
Draft API:
- GET/POST /api/internal/finance/kiotviet-drafts
- FNB supplier/product exact-match resolution via existing authenticated read client where possible.
- Unknown supplier/SKU/unit/warehouse/business-unit/source produces NEED_VERIFY.
- Idempotency key = SHA-256(source_system | source_document_id/source_reference | document_type).
- Duplicate active request returns the existing draft.
- Future COMMIT requires separate execution approval, provider writer, read-back verification, and audit log.

## Application
New private route:
- /personal-finance
Navigation label:
- Tài chính cá nhân

UI only shows VERIFIED financial metrics. Missing or unverified data renders “— / CẦN XÁC MINH”.
Financial Freedom journey is descriptive; there is no arbitrary score.

## Production deployment order
1. Create logical database backup and verify restore artifact readability.
2. Review migration: additive/non-destructive, RLS, indexes/FKs, backward compatibility.
3. Apply migration with Supabase migration mechanism.
4. Regenerate TypeScript types.
5. Backfill Personal Finance in controlled batches.
6. Run RLS/access tests.
7. Deploy app commit after CI PASS.
8. Smoke test /personal-finance and draft API.
9. Verify no customer-facing path exposes Personal Finance.
10. Update FIN-HOSPITALITY-001 role text and governance docs; do not delete historical detail until runtime reconciliation passes.

## Rollback triggers
- Unauthorized user can read Personal Finance.
- RLS advisor reports exploitable policy.
- Migration breaks existing TCE modules.
- Duplicate draft/commit risk cannot be bounded.
- Any draft path performs a KiotViet financial mutation.
- Reconciliation causes business revenue to appear as personal income.
- Build/deploy smoke test fails.

## Rollback procedure
Database:
1. Stop new Personal Finance/draft writes.
2. Export rows from all new tables if any have been created.
3. Execute the versioned down script.
4. Verify existing pre-migration tables and app modules remain intact.
Application:
1. Revert the application merge commit.
2. Redeploy previous known-good main commit.
3. Smoke test core TCE routes and health endpoints.

## Acceptance tests
1. Business revenue 200M; owner distribution 30M -> Personal income 30M.
2. Opening debt 2.5B; principal paid 100M -> 2.4B.
3. Family expense 20M -> Personal Expense +20M only.
4. Valid 10kg purchase request -> draft only; no KiotViet production transaction.
5. Unknown SKU -> NEED_VERIFY.
6. Duplicate source document -> stable idempotency / no duplicate active document.
7. Rollback -> only migration-owned schema removed; pre-existing data untouched.
8. Unauthorized user -> no Personal Finance read.

## Backup note
Current Supabase organization is Free tier. Platform automatic daily database backups are not available for this production project; a logical dump must be created before production migration. This is a hard gate, not an optional recommendation.
