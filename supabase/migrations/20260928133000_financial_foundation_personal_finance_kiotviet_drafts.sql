-- TUAN OS Financial Foundation
-- Scope: additive only. Business finance remains separate from personal/family finance.
-- KiotViet financial commit is NOT enabled by this migration.

create or replace function public.is_personal_finance_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role = 'owner'
  );
$$;

create or replace function public.can_manage_financial_drafts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role in ('owner','admin')
  );
$$;

revoke all on function public.is_personal_finance_owner() from public;
revoke all on function public.can_manage_financial_drafts() from public;
grant execute on function public.is_personal_finance_owner() to authenticated, service_role;
grant execute on function public.can_manage_financial_drafts() to authenticated, service_role;

create table if not exists public.business_finance_monthly (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  business_unit text not null check (business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED')),
  revenue_actual numeric(18,2),
  cogs_actual numeric(18,2),
  payroll_actual numeric(18,2),
  opex_actual numeric(18,2),
  tax_actual numeric(18,2),
  net_profit_actual numeric(18,2),
  distributable_cash numeric(18,2),
  owner_distribution_actual numeric(18,2),
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month,business_unit)
);

create table if not exists public.personal_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null check (account_type in ('CASH','BANK','E_WALLET','BUSINESS_DISTRIBUTION','OTHER')),
  institution text,
  currency text not null default 'VND',
  current_balance numeric(18,2),
  balance_as_of date,
  is_liquid boolean not null default true,
  is_emergency_fund boolean not null default false,
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  transaction_type text not null
    check (transaction_type in ('INCOME','EXPENSE','DEBT_PAYMENT','TRANSFER','OTHER')),
  category text not null,
  description text,
  account_id uuid references public.personal_finance_accounts(id) on delete set null,
  amount numeric(18,2) not null check (amount >= 0),
  is_essential boolean not null default false,
  is_sustainable_income boolean not null default false,
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  debt_type text not null check (debt_type in ('BANK','OVERDRAFT','FAMILY','BUSINESS_PERSONAL_LIABILITY','OTHER')),
  opening_principal numeric(18,2),
  current_principal numeric(18,2),
  interest_rate_annual numeric(9,6),
  monthly_debt_service numeric(18,2),
  maturity_date date,
  next_payment_date date,
  as_of_date date,
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED','HOLD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  asset_type text not null check (asset_type in ('LIQUID','NON_LIQUID','BUSINESS_RELATED','OTHER')),
  value_amount numeric(18,2),
  valuation_kind text not null default 'UNKNOWN' check (valuation_kind in ('VERIFIED','ESTIMATED','UNKNOWN')),
  as_of_date date,
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_finance_goals (
  id uuid primary key default gen_random_uuid(),
  goal_type text not null check (goal_type in ('FINANCIAL_FREEDOM','DEBT_REPAYMENT','EMERGENCY_FUND','MONTHLY_CASHFLOW')),
  name text not null,
  target_amount numeric(18,2),
  target_date date,
  source text not null,
  source_reference text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ACHIEVED','HOLD','SUPERSEDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_business_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  business_unit text not null check (business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED','OTHER')),
  direction text not null check (direction in ('BUSINESS_TO_PERSONAL','PERSONAL_TO_BUSINESS')),
  transfer_type text not null check (transfer_type in ('OWNER_DISTRIBUTION','OWNER_DRAW','SALARY_COMPENSATION','OWNER_CONTRIBUTION','PERSONAL_PAID_BUSINESS','BUSINESS_PAID_PERSONAL','OTHER')),
  amount numeric(18,2) not null check (amount >= 0),
  source text not null,
  source_reference text not null,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_reference, direction, transfer_type)
);

create table if not exists public.kiotviet_document_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_id text not null unique,
  version integer not null default 1 check (version > 0),
  document_type text not null check (document_type in ('PURCHASE_RECEIPT','PAYMENT_VOUCHER')),
  kiotviet_system text not null check (kiotviet_system in ('FNB','HOTEL')),
  business_unit text not null,
  supplier_name text,
  supplier_id text,
  payee text,
  warehouse_name text,
  warehouse_id text,
  expense_category text,
  document_date date not null,
  payment_method text,
  amount numeric(18,2),
  discount_amount numeric(18,2),
  tax_amount numeric(18,2),
  subtotal numeric(18,2),
  total numeric(18,2),
  description text,
  source_system text not null,
  source_document_id text not null,
  source_reference text,
  evidence jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','VALIDATED','NEED_VERIFY','READY_FOR_APPROVAL','APPROVED','COMMITTED','FAILED','CANCELLED')),
  approval_id uuid references public.approvals(id) on delete set null,
  canonical_commit_key text not null,
  committed_provider_id text,
  readback_verified_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_commit_key, version)
);

create table if not exists public.kiotviet_document_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.kiotviet_document_drafts(id) on delete cascade,
  line_no integer not null,
  sku text,
  product_id text,
  item_name text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  unit text not null,
  unit_cost numeric(18,2) not null check (unit_cost >= 0),
  discount_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null check (line_total >= 0),
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  validation_note text,
  created_at timestamptz not null default now(),
  unique (draft_id,line_no)
);

create unique index if not exists kiotviet_document_committed_key_uq
  on public.kiotviet_document_drafts(canonical_commit_key)
  where status = 'COMMITTED';

create index if not exists business_finance_monthly_month_idx on public.business_finance_monthly(month desc,business_unit);
create index if not exists personal_finance_transactions_date_idx on public.personal_finance_transactions(transaction_date desc);
create index if not exists personal_finance_debts_status_idx on public.personal_finance_debts(status,as_of_date desc);
create index if not exists personal_finance_assets_type_idx on public.personal_finance_assets(asset_type,as_of_date desc);
create index if not exists owner_business_transfers_date_idx on public.owner_business_transfers(transfer_date desc);
create index if not exists kiotviet_document_drafts_status_idx on public.kiotviet_document_drafts(status,document_date desc);
create index if not exists kiotviet_document_draft_items_draft_idx on public.kiotviet_document_draft_items(draft_id);

-- updated_at hooks reuse the canonical helper already present in TUAN OS.
do $$
declare t text;
begin
  foreach t in array array[
    'business_finance_monthly','personal_finance_accounts','personal_finance_transactions',
    'personal_finance_debts','personal_finance_assets','personal_finance_goals',
    'owner_business_transfers','kiotviet_document_drafts'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I',t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()',t);
  end loop;
end $$;

-- RLS.
alter table public.business_finance_monthly enable row level security;
alter table public.personal_finance_accounts enable row level security;
alter table public.personal_finance_transactions enable row level security;
alter table public.personal_finance_debts enable row level security;
alter table public.personal_finance_assets enable row level security;
alter table public.personal_finance_goals enable row level security;
alter table public.owner_business_transfers enable row level security;
alter table public.kiotviet_document_drafts enable row level security;
alter table public.kiotviet_document_draft_items enable row level security;

-- Business monthly aggregates are authenticated operational data; personal layer is owner-only.
create policy "Business finance monthly authenticated read"
  on public.business_finance_monthly for select to authenticated using (true);
create policy "Business finance monthly service write"
  on public.business_finance_monthly for all to service_role using (true) with check (true);

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

create policy "Financial drafts privileged read" on public.kiotviet_document_drafts for select to authenticated
  using (public.can_manage_financial_drafts());
create policy "Financial drafts privileged write" on public.kiotviet_document_drafts for all to authenticated
  using (public.can_manage_financial_drafts()) with check (public.can_manage_financial_drafts());
create policy "Financial draft items privileged read" on public.kiotviet_document_draft_items for select to authenticated
  using (public.can_manage_financial_drafts());
create policy "Financial draft items privileged write" on public.kiotviet_document_draft_items for all to authenticated
  using (public.can_manage_financial_drafts())
  with check (public.can_manage_financial_drafts());

grant select on public.business_finance_monthly to authenticated;
grant all on public.business_finance_monthly to service_role;
grant select,insert,update,delete on public.personal_finance_accounts,public.personal_finance_transactions,
  public.personal_finance_debts,public.personal_finance_assets,public.personal_finance_goals,
  public.owner_business_transfers,public.kiotviet_document_drafts,public.kiotviet_document_draft_items to authenticated;
grant all on public.personal_finance_accounts,public.personal_finance_transactions,public.personal_finance_debts,
  public.personal_finance_assets,public.personal_finance_goals,public.owner_business_transfers,
  public.kiotviet_document_drafts,public.kiotviet_document_draft_items to service_role;

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

create or replace view public.owner_finance_position_v
with (security_invoker=true)
as
with a as (
  select
    coalesce(sum(value_amount) filter(where verification_status='VERIFIED' and valuation_kind='VERIFIED'),0) as verified_assets,
    count(*) filter(where verification_status<>'VERIFIED' or valuation_kind<>'VERIFIED' or value_amount is null) as unverified_asset_count
  from public.personal_finance_assets
), d as (
  select
    coalesce(sum(current_principal) filter(where verification_status='VERIFIED' and status='ACTIVE'),0) as verified_liabilities,
    count(*) filter(where status='ACTIVE' and (verification_status<>'VERIFIED' or current_principal is null)) as unverified_debt_count,
    coalesce(sum(monthly_debt_service) filter(where verification_status='VERIFIED' and status='ACTIVE'),0) as monthly_debt_service
  from public.personal_finance_debts
), cash as (
  select coalesce(sum(current_balance) filter(where verification_status='VERIFIED' and is_liquid),0) as available_cash,
         coalesce(sum(current_balance) filter(where verification_status='VERIFIED' and is_emergency_fund),0) as emergency_fund
  from public.personal_finance_accounts
), essential as (
  select avg(month_total) as avg_essential_monthly_expense
  from (
    select date_trunc('month',transaction_date),sum(amount) as month_total
    from public.personal_finance_transactions
    where verification_status='VERIFIED' and transaction_type='EXPENSE' and is_essential
      and transaction_date >= (current_date - interval '3 months')
    group by 1
  ) x
)
select a.verified_assets,d.verified_liabilities,
  case when a.unverified_asset_count=0 and d.unverified_debt_count=0 then a.verified_assets-d.verified_liabilities else null end as net_worth,
  a.unverified_asset_count,d.unverified_debt_count,d.monthly_debt_service,
  cash.available_cash,cash.emergency_fund,essential.avg_essential_monthly_expense,
  case when essential.avg_essential_monthly_expense>0 then cash.emergency_fund/essential.avg_essential_monthly_expense else null end as emergency_fund_coverage_months
from a cross join d cross join cash cross join essential;

grant select on public.personal_finance_monthly_v,public.owner_finance_position_v to authenticated,service_role;

-- Register KiotViet runtime sources. sync_records remains the generic operational cache/idempotency ledger.
insert into public.sync_sources(key,name,description,supports_incremental,schedule_enabled,schedule_interval_minutes,status)
values
 ('kiotviet_hotel_invoices','KiotViet Hotel — Invoices','Authenticated runtime invoice source; transaction System of Record.',true,true,5,'idle'),
 ('kiotviet_hotel_bookings','KiotViet Hotel — Bookings','Authenticated runtime booking/order source for guest/channel allocation.',true,true,5,'idle'),
 ('kiotviet_fnb_invoices','KiotViet F&B — Invoices','Authenticated runtime invoice/payment source; transaction System of Record.',true,true,5,'idle'),
 ('kiotviet_fnb_purchase_orders','KiotViet F&B — Purchase Orders','Authenticated purchase source. Unsupported API paths must remain NEED_VERIFY and may use browser read fallback.',true,true,15,'idle')
on conflict(key) do update set
  name=excluded.name,
  description=excluded.description,
  supports_incremental=excluded.supports_incremental,
  schedule_enabled=excluded.schedule_enabled,
  schedule_interval_minutes=excluded.schedule_interval_minutes,
  updated_at=now();

-- Owner-approved goal only. No unverified asset/debt actual is promoted to VERIFIED by this migration.
insert into public.personal_finance_goals(goal_type,name,target_amount,source,source_reference,verification_status,status)
select 'FINANCIAL_FREEDOM','Mục tiêu tự do tài chính',18000000000,
       'TUAN OS — Mô hình tài chính gia đình','03_TaiSan_MucTieu_FI!B19','VERIFIED','ACTIVE'
where not exists(select 1 from public.personal_finance_goals where goal_type='FINANCIAL_FREEDOM' and status='ACTIVE');

comment on table public.business_finance_monthly is 'Monthly business-finance read model. No transaction ledger; values must remain source-linked and verified.';
comment on table public.owner_business_transfers is 'Only actual owner/business transfers. Business revenue or accounting profit must never be copied here as personal income without actual verified transfer/distribution.';
comment on table public.kiotviet_document_drafts is 'TUAN OS internal drafts only. This table does not authorize or perform KiotViet financial commit.';
