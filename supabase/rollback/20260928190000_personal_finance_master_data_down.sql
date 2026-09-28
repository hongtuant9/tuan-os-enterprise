-- DOWN for Personal Finance Master Data migration.
-- Export post-migration master data / code assignments before rollback if production data exists.

drop trigger if exists personal_finance_audit on public.finance_master_data;
drop table if exists public.finance_master_data;

drop view if exists public.owner_finance_position_v;

alter table public.personal_finance_transactions
  drop column if exists category_code,
  drop column if exists subcategory_code,
  drop column if exists currency_code,
  drop column if exists payment_method_code,
  drop column if exists income_source_code,
  drop column if exists transaction_source_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_accounts
  drop column if exists account_type_code,
  drop column if exists institution_code,
  drop column if exists status_reason,
  drop column if exists record_status,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_debts
  drop column if exists debt_type_code,
  drop column if exists lender_institution_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_assets
  drop column if exists asset_type_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.owner_business_transfers
  drop column if exists currency_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_audit_log drop constraint if exists personal_finance_audit_log_action_check;
alter table public.personal_finance_audit_log add constraint personal_finance_audit_log_action_check
  check (action in ('INSERT','UPDATE','IMPORT','VERIFY','SUPERSEDE'));

alter table public.personal_finance_transactions drop constraint if exists personal_finance_transactions_record_status_check;
alter table public.personal_finance_transactions add constraint personal_finance_transactions_record_status_check
  check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED'));
alter table public.owner_business_transfers drop constraint if exists owner_business_transfers_record_status_check;
alter table public.owner_business_transfers add constraint owner_business_transfers_record_status_check
  check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED'));


-- Restore the pre-Master-Data consolidated owner view (account record_status no longer exists after rollback).
create or replace view public.owner_finance_position_v
with (security_invoker=true)
as
with non_account_assets as (
  select
    coalesce(sum(value_amount) filter(where verification_status='VERIFIED' and valuation_kind='VERIFIED'),0) as verified_non_account_assets,
    count(*) filter(where verification_status='VERIFIED' and valuation_kind='VERIFIED' and value_amount is not null) as verified_asset_count,
    count(*) filter(where verification_status<>'VERIFIED' or valuation_kind<>'VERIFIED' or value_amount is null) as unverified_asset_count
  from public.personal_finance_assets
), accounts as (
  select
    coalesce(sum(current_balance) filter(where verification_status='VERIFIED'),0) as verified_account_balances,
    coalesce(sum(current_balance) filter(where verification_status='VERIFIED' and is_liquid),0) as available_cash,
    coalesce(sum(current_balance) filter(where verification_status='VERIFIED' and is_emergency_fund),0) as emergency_fund,
    count(*) filter(where verification_status='VERIFIED' and current_balance is not null) as verified_account_count,
    count(*) filter(where verification_status='VERIFIED' and is_emergency_fund and current_balance is not null) as emergency_fund_account_count,
    count(*) filter(where verification_status<>'VERIFIED' or current_balance is null) as unverified_account_count
  from public.personal_finance_accounts
), d as (
  select
    coalesce(sum(current_principal) filter(where verification_status='VERIFIED' and status='ACTIVE'),0) as verified_liabilities,
    count(*) filter(where verification_status='VERIFIED' and status='ACTIVE' and current_principal is not null) as verified_debt_count,
    count(*) filter(where status='ACTIVE' and (verification_status<>'VERIFIED' or current_principal is null)) as unverified_debt_count,
    coalesce(sum(monthly_debt_service) filter(where verification_status='VERIFIED' and status='ACTIVE'),0) as monthly_debt_service
  from public.personal_finance_debts
), essential as (
  select avg(month_total) as avg_essential_monthly_expense
  from (
    select date_trunc('month',transaction_date),sum(amount) as month_total
    from public.personal_finance_transactions
    where verification_status='VERIFIED' and transaction_type='EXPENSE' and is_essential
      and business_transfer_id is null
      and transaction_date >= (current_date - interval '3 months')
    group by 1
  ) x
)
select
  non_account_assets.verified_non_account_assets + accounts.verified_account_balances as verified_assets,
  non_account_assets.verified_non_account_assets,
  accounts.verified_account_balances,
  d.verified_liabilities,
  case
    when non_account_assets.unverified_asset_count=0
     and accounts.unverified_account_count=0
     and d.unverified_debt_count=0
     and (non_account_assets.verified_asset_count + accounts.verified_account_count) > 0
    then non_account_assets.verified_non_account_assets + accounts.verified_account_balances - d.verified_liabilities
    else null
  end as net_worth,
  non_account_assets.verified_asset_count,non_account_assets.unverified_asset_count,
  accounts.verified_account_count,accounts.emergency_fund_account_count,accounts.unverified_account_count,
  d.verified_debt_count,d.unverified_debt_count,d.monthly_debt_service,
  accounts.available_cash,accounts.emergency_fund,essential.avg_essential_monthly_expense,
  case when essential.avg_essential_monthly_expense>0 then accounts.emergency_fund/essential.avg_essential_monthly_expense else null end as emergency_fund_coverage_months
from non_account_assets cross join accounts cross join d cross join essential;

grant select on public.owner_finance_position_v to authenticated,service_role;
