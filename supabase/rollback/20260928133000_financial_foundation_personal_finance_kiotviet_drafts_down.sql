-- DOWN / ROLLBACK for 20260928133000_financial_foundation_personal_finance_kiotviet_drafts
-- Run only after exporting any post-migration data from the new tables.
-- Existing pre-migration tables are not dropped or altered.

delete from public.sync_sources
where key in ('kiotviet_hotel_invoices','kiotviet_hotel_bookings','kiotviet_fnb_invoices','kiotviet_fnb_purchase_orders');

drop view if exists public.owner_finance_position_v;
drop view if exists public.personal_finance_monthly_v;

drop table if exists public.kiotviet_document_draft_items;
drop table if exists public.kiotviet_document_drafts;
drop table if exists public.owner_business_transfers;
drop table if exists public.personal_finance_goals;
drop table if exists public.personal_finance_assets;
drop table if exists public.personal_finance_debts;
drop table if exists public.personal_finance_transactions;
drop table if exists public.personal_finance_accounts;
drop table if exists public.business_finance_monthly;

drop function if exists public.can_manage_financial_drafts();
drop function if exists public.is_personal_finance_owner();
