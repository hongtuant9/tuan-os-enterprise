-- DOWN / ROLLBACK for 20260928170000_personal_finance_lineage_input_audit
-- Roll back only V2 lineage/input/audit hardening. Existing Financial Foundation objects remain.

drop view if exists public.personal_finance_monthly_v;

do $$
declare t text;
begin
  foreach t in array array[
    'personal_finance_accounts','personal_finance_transactions','personal_finance_debts',
    'personal_finance_assets','personal_finance_goals','owner_business_transfers'
  ]
  loop
    execute format('drop trigger if exists personal_finance_audit on public.%I',t);
    execute format('drop policy if exists %L on public.%I',t||' owner select',t);
    execute format('drop policy if exists %L on public.%I',t||' owner insert',t);
    execute format('drop policy if exists %L on public.%I',t||' owner update',t);
  end loop;
end $$;

drop function if exists private.personal_finance_audit_trigger();
drop table if exists public.personal_finance_audit_log;

drop index if exists public.personal_finance_accounts_source_external_uq;
drop index if exists public.personal_finance_transactions_source_external_uq;
drop index if exists public.personal_finance_debts_source_external_uq;
drop index if exists public.personal_finance_assets_source_external_uq;
drop index if exists public.personal_finance_goals_source_external_uq;
drop index if exists public.owner_business_transfers_source_external_uq;

alter table public.personal_finance_accounts
  drop column if exists created_by, drop column if exists updated_by, drop column if exists source_updated_at,
  drop column if exists verification_evidence, drop column if exists verified_at, drop column if exists external_key;
alter table public.personal_finance_transactions
  drop column if exists created_by, drop column if exists updated_by, drop column if exists source_updated_at,
  drop column if exists verification_evidence, drop column if exists verified_at, drop column if exists external_key,
  drop column if exists record_status;
alter table public.personal_finance_debts
  drop column if exists created_by, drop column if exists updated_by, drop column if exists source_updated_at,
  drop column if exists verification_evidence, drop column if exists verified_at, drop column if exists external_key;
alter table public.personal_finance_assets
  drop column if exists created_by, drop column if exists updated_by, drop column if exists source_updated_at,
  drop column if exists verification_evidence, drop column if exists verified_at, drop column if exists external_key,
  drop column if exists record_status;
alter table public.personal_finance_goals
  drop column if exists created_by, drop column if exists updated_by, drop column if exists source_updated_at,
  drop column if exists verification_evidence, drop column if exists verified_at, drop column if exists external_key;
alter table public.owner_business_transfers
  drop column if exists created_by, drop column if exists updated_by, drop column if exists source_updated_at,
  drop column if exists verification_evidence, drop column if exists verified_at, drop column if exists external_key,
  drop column if exists record_status;

grant delete on public.personal_finance_accounts,public.personal_finance_transactions,public.personal_finance_debts,
  public.personal_finance_assets,public.personal_finance_goals,public.owner_business_transfers to authenticated;

create policy "Personal accounts owner only" on public.personal_finance_accounts for all to authenticated
  using (public.is_personal_finance_owner()) with check (public.is_personal_finance_owner());
create policy "Personal transactions owner only" on public.personal_finance_transactions for all to authenticated
  using (public.is_personal_finance_owner()) with check (public.is_personal_finance_owner());
create policy "Personal debts owner only" on public.personal_finance_debts for all to authenticated
  using (public.is_personal_finance_owner()) with check (public.is_personal_finance_owner());
create policy "Personal assets owner only" on public.personal_finance_assets for all to authenticated
  using (public.is_personal_finance_owner()) with check (public.is_personal_finance_owner());
create policy "Personal goals owner only" on public.personal_finance_goals for all to authenticated
  using (public.is_personal_finance_owner()) with check (public.is_personal_finance_owner());
create policy "Owner business transfers owner only" on public.owner_business_transfers for all to authenticated
  using (public.is_personal_finance_owner()) with check (public.is_personal_finance_owner());

create or replace view public.personal_finance_monthly_v
with (security_invoker=true)
as
with p as (
  select date_trunc('month',transaction_date)::date as month,
    sum(case when transaction_type='INCOME' and verification_status='VERIFIED' then amount else 0 end) as personal_income,
    sum(case when transaction_type='EXPENSE' and verification_status='VERIFIED' then amount else 0 end) as personal_expense,
    sum(case when transaction_type in ('EXPENSE','DEBT_PAYMENT') and verification_status='VERIFIED' then amount else 0 end) as personal_cash_out,
    sum(case when transaction_type='INCOME' and verification_status='VERIFIED' then amount
             when transaction_type in ('EXPENSE','DEBT_PAYMENT') and verification_status='VERIFIED' then -amount else 0 end) as personal_net_cash_flow
  from public.personal_finance_transactions
  where business_transfer_id is null
  group by 1
), b as (
  select date_trunc('month',transfer_date)::date as month,
    sum(case when direction='BUSINESS_TO_PERSONAL' and verification_status='VERIFIED' then amount else 0 end) as business_to_personal,
    sum(case when direction='PERSONAL_TO_BUSINESS' and verification_status='VERIFIED' then amount else 0 end) as personal_to_business
  from public.owner_business_transfers
  group by 1
), months as (
  select month from p union select month from b
)
select m.month,
  coalesce(p.personal_income,0)+coalesce(b.business_to_personal,0) as personal_income_actual,
  coalesce(p.personal_expense,0) as personal_expense_actual,
  coalesce(p.personal_cash_out,0)+coalesce(b.personal_to_business,0) as personal_cash_out,
  coalesce(p.personal_net_cash_flow,0)+coalesce(b.business_to_personal,0)-coalesce(b.personal_to_business,0) as personal_net_cash_flow,
  coalesce(b.business_to_personal,0) as verified_business_distribution_received
from months m
left join p using(month)
left join b using(month);

grant select on public.personal_finance_monthly_v to authenticated,service_role;
