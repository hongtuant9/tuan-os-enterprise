# TUAN OS — Financial Foundation Migration 2026-09-28

## Trạng thái
Owner approved architecture and implementation scope:
- Business Finance remains separate from Personal/Family Finance.
- Consolidated Owner View only consumes actual verified owner/business transfers; business revenue is never personal income.
- KiotViet scope in this migration is READ + INTERNAL DRAFT + VALIDATION + APPROVAL PREPARATION.
- No KiotViet provider COMMIT is authorized by this package.

## SSOT
- Business transaction System of Record: KiotViet Hotel/F&B and other authenticated source systems.
- Business monthly finance reporting: FIN-HOSPITALITY-001 / business_finance_monthly read model.
- Personal/Family runtime canonical layer: Supabase Personal Finance tables.
- TUAN OS — Mô hình tài chính gia đình: human-readable planning/snapshot source during migration; after backfill it is not a competing transaction database.
- Consolidated Owner View: SQL views joining only verified personal records and verified owner/business transfers.

## Versioned migration
UP:
supabase/migrations/20260928133000_financial_foundation_personal_finance_kiotviet_drafts.sql

DOWN:
supabase/rollback/20260928133000_financial_foundation_personal_finance_kiotviet_drafts_down.sql

The migration is additive. It does not drop or rewrite existing business, customer, marketing, task, approval, or sync data.

## New database objects
- business_finance_monthly
- personal_finance_accounts
- personal_finance_transactions
- personal_finance_debts
- personal_finance_assets
- personal_finance_goals
- owner_business_transfers
- kiotviet_document_drafts
- kiotviet_document_draft_items
- personal_finance_monthly_v
- owner_finance_position_v
- is_personal_finance_owner()
- can_manage_financial_drafts()

## Personal Finance security
Personal Finance base tables are RLS protected and only available to an authenticated user whose public.users.role = owner. Service role is server-side only.

No anon Personal Finance grant is created.

## Business / Personal separation
Example invariant:
Business revenue = 200M
Verified distribution actually received by owner = 30M
Personal income from business = 30M, not 200M.

owner_business_transfers is the only business-to-personal bridge in the new foundation. It has a source/source_reference uniqueness key to prevent accidental double-counting.

## KiotViet draft workflow
Request
-> Validate
-> Resolve supplier/item when authenticated read API supports it
-> Create internal TUAN OS draft
-> Preview
-> Approval preparation
-> STOP

Provider commit is not part of the current approval.

Draft states:
DRAFT / VALIDATED / NEED_VERIFY / READY_FOR_APPROVAL / APPROVED / COMMITTED / FAILED / CANCELLED.

A partial unique index prevents more than one COMMITTED row for the same canonical_commit_key in a future commit phase.

### Known provider limitation
Current KiotViet F&B public runtime returns 404 for purchaseorders/suppliers probes. The draft API therefore fails closed:
- supplier unresolved => NEED_VERIFY
- SKU/material unresolved => NEED_VERIFY
- unsupported Hotel purchase validation => NEED_VERIFY
No endpoint is invented.

## App
New route:
- /personal-finance

New navigation label:
- Tài chính cá nhân

The page:
- checks signed-in user role before loading Personal Finance;
- displays source, update time, verification status;
- does not publish unverified value as an actual;
- shows Net Worth only when asset and debt coverage is fully verified;
- has no arbitrary Financial Freedom Score.

## Backfill policy
Do not blindly copy existing planning figures into Actual.

Initial backfill candidates:
- Personal transaction rows from TUAN OS — Mô hình tài chính gia đình -> NEED_VERIFY until reconciliation evidence exists.
- Current debt -> NEED_VERIFY until current bank evidence exists.
- Cash / asset values -> NEED_VERIFY until account statement / valuation evidence exists.
- Financial Freedom target 18B -> owner-approved goal, not an Actual asset value.
- Hospitality P&L -> never duplicated into Personal Finance. Only verified owner distribution / contribution crosses the bridge.

## Production deployment order
1. Verify full database backup.
2. Run code CI quality gate.
3. Review migration for destructive operations (expected: none).
4. Validate RLS/index/FK on a safe test environment or transaction test.
5. Apply versioned migration.
6. Run security and performance advisors.
7. Run RLS access test with owner and non-owner.
8. Backfill only evidence-qualified Personal Finance rows.
9. Deploy application code.
10. Smoke test /personal-finance desktop + mobile.
11. Test KiotViet draft API. Confirm commitPerformed=false.
12. Update Master Blueprint, Technical Build Guide, TASK-001/APPROVAL-001 and Change Log.

## Rollback triggers
Rollback application or migration if any occurs:
- non-owner can read Personal Finance;
- owner cannot access expected Personal Finance scope;
- any existing TCE module fails;
- duplicate committed-document key is possible;
- draft API performs external KiotViet mutation;
- migration changes/drops pre-existing data;
- build or smoke test fails.

## Rollback
Application:
- revert the deployment commit / redeploy prior known-good main commit.

Database:
- before DOWN, export any new post-migration Personal Finance or draft data.
- run the versioned DOWN SQL file.
- the DOWN file deletes the four newly registered KiotViet sync_sources and drops only objects created by this migration.
- no pre-existing transactional table is dropped.

## Production backup blocker
The current Supabase organization is on Free plan. Supabase automatic scheduled database backups are documented for Pro/Team/Enterprise. The current tool session has no Supabase access token/database password for a verified logical pg_dump, and secrets must not be requested or exposed in chat.

Therefore production DB migration must remain HOLD until backup evidence exists. An additive migration and rollback SQL do not replace the explicit CEO backup gate.
