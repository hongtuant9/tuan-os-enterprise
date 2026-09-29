-- Financial Freedom KPI Center — additive Personal Finance extension.
-- Targets stay in canonical personal_finance_goals; monthly history is stored separately.

alter table public.personal_finance_goals
  add column if not exists kpi_code text,
  add column if not exists target_level text,
  add column if not exists target_period date,
  add column if not exists target_year integer,
  add column if not exists target_unit text not null default 'VND',
  add column if not exists change_reason text;

alter table public.personal_finance_goals drop constraint if exists personal_finance_goals_target_level_ck;
alter table public.personal_finance_goals add constraint personal_finance_goals_target_level_ck
  check (target_level is null or target_level in ('LONG_TERM','ANNUAL','MONTHLY'));

alter table public.personal_finance_goals drop constraint if exists personal_finance_goals_target_period_ck;
alter table public.personal_finance_goals add constraint personal_finance_goals_target_period_ck
  check (target_level <> 'MONTHLY' or target_period is not null);

create unique index if not exists personal_finance_goals_active_kpi_target_uq
  on public.personal_finance_goals(
    kpi_code,target_level,
    coalesce(target_period,date '1900-01-01'),
    coalesce(target_year,0)
  ) where status='ACTIVE' and kpi_code is not null and target_level is not null;

create table if not exists public.personal_finance_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  period date not null,
  kpi_code text not null,
  target_value numeric(18,4),
  actual_value numeric(18,4),
  variance numeric(18,4),
  progress_percent numeric(9,4),
  status text not null default 'NEED_VERIFY'
    check (status in ('ON_TRACK','AT_RISK','OFF_TRACK','ACHIEVED','NEED_VERIFY','NO_DATA')),
  trend text not null default 'NO_DATA'
    check (trend in ('IMPROVING','STABLE','WORSENING','NO_DATA')),
  source text not null,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  source_updated_at timestamptz,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,period,kpi_code)
);

alter table public.personal_finance_kpi_snapshots enable row level security;
revoke all on public.personal_finance_kpi_snapshots from anon,authenticated;
grant select on public.personal_finance_kpi_snapshots to authenticated,service_role;
grant all on public.personal_finance_kpi_snapshots to service_role;

drop policy if exists "Personal KPI snapshots owner read" on public.personal_finance_kpi_snapshots;
create policy "Personal KPI snapshots owner read"
  on public.personal_finance_kpi_snapshots for select to authenticated
  using (owner_id=auth.uid() and public.is_personal_finance_owner());

create index if not exists personal_finance_kpi_snapshots_period_idx
  on public.personal_finance_kpi_snapshots(owner_id,period desc,kpi_code);

comment on table public.personal_finance_kpi_snapshots is
  'Monthly immutable-by-period Financial Freedom KPI history. Current month may be refreshed; prior months are never updated by the refresh function.';

create or replace function private.refresh_personal_finance_kpi_snapshots(p_owner uuid, p_period date default date_trunc('month',current_date)::date)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_period date := date_trunc('month',p_period)::date;
  v_current_period date := date_trunc('month',current_date)::date;
  pos record;
  mon record;
  sustainable numeric := null;
  essential numeric := null;
  unverified_sustainable integer := 0;
  unverified_essential integer := 0;
  k text;
  actual numeric;
  verify text;
  src_updated timestamptz;
  target numeric;
  prev_actual numeric;
  direction text;
  gap numeric;
  progress numeric;
  kstatus text;
  ktrend text;
begin
  if p_owner is null then return; end if;
  -- Never overwrite a historical month after the calendar moves on.
  if v_period <> v_current_period then return; end if;

  select * into pos from public.owner_finance_position_v limit 1;
  select * into mon from public.personal_finance_monthly_v where month=v_period limit 1;

  select
    coalesce(sum(amount) filter(where verification_status='VERIFIED' and record_status='ACTIVE'),0),
    count(*) filter(where verification_status<>'VERIFIED' and record_status='ACTIVE'),
    max(source_updated_at)
  into sustainable,unverified_sustainable,src_updated
  from public.personal_finance_transactions
  where transaction_date>=v_period and transaction_date<(v_period+interval '1 month')
    and transaction_type='INCOME' and is_sustainable_income and business_transfer_id is null;

  select
    coalesce(sum(amount) filter(where verification_status='VERIFIED' and record_status='ACTIVE'),0),
    count(*) filter(where verification_status<>'VERIFIED' and record_status='ACTIVE')
  into essential,unverified_essential
  from public.personal_finance_transactions
  where transaction_date>=v_period and transaction_date<(v_period+interval '1 month')
    and transaction_type='EXPENSE' and is_essential and business_transfer_id is null;

  foreach k in array array['NET_WORTH','TOTAL_DEBT','NET_CASH_FLOW','SUSTAINABLE_INCOME','ESSENTIAL_EXPENSE','EMERGENCY_FUND','LIQUID_CASH','DEBT_SERVICE_COVERAGE','SAVINGS_RATE'] loop
    actual := null; verify := 'NEED_VERIFY'; src_updated := null;
    direction := case when k in ('TOTAL_DEBT','ESSENTIAL_EXPENSE') then 'DOWN' else 'UP' end;

    if k='NET_WORTH' then
      actual := pos.net_worth;
      verify := case when pos.net_worth is not null then 'VERIFIED' else 'NEED_VERIFY' end;
    elsif k='TOTAL_DEBT' then
      if pos.verified_debt_count>0 and pos.unverified_debt_count=0 then actual:=pos.verified_liabilities; verify:='VERIFIED'; end if;
    elsif k='NET_CASH_FLOW' then
      if mon.verified_cashflow_count>0 and mon.unverified_cashflow_count=0 then actual:=mon.personal_net_cash_flow; verify:='VERIFIED'; src_updated:=mon.source_updated_at; end if;
    elsif k='SUSTAINABLE_INCOME' then
      if sustainable>0 and unverified_sustainable=0 then actual:=sustainable; verify:='VERIFIED'; end if;
    elsif k='ESSENTIAL_EXPENSE' then
      if essential>0 and unverified_essential=0 then actual:=essential; verify:='VERIFIED'; end if;
    elsif k='EMERGENCY_FUND' then
      if pos.emergency_fund_account_count>0 and pos.unverified_account_count=0 then actual:=pos.emergency_fund; verify:='VERIFIED'; end if;
    elsif k='LIQUID_CASH' then
      if pos.verified_account_count>0 and pos.unverified_account_count=0 then actual:=pos.available_cash; verify:='VERIFIED'; end if;
    elsif k in ('DEBT_SERVICE_COVERAGE','SAVINGS_RATE') then
      -- Business rule not Owner-approved yet. Supported but deliberately not calculated.
      actual:=null; verify:='NEED_VERIFY';
    end if;

    select g.target_amount into target
    from public.personal_finance_goals g
    where g.status='ACTIVE' and g.verification_status='VERIFIED' and g.kpi_code=k
      and g.target_level='MONTHLY' and g.target_period=v_period
    order by g.updated_at desc limit 1;

    if target is null then
      select g.target_amount into target from public.personal_finance_goals g
      where g.status='ACTIVE' and g.verification_status='VERIFIED' and g.kpi_code=k
        and g.target_level='ANNUAL' and g.target_year=extract(year from v_period)::int
      order by g.updated_at desc limit 1;
    end if;
    if target is null then
      select g.target_amount into target from public.personal_finance_goals g
      where g.status='ACTIVE' and g.verification_status='VERIFIED' and g.kpi_code=k and g.target_level='LONG_TERM'
      order by g.updated_at desc limit 1;
    end if;

    select s.actual_value into prev_actual from public.personal_finance_kpi_snapshots s
      where s.owner_id=p_owner and s.kpi_code=k and s.period=(v_period-interval '1 month')::date limit 1;

    if actual is null or verify<>'VERIFIED' then
      gap:=null; progress:=null; kstatus:=case when actual is null then 'NO_DATA' else 'NEED_VERIFY' end;
    elsif target is null then
      gap:=null; progress:=null; kstatus:='NEED_VERIFY';
    else
      if direction='DOWN' then gap:=greatest(actual-target,0); else gap:=greatest(target-actual,0); end if;
      if target=0 then progress:=case when actual=0 then 100 else null end;
      elsif direction='DOWN' then progress:=case when actual<=target then 100 else least(100,(target/actual)*100) end;
      else progress:=least(100,greatest(0,(actual/target)*100)); end if;
      kstatus:=case when gap=0 then 'ACHIEVED' else 'NEED_VERIFY' end; -- no unapproved risk thresholds
    end if;

    if actual is null or prev_actual is null then ktrend:='NO_DATA';
    elsif abs(actual-prev_actual)<0.0001 then ktrend:='STABLE';
    elsif (direction='UP' and actual>prev_actual) or (direction='DOWN' and actual<prev_actual) then ktrend:='IMPROVING';
    else ktrend:='WORSENING'; end if;

    insert into public.personal_finance_kpi_snapshots(owner_id,period,kpi_code,target_value,actual_value,variance,progress_percent,status,trend,source,verification_status,source_updated_at,snapshot_at,updated_at)
    values(p_owner,v_period,k,target,actual,
      case when target is null or actual is null then null when direction='DOWN' then actual-target else target-actual end,
      progress,kstatus,ktrend,'PERSONAL_FINANCE_CANONICAL',verify,src_updated,now(),now())
    on conflict(owner_id,period,kpi_code) do update set
      target_value=excluded.target_value,actual_value=excluded.actual_value,variance=excluded.variance,
      progress_percent=excluded.progress_percent,status=excluded.status,trend=excluded.trend,
      source=excluded.source,verification_status=excluded.verification_status,source_updated_at=excluded.source_updated_at,
      snapshot_at=excluded.snapshot_at,updated_at=excluded.updated_at;
  end loop;
end;
$$;

revoke all on function private.refresh_personal_finance_kpi_snapshots(uuid,date) from public,anon,authenticated;
grant execute on function private.refresh_personal_finance_kpi_snapshots(uuid,date) to service_role;

create or replace function private.personal_finance_snapshot_trigger()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_owner uuid;
begin
  v_owner := coalesce(auth.uid(),new.updated_by,new.created_by,old.updated_by,old.created_by);
  if v_owner is not null then
    perform private.refresh_personal_finance_kpi_snapshots(v_owner,date_trunc('month',current_date)::date);
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function private.personal_finance_snapshot_trigger() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['personal_finance_accounts','personal_finance_transactions','personal_finance_debts','personal_finance_assets','personal_finance_goals','owner_business_transfers'] loop
    execute format('drop trigger if exists personal_finance_kpi_snapshot_refresh on public.%I',t);
    execute format('create trigger personal_finance_kpi_snapshot_refresh after insert or update on public.%I for each row execute function private.personal_finance_snapshot_trigger()',t);
  end loop;
end $$;

-- Initial current-month snapshot for existing Owner records.
do $$
declare r record;
begin
  for r in select id from public.users where role='owner' loop
    perform private.refresh_personal_finance_kpi_snapshots(r.id,date_trunc('month',current_date)::date);
  end loop;
end $$;
