drop function if exists public.finance_operating_snapshot(date);
drop view if exists public.business_finance_pnl_v;
do $$ declare t text; begin
  foreach t in array array['finance_accounts','finance_credit_facilities','business_finance_open_items','business_finance_transactions','finance_tax_positions','finance_allocation_proposals','finance_transfer_requests'] loop
    execute format('drop trigger if exists finance_audit_write on public.%I',t);
    execute format('drop trigger if exists prevent_finance_hard_delete on public.%I',t);
  end loop;
end $$;
drop function if exists private.finance_audit_trigger();
drop function if exists private.prevent_finance_hard_delete();
drop table if exists public.finance_transfer_requests;
drop index if exists public.finance_allocation_proposals_active_uq;
drop table if exists public.finance_allocation_proposals;
drop table if exists public.finance_tax_positions;
drop table if exists public.finance_audit_log;
alter table public.finance_accounts drop constraint if exists finance_accounts_reconciliation_status_ck;
alter table public.finance_accounts
  drop column if exists purpose_note,
  drop column if exists is_restricted_cash,
  drop column if exists reconciliation_status,
  drop column if exists last_reconciled_at,
  drop column if exists book_balance,
  drop column if exists bank_balance,
  drop column if exists account_roles;
