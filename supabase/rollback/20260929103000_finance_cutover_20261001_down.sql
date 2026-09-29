drop function if exists public.finance_cutover_snapshot();
drop table if exists public.finance_month_end_close_items;
drop table if exists public.finance_operating_plan_lines;
drop table if exists public.business_finance_transactions;
drop table if exists public.business_finance_open_items;
drop table if exists public.finance_credit_facilities;
drop table if exists public.finance_accounts;
alter table public.personal_finance_debts
  drop column if exists valuation_method,
  drop column if exists reference_price_as_of,
  drop column if exists reference_unit_price,
  drop column if exists liability_unit,
  drop column if exists liability_quantity;
-- Note: rollback does not restore superseded Personal Finance opening values; restore from pre-cutover DB backup if required.
