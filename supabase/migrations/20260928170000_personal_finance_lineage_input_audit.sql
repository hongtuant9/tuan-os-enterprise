-- TUAN OS Personal Finance Lineage/Input/Audit hardening
-- Additive hardening after 20260928133000 Financial Foundation.
-- No external financial commit is enabled.

create schema if not exists private;

alter table public.personal_finance_accounts
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists updated_by uuid references public.users(id) on delete set null,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_evidence text,
  add column if not exists verified_at timestamptz,
  add column if not exists external_key text;

alter table public.personal_finance_transactions
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists updated_by uuid references public.users(id) on delete set null,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_evidence text,
  add column if not exists verified_at timestamptz,
  add column if not exists external_key text,
  add column if not exists record_status text not null default 'ACTIVE'
    check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED'));

alter table public.personal_finance_debts
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists updated_by uuid references public.users(id) on delete set null,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_evidence text,
  add column if not exists verified_at timestamptz,
  add column if not exists external_key text;

alter table public.personal_finance_assets
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists updated_by uuid references public.users(id) on delete set null,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_evidence text,
  add column if not exists verified_at timestamptz,
  add column if not exists external_key text,
  add column if not exists record_status text not null default 'ACTIVE'
    check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED'));

alter table public.personal_finance_goals
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists updated_by uuid references public.users(id) on delete set null,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_evidence text,
  add column if not exists verified_at timestamptz,
  add column if not exists external_key text;

alter table public.owner_business_transfers
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists updated_by uuid references public.users(id) on delete set null,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_evidence text,
  add column if not exists verified_at timestamptz,
  add column if not exists external_key text,
  add column if not exists record_status text not null default 'ACTIVE'
    check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED'));

update public.personal_finance_goals
set verification_evidence = coalesce(verification_evidence,'Owner-approved goal recorded in TUAN OS — Mô hình tài chính gia đình'),
    verified_at = coalesce(verified_at,timestamptz '2026-08-12 00:00:00+07'),
    source_updated_at = coalesce(source_updated_at,timestamptz '2026-08-12 00:00:00+07')
where verification_status='VERIFIED' and source_reference='03_TaiSan_MucTieu_FI!B19';

alter table public.personal_finance_accounts add constraint personal_finance_accounts_verified_evidence_ck
  check (verification_status <> 'VERIFIED' or (nullif(trim(verification_evidence),'') is not null and verified_at is not null and source_updated_at is not null));
alter table public.personal_finance_transactions add constraint personal_finance_transactions_verified_evidence_ck
  check (verification_status <> 'VERIFIED' or (nullif(trim(verification_evidence),'') is not null and verified_at is not null and source_updated_at is not null));
alter table public.personal_finance_debts add constraint personal_finance_debts_verified_evidence_ck
  check (verification_status <> 'VERIFIED' or (nullif(trim(verification_evidence),'') is not null and verified_at is not null and source_updated_at is not null));
alter table public.personal_finance_assets add constraint personal_finance_assets_verified_evidence_ck
  check (verification_status <> 'VERIFIED' or (nullif(trim(verification_evidence),'') is not null and verified_at is not null and source_updated_at is not null));
alter table public.personal_finance_goals add constraint personal_finance_goals_verified_evidence_ck
  check (verification_status <> 'VERIFIED' or (nullif(trim(verification_evidence),'') is not null and verified_at is not null and source_updated_at is not null));
alter table public.owner_business_transfers add constraint owner_business_transfers_verified_evidence_ck
  check (verification_status <> 'VERIFIED' or (nullif(trim(verification_evidence),'') is not null and verified_at is not null and source_updated_at is not null));

create unique index if not exists personal_finance_accounts_source_external_uq
  on public.personal_finance_accounts(source,external_key);
create unique index if not exists personal_finance_transactions_source_external_uq
  on public.personal_finance_transactions(source,external_key);
create unique index if not exists personal_finance_debts_source_external_uq
  on public.personal_finance_debts(source,external_key);
create unique index if not exists personal_finance_assets_source_external_uq
  on public.personal_finance_assets(source,external_key);
create unique index if not exists personal_finance_goals_source_external_uq
  on public.personal_finance_goals(source,external_key);
create unique index if not exists owner_business_transfers_source_external_uq
  on public.owner_business_transfers(source,external_key);

create table if not exists public.personal_finance_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('INSERT','UPDATE','IMPORT','VERIFY','SUPERSEDE')),
  actor_id uuid references public.users(id) on delete set null,
  source text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.personal_finance_audit_log enable row level security;
revoke all on public.personal_finance_audit_log from anon, authenticated;
grant select on public.personal_finance_audit_log to authenticated, service_role;
grant all on public.personal_finance_audit_log to service_role;

drop policy if exists "Personal finance audit owner read" on public.personal_finance_audit_log;
create policy "Personal finance audit owner read"
  on public.personal_finance_audit_log for select to authenticated
  using (public.is_personal_finance_owner());

create or replace function private.personal_finance_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.personal_finance_audit_log(
    entity_type,entity_id,action,actor_id,source,before_data,after_data
  )
  values (
    tg_table_name,
    coalesce(new.id,old.id),
    case when tg_op='INSERT' then 'INSERT' else 'UPDATE' end,
    auth.uid(),
    coalesce(new.source,old.source,'UNKNOWN'),
    case when tg_op='UPDATE' then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return new;
end;
$$;

revoke all on function private.personal_finance_audit_trigger() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'personal_finance_accounts','personal_finance_transactions','personal_finance_debts',
    'personal_finance_assets','personal_finance_goals','owner_business_transfers'
  ]
  loop
    execute format('drop trigger if exists personal_finance_audit on public.%I',t);
    execute format('create trigger personal_finance_audit after insert or update on public.%I for each row execute function private.personal_finance_audit_trigger()',t);
  end loop;
end $$;

-- No hard delete from authenticated clients.
drop policy if exists "Personal accounts owner only" on public.personal_finance_accounts;
drop policy if exists "Personal transactions owner only" on public.personal_finance_transactions;
drop policy if exists "Personal debts owner only" on public.personal_finance_debts;
drop policy if exists "Personal assets owner only" on public.personal_finance_assets;
drop policy if exists "Personal goals owner only" on public.personal_finance_goals;
drop policy if exists "Owner business transfers owner only" on public.owner_business_transfers;

do $$
declare t text;
begin
  foreach t in array array[
    'personal_finance_accounts','personal_finance_transactions','personal_finance_debts',
    'personal_finance_assets','personal_finance_goals','owner_business_transfers'
  ]
  loop
    execute format('revoke delete on public.%I from authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_personal_finance_owner())',t||' owner select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_personal_finance_owner())',t||' owner insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_personal_finance_owner()) with check (public.is_personal_finance_owner())',t||' owner update',t);
  end loop;
end $$;

create or replace view public.personal_finance_monthly_v
with (security_invoker=true)
as
with p as (
  select date_trunc('month',transaction_date)::date as month,
    sum(case when transaction_type='INCOME' and verification_status='VERIFIED' and record_status='ACTIVE' then amount else 0 end) as personal_income,
    count(*) filter(where transaction_type='INCOME' and verification_status='VERIFIED' and record_status='ACTIVE') as verified_income_count,
    count(*) filter(where transaction_type='INCOME' and verification_status<>'VERIFIED' and record_status='ACTIVE') as unverified_income_count,
    sum(case when transaction_type='EXPENSE' and verification_status='VERIFIED' and record_status='ACTIVE' then amount else 0 end) as personal_expense,
    count(*) filter(where transaction_type='EXPENSE' and verification_status='VERIFIED' and record_status='ACTIVE') as verified_expense_count,
    count(*) filter(where transaction_type='EXPENSE' and verification_status<>'VERIFIED' and record_status='ACTIVE') as unverified_expense_count,
    sum(case when transaction_type in ('EXPENSE','DEBT_PAYMENT') and verification_status='VERIFIED' and record_status='ACTIVE' then amount else 0 end) as personal_cash_out,
    sum(case when transaction_type='INCOME' and verification_status='VERIFIED' and record_status='ACTIVE' then amount
             when transaction_type in ('EXPENSE','DEBT_PAYMENT') and verification_status='VERIFIED' and record_status='ACTIVE' then -amount else 0 end) as personal_net_cash_flow,
    count(*) filter(where transaction_type in ('INCOME','EXPENSE','DEBT_PAYMENT') and verification_status='VERIFIED' and record_status='ACTIVE') as verified_cashflow_count,
    count(*) filter(where transaction_type in ('INCOME','EXPENSE','DEBT_PAYMENT') and verification_status<>'VERIFIED' and record_status='ACTIVE') as unverified_cashflow_count,
    max(updated_at) as personal_last_updated_at,
    max(source_updated_at) as personal_source_updated_at
  from public.personal_finance_transactions
  where business_transfer_id is null
  group by 1
), b as (
  select date_trunc('month',transfer_date)::date as month,
    sum(case when direction='BUSINESS_TO_PERSONAL' and verification_status='VERIFIED' and record_status='ACTIVE' then amount else 0 end) as business_to_personal,
    sum(case when direction='PERSONAL_TO_BUSINESS' and verification_status='VERIFIED' and record_status='ACTIVE' then amount else 0 end) as personal_to_business,
    count(*) filter(where verification_status='VERIFIED' and record_status='ACTIVE') as verified_transfer_count,
    count(*) filter(where verification_status<>'VERIFIED' and record_status='ACTIVE') as unverified_transfer_count,
    max(updated_at) as transfer_last_updated_at,
    max(source_updated_at) as transfer_source_updated_at
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
  coalesce(b.business_to_personal,0) as verified_business_distribution_received,
  coalesce(p.verified_income_count,0) as verified_income_count,
  coalesce(p.unverified_income_count,0) as unverified_income_count,
  coalesce(p.verified_expense_count,0) as verified_expense_count,
  coalesce(p.unverified_expense_count,0) as unverified_expense_count,
  coalesce(p.verified_cashflow_count,0)+coalesce(b.verified_transfer_count,0) as verified_cashflow_count,
  coalesce(p.unverified_cashflow_count,0)+coalesce(b.unverified_transfer_count,0) as unverified_cashflow_count,
  coalesce(b.verified_transfer_count,0) as verified_transfer_count,
  coalesce(b.unverified_transfer_count,0) as unverified_transfer_count,
  greatest(p.personal_last_updated_at,b.transfer_last_updated_at) as last_updated_at,
  greatest(p.personal_source_updated_at,b.transfer_source_updated_at) as source_updated_at
from months m
left join p using(month)
left join b using(month);

comment on table public.personal_finance_audit_log is 'Owner-only append-only audit trail for Personal Finance changes. Never expose to public/staff.';
comment on column public.personal_finance_transactions.external_key is 'Idempotency key for imported/external personal finance records.';
comment on column public.owner_business_transfers.external_key is 'Idempotency key for imported/external Business ↔ Personal transfers.';
