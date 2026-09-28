-- DOWN / ROLLBACK for 20260928090000_financial_foundation_personal_finance.sql
-- IMPORTANT: before executing this rollback, export all rows from the new tables if any runtime data exists.
-- Existing TUAN OS tables are not dropped. The four KiotViet sync source registry rows are removed only if created for this foundation.

begin;

drop view if exists public.owner_finance_summary_v;
drop view if exists public.personal_finance_monthly_v;

delete from public.sync_sources
where key in ('kiotviet_fnb_invoices','kiotviet_fnb_purchases','kiotviet_hotel_invoices','kiotviet_hotel_bookings');

drop table if exists public.kiotviet_document_draft_lines;
drop table if exists public.kiotviet_document_drafts;
drop table if exists public.personal_finance_transactions;
drop table if exists public.owner_business_transfers;
drop table if exists public.personal_finance_goals;
drop table if exists public.personal_finance_assets;
drop table if exists public.personal_finance_debts;
drop table if exists public.personal_finance_accounts;
drop table if exists public.personal_finance_access;

drop function if exists public.can_access_personal_finance(boolean);
-- tuan_set_updated_at is foundation-owned but may be reused later; only drop when no dependent triggers remain.
drop function if exists public.tuan_set_updated_at();

commit;
