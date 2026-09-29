do $$ declare t text; begin
  foreach t in array array['personal_finance_accounts','personal_finance_transactions','personal_finance_debts','personal_finance_assets','personal_finance_goals','owner_business_transfers'] loop
    execute format('drop trigger if exists personal_finance_kpi_snapshot_refresh on public.%I',t);
  end loop;
end $$;
drop function if exists private.personal_finance_snapshot_trigger();
drop function if exists private.refresh_personal_finance_kpi_snapshots(uuid,date);
drop table if exists public.personal_finance_kpi_snapshots;
drop index if exists public.personal_finance_goals_active_kpi_target_uq;
alter table public.personal_finance_goals drop constraint if exists personal_finance_goals_target_period_ck;
alter table public.personal_finance_goals drop constraint if exists personal_finance_goals_target_level_ck;
alter table public.personal_finance_goals
  drop column if exists change_reason,
  drop column if exists target_unit,
  drop column if exists target_year,
  drop column if exists target_period,
  drop column if exists target_level,
  drop column if exists kpi_code;
