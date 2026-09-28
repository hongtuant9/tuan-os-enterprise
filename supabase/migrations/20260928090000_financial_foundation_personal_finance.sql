-- TUAN OS Financial Foundation V1
-- Additive-only migration. No existing business table is dropped or destructively changed.
-- Business Finance remains FIN-HOSPITALITY-001 + authenticated business runtime.
-- Personal/Family Finance is isolated below. Consolidated views include only VERIFIED owner-level facts.
-- KiotViet document tables are INTERNAL DRAFTS ONLY; this migration contains no KiotViet commit handler.

create or replace function public.tuan_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end;
$$;

create table if not exists public.personal_finance_access (
  user_id uuid primary key references public.users(id) on delete cascade,
  can_read boolean not null default true,
  can_write boolean not null default false,
  granted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.personal_finance_access enable row level security;
drop trigger if exists personal_finance_access_set_updated_at on public.personal_finance_access;
create trigger personal_finance_access_set_updated_at before update on public.personal_finance_access
for each row execute procedure public.tuan_set_updated_at();

create or replace function public.can_access_personal_finance(require_write boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.personal_finance_access pfa
    where pfa.user_id=auth.uid()
      and pfa.can_read
      and (not require_write or pfa.can_write)
  );
$$;
revoke all on function public.can_access_personal_finance(boolean) from public;
grant execute on function public.can_access_personal_finance(boolean) to authenticated, service_role;

drop policy if exists "Personal finance access self read" on public.personal_finance_access;
create policy "Personal finance access self read" on public.personal_finance_access
for select to authenticated using (user_id=auth.uid());

create table if not exists public.personal_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('CASH','BANK','E_WALLET','BUSINESS_DISTRIBUTION','OTHER')),
  institution text,
  currency text not null default 'VND',
  current_balance numeric(18,2),
  balance_as_of date,
  value_status text not null default 'NEED_VERIFY' check (value_status in ('VERIFIED','ESTIMATED','NEED_VERIFY','HOLD')),
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  transaction_date date not null,
  layer text not null check (layer in ('PERSONAL','FAMILY')),
  direction text not null check (direction in ('INCOME','EXPENSE','TRANSFER')),
  category text not null,
  subcategory text,
  amount numeric(18,2) not null check (amount>=0),
  currency text not null default 'VND',
  account_id uuid references public.personal_finance_accounts(id) on delete set null,
  description text,
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  business_transfer_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_debts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  debt_type text not null check (debt_type in ('BANK','OVERDRAFT','FAMILY_LOAN','BUSINESS_PERSONAL_LIABILITY','OTHER')),
  lender text,
  opening_principal numeric(18,2),
  principal_outstanding numeric(18,2),
  annual_interest_rate numeric(9,6),
  monthly_debt_service numeric(18,2),
  maturity_date date,
  next_payment_date date,
  currency text not null default 'VND',
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  asset_type text not null check (asset_type in ('LIQUID','FINANCIAL','REAL_ESTATE','BUSINESS_RELATED','OTHER')),
  value_amount numeric(18,2),
  currency text not null default 'VND',
  value_as_of date,
  value_status text not null default 'NEED_VERIFY' check (value_status in ('VERIFIED','ESTIMATED','NEED_VERIFY','HOLD')),
  is_emergency_fund boolean not null default false,
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_goals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('FINANCIAL_FREEDOM','DEBT_REPAYMENT','EMERGENCY_FUND','MONTHLY_CASHFLOW')),
  name text not null,
  target_amount numeric(18,2),
  target_date date,
  currency text not null default 'VND',
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_business_transfers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  transfer_date date not null,
  business_unit text not null,
  direction text not null check (direction in ('BUSINESS_TO_PERSONAL','PERSONAL_TO_BUSINESS')),
  transfer_type text not null check (transfer_type in ('OWNER_DRAW','PROFIT_DISTRIBUTION','SALARY_COMPENSATION','OWNER_CONTRIBUTION','PERSONAL_PAID_BUSINESS','BUSINESS_PAID_PERSONAL','OTHER')),
  amount numeric(18,2) not null check (amount>=0),
  currency text not null default 'VND',
  source_system text not null,
  source_reference text not null,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id,source_system,source_reference,transfer_type)
);

alter table public.personal_finance_transactions
  add constraint personal_finance_transactions_business_transfer_fk
  foreign key (business_transfer_id) references public.owner_business_transfers(id) on delete set null;

create table if not exists public.kiotviet_document_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  document_type text not null check (document_type in ('PURCHASE','PAYMENT_EXPENSE')),
  kiotviet_system text not null check (kiotviet_system in ('FNB','HOTEL')),
  business_unit text,
  document_date date not null,
  supplier_name text,
  supplier_id text,
  warehouse_name text,
  warehouse_id text,
  payee text,
  expense_category text,
  amount numeric(18,2),
  payment_method text,
  description text,
  source_system text not null,
  source_document_id text,
  source_reference text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','VALIDATED','NEED_VERIFY','READY_FOR_APPROVAL','APPROVED','COMMITTED','FAILED','CANCELLED')),
  validation_errors jsonb not null default '[]'::jsonb,
  approval_id uuid references public.approvals(id) on delete set null,
  idempotency_key text not null,
  version int not null default 1 check (version>0),
  committed_reference text,
  created_by text not null default 'TUAN_OS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(idempotency_key,version)
);
create unique index if not exists kiotviet_document_drafts_commit_idempotency_uq
  on public.kiotviet_document_drafts(idempotency_key) where status='COMMITTED';

create table if not exists public.kiotviet_document_draft_lines (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.kiotviet_document_drafts(id) on delete cascade,
  line_no int not null,
  product_name text,
  product_id text,
  sku text,
  quantity numeric(18,4),
  unit text,
  unit_cost numeric(18,2),
  discount numeric(18,2) not null default 0,
  tax numeric(18,2) not null default 0,
  subtotal numeric(18,2),
  validation_status text not null default 'NEED_VERIFY' check (validation_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  validation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(draft_id,line_no)
);

create index if not exists personal_finance_transactions_owner_date_idx on public.personal_finance_transactions(owner_user_id,transaction_date desc);
create index if not exists personal_finance_debts_owner_active_idx on public.personal_finance_debts(owner_user_id,is_active);
create index if not exists personal_finance_assets_owner_type_idx on public.personal_finance_assets(owner_user_id,asset_type);
create index if not exists owner_business_transfers_owner_date_idx on public.owner_business_transfers(owner_user_id,transfer_date desc);
create index if not exists kiotviet_document_drafts_status_date_idx on public.kiotviet_document_drafts(status,document_date desc);
create index if not exists kiotviet_document_draft_lines_draft_idx on public.kiotviet_document_draft_lines(draft_id);

do $$
declare t text;
begin
  foreach t in array array[
    'personal_finance_accounts','personal_finance_transactions','personal_finance_debts',
    'personal_finance_assets','personal_finance_goals','owner_business_transfers','kiotviet_document_drafts'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "PF read" on public.%I',t);
    execute format('drop policy if exists "PF write" on public.%I',t);
    execute format('create policy "PF read" on public.%I for select to authenticated using (owner_user_id=auth.uid() and public.can_access_personal_finance(false))',t);
    execute format('create policy "PF write" on public.%I for all to authenticated using (owner_user_id=auth.uid() and public.can_access_personal_finance(true)) with check (owner_user_id=auth.uid() and public.can_access_personal_finance(true))',t);
  end loop;
end $$;

alter table public.kiotviet_document_draft_lines enable row level security;
drop policy if exists "PF read" on public.kiotviet_document_draft_lines;
drop policy if exists "PF write" on public.kiotviet_document_draft_lines;
create policy "PF read" on public.kiotviet_document_draft_lines
for select to authenticated using (
  exists(select 1 from public.kiotviet_document_drafts d
    where d.id=draft_id and d.owner_user_id=auth.uid() and public.can_access_personal_finance(false))
);
create policy "PF write" on public.kiotviet_document_draft_lines
for all to authenticated
using (
  exists(select 1 from public.kiotviet_document_drafts d
    where d.id=draft_id and d.owner_user_id=auth.uid() and public.can_access_personal_finance(true))
)
with check (
  exists(select 1 from public.kiotviet_document_drafts d
    where d.id=draft_id and d.owner_user_id=auth.uid() and public.can_access_personal_finance(true))
);

do $$
declare t text;
begin
  foreach t in array array[
    'personal_finance_accounts','personal_finance_transactions','personal_finance_debts',
    'personal_finance_assets','personal_finance_goals','owner_business_transfers',
    'kiotviet_document_drafts','kiotviet_document_draft_lines'
  ] loop
    execute format('drop trigger if exists %I on public.%I',t||'_set_updated_at',t);
    execute format('create trigger %I before update on public.%I for each row execute procedure public.tuan_set_updated_at()',t||'_set_updated_at',t);
  end loop;
end $$;

create or replace view public.personal_finance_monthly_v
with (security_invoker=true) as
with tx as (
  select owner_user_id,date_trunc('month',transaction_date)::date as month,
    sum(amount) filter(where direction='INCOME' and verification_status='VERIFIED') as income_actual,
    sum(amount) filter(where direction='EXPENSE' and verification_status='VERIFIED') as expense_actual
  from public.personal_finance_transactions
  group by owner_user_id,date_trunc('month',transaction_date)::date
),
dist as (
  select owner_user_id,date_trunc('month',transfer_date)::date as month,
    sum(amount) filter(where direction='BUSINESS_TO_PERSONAL' and verification_status='VERIFIED') as business_income_actual
  from public.owner_business_transfers
  group by owner_user_id,date_trunc('month',transfer_date)::date
)
select coalesce(tx.owner_user_id,dist.owner_user_id) owner_user_id,
  coalesce(tx.month,dist.month) month,
  coalesce(tx.income_actual,0)+coalesce(dist.business_income_actual,0) personal_income_actual,
  coalesce(tx.expense_actual,0) personal_expense_actual,
  coalesce(tx.income_actual,0)+coalesce(dist.business_income_actual,0)-coalesce(tx.expense_actual,0) personal_net_cash_flow
from tx full outer join dist on dist.owner_user_id=tx.owner_user_id and dist.month=tx.month;

create or replace view public.owner_finance_summary_v
with (security_invoker=true) as
select u.id owner_user_id,
  coalesce((select sum(a.value_amount) from public.personal_finance_assets a where a.owner_user_id=u.id and a.verification_status='VERIFIED' and a.value_status='VERIFIED'),0) verified_assets,
  coalesce((select sum(d.principal_outstanding) from public.personal_finance_debts d where d.owner_user_id=u.id and d.verification_status='VERIFIED' and d.is_active),0) verified_liabilities,
  coalesce((select sum(a.value_amount) from public.personal_finance_assets a where a.owner_user_id=u.id and a.verification_status='VERIFIED' and a.value_status='VERIFIED' and a.is_emergency_fund),0) verified_emergency_fund,
  coalesce((select sum(ac.current_balance) from public.personal_finance_accounts ac where ac.owner_user_id=u.id and ac.verification_status='VERIFIED' and ac.value_status='VERIFIED' and ac.is_active),0) verified_available_cash,
  coalesce((select sum(d.monthly_debt_service) from public.personal_finance_debts d where d.owner_user_id=u.id and d.verification_status='VERIFIED' and d.is_active),0) verified_monthly_debt_service
from public.users u
where exists(select 1 from public.personal_finance_access pfa where pfa.user_id=u.id and pfa.can_read);

grant select on public.personal_finance_monthly_v,public.owner_finance_summary_v to authenticated,service_role;

insert into public.personal_finance_access(user_id,can_read,can_write,granted_by)
select id,true,true,'CEO_APPROVAL_2026-09-28'
from public.users
where role='owner' or lower(coalesce(email,''))='hongtuant9@gmail.com'
on conflict(user_id) do update
set can_read=true,can_write=true,granted_by='CEO_APPROVAL_2026-09-28',updated_at=now();

insert into public.sync_sources(key,name,description,supports_incremental,schedule_enabled,schedule_interval_minutes,status)
values
 ('kiotviet_fnb_invoices','KiotViet F&B — Invoices','Runtime transaction mirror; KiotViet remains authority.',true,false,5,'idle'),
 ('kiotviet_fnb_purchases','KiotViet F&B — Purchases','Runtime purchase mirror when authenticated endpoint/browser evidence is available.',true,false,5,'idle'),
 ('kiotviet_hotel_invoices','KiotViet Hotel — Invoices','Runtime hotel invoice mirror; KiotViet remains authority.',true,false,5,'idle'),
 ('kiotviet_hotel_bookings','KiotViet Hotel — Bookings','Runtime booking/guest/channel mirror; KiotViet remains authority.',true,false,5,'idle')
on conflict(key) do update set name=excluded.name,description=excluded.description,supports_incremental=excluded.supports_incremental,schedule_interval_minutes=excluded.schedule_interval_minutes,updated_at=now();

comment on table public.personal_finance_transactions is
'Canonical Personal/Family Finance transaction layer. Never insert business revenue here as owner income.';
comment on table public.owner_business_transfers is
'Verified bridge between Business Finance and Personal Finance; only actual owner-level transfers/distributions cross layers.';
comment on table public.kiotviet_document_drafts is
'TUAN OS internal drafts only. APPROVED is preparation status; COMMITTED requires separate execution approval and a future commit handler.';
