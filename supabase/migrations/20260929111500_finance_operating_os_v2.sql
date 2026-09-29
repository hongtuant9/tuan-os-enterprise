-- TUAN OS Finance Operating OS v2
-- Cutover: 30/09/2026 opening, canonical actual from 01/10/2026.
-- Additive only. No bank transfer, tax payment, debt repayment or investment is executed.

alter table public.finance_accounts
  add column if not exists account_roles text[] not null default '{}'::text[],
  add column if not exists bank_balance numeric(18,2),
  add column if not exists book_balance numeric(18,2),
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists reconciliation_status text not null default 'NEED_VERIFY',
  add column if not exists is_restricted_cash boolean not null default false,
  add column if not exists purpose_note text;

alter table public.finance_accounts drop constraint if exists finance_accounts_reconciliation_status_ck;
alter table public.finance_accounts add constraint finance_accounts_reconciliation_status_ck
  check(reconciliation_status in ('MATCHED','VARIANCE','STALE','NEED_VERIFY'));

-- Owner-approved account map from the 29/09 finance operating instruction.
update public.finance_accounts set
  financial_domain='PERSONAL', business_unit='PERSONAL', ownership_status='VERIFIED',
  account_roles=array['PERSONAL_OPERATING_ACCOUNT'], bank_balance=current_balance, book_balance=current_balance,
  reconciliation_status='MATCHED', last_reconciled_at=now(), purpose_note='Owner distribution / personal and family operating cash',
  updated_at=now()
where account_code='OPEN-BIDV-TUAN';

update public.finance_accounts set
  financial_domain='BUSINESS', business_unit='HOSPITALITY_SHARED', ownership_status='VERIFIED',
  account_roles=array['BUSINESS_OPERATING_ACCOUNT'], bank_balance=current_balance, book_balance=current_balance,
  reconciliation_status='MATCHED', last_reconciled_at=now(), purpose_note='Business operating account; every transaction requires business_unit dimension',
  updated_at=now()
where account_code='OPEN-HKD-TUAN';

update public.finance_accounts set
  account_roles=array['NEED_VERIFY'], bank_balance=current_balance, book_balance=current_balance,
  reconciliation_status='MATCHED', purpose_note='Opening balance verified; role must be mapped to Safety or Tax Reserve without double counting',
  updated_at=now()
where account_code='OPEN-TPBANK-TUAN';

insert into public.finance_accounts(account_code,display_name,institution,financial_domain,business_unit,opening_balance,current_balance,balance_as_of,ownership_status,verification_status,source,source_reference,evidence,account_roles,bank_balance,book_balance,reconciliation_status,is_restricted_cash,purpose_note)
values
 ('ROLE-HKD-RUBY','HKD Ruby',null,'BUSINESS','RUBY',null,null,'2026-09-30','NEED_VERIFY','NEED_VERIFY','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929',jsonb_build_object('note','Routing must be audited before use'),array['BUSINESS_OPERATING_ACCOUNT','OTA_SETTLEMENT_ACCOUNT'],null,null,'NEED_VERIFY',false,'Ruby operating / OTA settlement routing; balance not supplied'),
 ('ROLE-TPBANK-SAFETY','TPBank — Quỹ an toàn','TPBank','PERSONAL','PERSONAL',null,null,'2026-09-30','NEED_VERIFY','NEED_VERIFY','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929',jsonb_build_object('note','Role required; map real account before counting cash'),array['PERSONAL_SAFETY_ACCOUNT'],null,null,'NEED_VERIFY',true,'Personal safety/emergency fund; not daily spending'),
 ('ROLE-TPBANK-TAX','TPBank — Quỹ thuế','TPBank','BUSINESS','HOSPITALITY_SHARED',null,null,'2026-09-30','NEED_VERIFY','NEED_VERIFY','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929',jsonb_build_object('note','Dedicated restricted tax reserve account required'),array['BUSINESS_TAX_RESERVE_ACCOUNT'],null,null,'NEED_VERIFY',true,'Restricted cash: tax provision and tax payment only')
on conflict(account_code) do update set account_roles=excluded.account_roles,financial_domain=excluded.financial_domain,business_unit=excluded.business_unit,is_restricted_cash=excluded.is_restricted_cash,purpose_note=excluded.purpose_note,updated_at=now();

create table if not exists public.finance_tax_positions (
  id uuid primary key default gen_random_uuid(),
  period date not null,
  business_unit text not null check(business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED','CONSOLIDATED')),
  profit_before_tax numeric(18,2),
  tax_provision numeric(18,2),
  tax_actual numeric(18,2),
  tax_payable numeric(18,2),
  tax_reserve_required numeric(18,2),
  tax_reserve_balance numeric(18,2),
  tax_rule_reference text,
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD','ESTIMATED')),
  source text not null,
  source_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period,business_unit)
);

create table if not exists public.finance_allocation_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_month date not null,
  business_unit text not null default 'CONSOLIDATED' check(business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED','CONSOLIDATED')),
  profit_before_tax numeric(18,2),
  tax_reserve_required numeric(18,2),
  profit_after_tax numeric(18,2),
  business_cash numeric(18,2),
  accounts_payable numeric(18,2),
  payroll_due numeric(18,2),
  utilities_due numeric(18,2),
  ota_commission_due numeric(18,2),
  supplier_payable numeric(18,2),
  debt_interest_due numeric(18,2),
  operating_reserve_required numeric(18,2),
  owner_distributable_cash numeric(18,2),
  recommendation jsonb not null default '{}'::jsonb,
  owner_adjustment jsonb not null default '{}'::jsonb,
  total_allocation numeric(18,2) not null default 0,
  remaining_cash numeric(18,2),
  status text not null default 'DRAFT' check(status in ('DRAFT','READY_FOR_CEO','APPROVED','SUPERSEDED','CANCELLED')),
  verification_status text not null default 'HOLD' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD','ESTIMATED')),
  calculation_note text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(total_allocation>=0)
);

create unique index if not exists finance_allocation_proposals_active_uq
  on public.finance_allocation_proposals(proposal_month,business_unit)
  where status in ('DRAFT','READY_FOR_CEO','APPROVED');

create table if not exists public.finance_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  transfer_id text not null unique,
  proposal_id uuid references public.finance_allocation_proposals(id),
  approval_id uuid references public.approvals(id),
  source_account_code text not null references public.finance_accounts(account_code),
  destination_account_code text references public.finance_accounts(account_code),
  destination_label text,
  purpose text not null,
  amount numeric(18,2) not null check(amount>0),
  source_balance_before numeric(18,2),
  source_balance_after numeric(18,2),
  destination_balance_before numeric(18,2),
  destination_balance_after numeric(18,2),
  business_liquidity_impact numeric(18,2),
  tax_reserve_impact numeric(18,2),
  personal_cash_impact numeric(18,2),
  emergency_fund_impact numeric(18,2),
  debt_impact numeric(18,2),
  projected_interest_impact numeric(18,2),
  status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','SUBMITTED','PENDING_BANK','CONFIRMED','RECONCILED','FAILED','CANCELLED')),
  verification_status text not null default 'HOLD' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  bank_confirmation_reference text,
  reconciled_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status not in ('CONFIRMED','RECONCILED') or bank_confirmation_reference is not null),
  check(status<>'RECONCILED' or reconciled_at is not null)
);

create table if not exists public.finance_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null check(action in ('INSERT','UPDATE','VERIFY','VOID','INACTIVATE','APPROVE','RECONCILE')),
  actor_id uuid references public.users(id),
  source text not null default 'TUAN_OS',
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- RLS: sensitive finance-control data is Owner-only. Runtime writes use service_role.
do $$ declare t text; begin
  foreach t in array array['finance_tax_positions','finance_allocation_proposals','finance_transfer_requests','finance_audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists %I on public.%I',t||' owner select',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_personal_finance_owner())',t||' owner select',t);
  end loop;
end $$;

-- No hard-delete of canonical finance records after cutover.
create or replace function private.prevent_finance_hard_delete()
returns trigger language plpgsql as $$ begin
  raise exception 'Hard delete is disabled for canonical finance records. Use VOID/INACTIVE/SUPERSEDED.';
end $$;

do $$ declare t text; begin
  foreach t in array array['finance_accounts','finance_credit_facilities','business_finance_open_items','business_finance_transactions','finance_tax_positions','finance_allocation_proposals','finance_transfer_requests'] loop
    execute format('drop trigger if exists prevent_finance_hard_delete on public.%I',t);
    execute format('create trigger prevent_finance_hard_delete before delete on public.%I for each row execute function private.prevent_finance_hard_delete()',t);
  end loop;
end $$;

create or replace function private.finance_audit_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_id uuid; begin
  begin v_id := coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid); exception when others then v_id:=null; end;
  insert into public.finance_audit_log(entity_type,entity_id,action,actor_id,source,before_data,after_data)
  values(TG_TABLE_NAME,v_id,case when TG_OP='INSERT' then 'INSERT' else 'UPDATE' end,auth.uid(),'DB_TRIGGER',case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['finance_accounts','finance_credit_facilities','business_finance_open_items','business_finance_transactions','finance_tax_positions','finance_allocation_proposals','finance_transfer_requests'] loop
    execute format('drop trigger if exists finance_audit_write on public.%I',t);
    execute format('create trigger finance_audit_write after insert or update on public.%I for each row execute function private.finance_audit_trigger()',t);
  end loop;
end $$;

-- Business P&L by month and business unit. Revenue and cash are deliberately separate.
create or replace view public.business_finance_pnl_v as
select
  date_trunc('month',transaction_date)::date as month,
  business_unit,
  sum(amount) filter(where transaction_type='REVENUE' and verification_status='VERIFIED' and record_status='ACTIVE') as revenue,
  sum(amount) filter(where transaction_type='COGS' and verification_status='VERIFIED' and record_status='ACTIVE') as cogs,
  sum(amount) filter(where transaction_type='PAYROLL' and verification_status='VERIFIED' and record_status='ACTIVE') as payroll,
  sum(amount) filter(where transaction_type='OTA_COMMISSION' and verification_status='VERIFIED' and record_status='ACTIVE') as ota_commission,
  sum(amount) filter(where transaction_type='UTILITY' and verification_status='VERIFIED' and record_status='ACTIVE') as utilities,
  sum(amount) filter(where transaction_type='OPEX' and verification_status='VERIFIED' and record_status='ACTIVE') as operating_expense,
  sum(amount) filter(where transaction_type='INTEREST' and verification_status='VERIFIED' and record_status='ACTIVE') as debt_interest,
  sum(amount) filter(where transaction_type='CASH_IN' and verification_status='VERIFIED' and record_status='ACTIVE') as cash_in,
  sum(amount) filter(where transaction_type='CASH_OUT' and verification_status='VERIFIED' and record_status='ACTIVE') as cash_out,
  count(*) filter(where verification_status<>'VERIFIED' and record_status='ACTIVE') as unverified_count
from public.business_finance_transactions
group by 1,2;

create or replace function public.finance_operating_snapshot(p_month date default date '2026-10-01')
returns jsonb
language sql security definer set search_path=pg_catalog,public as $$
with m as (select date_trunc('month',p_month)::date month),
accounts as (
 select *, case when bank_balance is null or book_balance is null then null else bank_balance-book_balance end variance
 from public.finance_accounts where record_status='ACTIVE'
),
fac as (select * from public.finance_credit_facilities where record_status='ACTIVE'),
open_ar as (select * from public.business_finance_open_items where record_status='ACTIVE' and item_type='AR'),
open_ap as (select * from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP'),
tax as (select * from public.finance_tax_positions where period=(select month from m) and business_unit='CONSOLIDATED' limit 1),
plan as (select * from public.finance_operating_plan_lines where plan_month=(select month from m)),
pnl as (select * from public.business_finance_pnl_v where month=(select month from m)),
calc as (
 select
   coalesce((select sum(bank_balance) from accounts where 'PERSONAL_OPERATING_ACCOUNT'=any(account_roles) and verification_status='VERIFIED'),0) personal_cash,
   (select sum(bank_balance) from accounts where 'PERSONAL_SAFETY_ACCOUNT'=any(account_roles) and verification_status='VERIFIED') emergency_fund,
   (select sum(bank_balance) from accounts where 'BUSINESS_TAX_RESERVE_ACCOUNT'=any(account_roles) and verification_status='VERIFIED') tax_reserve,
   coalesce((select sum(bank_balance) from accounts where financial_domain='BUSINESS' and not is_restricted_cash and verification_status='VERIFIED'),0) business_cash,
   coalesce((select sum(amount-settled_amount) from open_ar where amount is not null and payment_status not in ('RECEIVED','RECONCILED')),0) ota_receivable,
   coalesce((select sum(amount-settled_amount) from open_ap where amount is not null and payment_status not in ('PAID','RECONCILED')),0) known_ap,
   (select count(*) from open_ap where amount is null and payment_status not in ('PAID','RECONCILED')) unknown_ap_count,
   coalesce((select sum(used_principal) from fac),0) bank_debt_used,
   coalesce((select sum(credit_limit-used_principal) from fac),0) available_credit,
   coalesce((select sum(round(used_principal*annual_interest_rate/12,0)) from fac),0) projected_interest,
   (select sum(variance) from accounts where variance is not null) bank_book_variance,
   (select count(*) from accounts where reconciliation_status<>'MATCHED') bank_recon_open_count,
   coalesce((select sum(revenue) from pnl),0) revenue,
   coalesce((select sum(coalesce(cogs,0)+coalesce(payroll,0)+coalesce(ota_commission,0)+coalesce(utilities,0)+coalesce(operating_expense,0)+coalesce(debt_interest,0)) from pnl),0) pnl_expense,
   coalesce((select sum(unverified_count) from pnl),0) pnl_unverified_count,
   (select target_amount from plan where line_code='MIN_LIQUIDITY_BUFFER' and financial_domain='CONSOLIDATED' limit 1) operating_reserve_required,
   (select target_amount from plan where line_code='PERSONAL_LIVING_EXPENSE' and financial_domain='PERSONAL' limit 1) personal_living_target
),dist as (
 select c.*,
   case when c.pnl_unverified_count=0 and c.revenue>0 then c.revenue-c.pnl_expense else null end profit_before_tax,
   tax.tax_provision, tax.tax_actual, tax.tax_reserve_required,
   case when c.pnl_unverified_count=0 and c.revenue>0 and tax.verification_status='VERIFIED' and tax.tax_provision is not null then c.revenue-c.pnl_expense-tax.tax_provision else null end profit_after_tax,
   case when c.pnl_unverified_count=0 and c.revenue>0 and tax.verification_status='VERIFIED' and tax.tax_provision is not null and c.unknown_ap_count=0 and c.operating_reserve_required is not null
     then greatest(least(c.revenue-c.pnl_expense-tax.tax_provision, c.business_cash-c.known_ap-tax.tax_reserve_required-c.projected_interest-c.operating_reserve_required),0)
     else null end owner_distributable_cash
 from calc c left join tax on true
)
select case when public.is_personal_finance_owner() then jsonb_build_object(
 'month',(select month from m),
 'cutoverDate','2026-09-30','canonicalActualFrom','2026-10-01',
 'summary',jsonb_build_object(
   'personalCash',d.personal_cash,'emergencyFund',d.emergency_fund,'taxReserve',d.tax_reserve,
   'businessCash',d.business_cash,'otaReceivable',d.ota_receivable,'knownAp',d.known_ap,'unknownApCount',d.unknown_ap_count,
   'bankDebtUsed',d.bank_debt_used,'availableCredit',d.available_credit,'projectedInterest',d.projected_interest,
   'bankBookVariance',d.bank_book_variance,'bankReconOpenCount',d.bank_recon_open_count,
   'revenue',d.revenue,'profitBeforeTax',d.profit_before_tax,'taxProvision',d.tax_provision,'profitAfterTax',d.profit_after_tax,
   'ownerDistributableCash',d.owner_distributable_cash,'operatingReserveRequired',d.operating_reserve_required,'personalLivingTarget',d.personal_living_target,
   'distributionStatus',case when d.owner_distributable_cash is null then 'HOLD' else 'VERIFIED' end
 ),
 'accounts',(select coalesce(jsonb_agg(jsonb_build_object('code',account_code,'name',display_name,'domain',financial_domain,'businessUnit',business_unit,'roles',account_roles,'bankBalance',bank_balance,'bookBalance',book_balance,'variance',variance,'reconciliationStatus',reconciliation_status,'verificationStatus',verification_status,'restricted',is_restricted_cash,'purpose',purpose_note) order by account_code),'[]'::jsonb) from accounts),
 'facilities',(select coalesce(jsonb_agg(jsonb_build_object('code',facility_code,'limit',credit_limit,'usedPrincipal',used_principal,'availableCredit',credit_limit-used_principal,'rate',annual_interest_rate,'projectedMonthlyInterest',round(used_principal*annual_interest_rate/12,0),'maturity',maturity_date,'nextInterestDate',next_interest_date,'classification',classification,'verificationStatus',verification_status) order by facility_code),'[]'::jsonb) from fac),
 'ar',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'ota',counterparty,'expected',amount,'received',settled_amount,'outstanding',case when amount is null then null else amount-settled_amount end,'expectedSettlementDate',expected_settlement_date,'bookingReference',booking_reference,'status',payment_status,'verificationStatus',verification_status) order by business_unit,counterparty),'[]'::jsonb) from open_ar),
 'ap',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'category',category_code,'counterparty',counterparty,'amount',amount,'dueDate',due_date,'status',payment_status,'verificationStatus',verification_status) order by business_unit,category_code),'[]'::jsonb) from open_ap),
 'pnl',(select coalesce(jsonb_agg(to_jsonb(p) order by business_unit),'[]'::jsonb) from pnl p),
 'taxPosition',(select to_jsonb(t) from tax t),
 'latestAllocation',(select to_jsonb(a) from public.finance_allocation_proposals a where proposal_month=(select month from m) and status not in ('SUPERSEDED','CANCELLED') order by updated_at desc limit 1),
 'closeChecklist',(select coalesce(jsonb_agg(to_jsonb(c) order by step_no),'[]'::jsonb) from public.finance_month_end_close_items c where close_month=(select month from m)),
 'plan',(select coalesce(jsonb_agg(to_jsonb(p) order by priority_order,line_code),'[]'::jsonb) from plan p)
) else null end from dist d;
$$;
revoke all on function public.finance_operating_snapshot(date) from public,anon;
grant execute on function public.finance_operating_snapshot(date) to authenticated,service_role;

-- October tax position exists but is deliberately HOLD until a tax rule / actual evidence is verified.
insert into public.finance_tax_positions(period,business_unit,verification_status,source,source_reference,notes)
values('2026-10-01','CONSOLIDATED','HOLD','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929','Tax rate is not invented. Tax provision stays HOLD until rule/evidence is verified.')
on conflict(period,business_unit) do nothing;

-- Expand month-end close to the complete 25-step operating workflow.
insert into public.finance_month_end_close_items(close_month,step_no,checklist_code,description,financial_domain,business_unit,status,due_date,verification_status)
values
 ('2026-10-01',1,'BANK_RECON','Reconcile Bank','CONSOLIDATED','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',2,'OTA_RECON','Reconcile OTA','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',3,'AP_RECORD','Record AP','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',4,'PAYROLL_CLOSE_V2','Close Payroll','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',5,'UTILITIES_CLOSE_V2','Close Utilities','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',6,'OTA_COMMISSION_V2','Close OTA Commission','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',7,'REVENUE_CLOSE','Close Revenue','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',8,'EXPENSE_CLOSE','Close Expenses','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',9,'PBT_CALC','Calculate Profit Before Tax','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',10,'TAX_PROVISION','Calculate Tax Provision','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',11,'TAX_RESERVE','Transfer / Reserve Tax','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',12,'PAT_CALC','Calculate Profit After Tax','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',13,'BANK_CASH_CALC','Calculate Bank Cash','CONSOLIDATED','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',14,'OPERATING_RESERVE','Calculate Operating Reserve','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',15,'DISTRIBUTABLE_CALC','Calculate Owner Distributable Cash','BUSINESS','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',16,'ALLOCATION_PROPOSAL','Generate Allocation Proposal','BRIDGE','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',17,'CEO_ADJUST','CEO adjusts','BRIDGE','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',18,'CEO_APPROVE','CEO approves','BRIDGE','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',19,'TRANSFER_EXECUTION','Execute transfer / Manual transfer','BRIDGE','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',20,'BANK_CONFIRMATION','Bank confirmation','CONSOLIDATED','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',21,'POST_TRANSFER_RECON','Reconcile','CONSOLIDATED','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',22,'PERSONAL_FINANCE_UPDATE_V2','Update Personal Finance','PERSONAL','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',23,'DEBT_UPDATE_V2','Update Debt','DEBT','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',24,'EMERGENCY_FUND_UPDATE_V2','Update Emergency Fund','PERSONAL','NONE','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',25,'MONTHLY_REVIEW_V2','Generate Monthly Financial Review','CONSOLIDATED','NONE','TODO','2026-10-31','NEED_VERIFY')
on conflict(close_month,checklist_code,business_unit) do update set step_no=excluded.step_no,description=excluded.description,financial_domain=excluded.financial_domain,due_date=excluded.due_date,updated_at=now();

-- Canonical master data expansion for finance operating dropdowns.
alter table public.finance_master_data drop constraint if exists finance_master_data_master_data_type_check;
alter table public.finance_master_data add constraint finance_master_data_master_data_type_check check(master_data_type = any(array[
 'TRANSACTION_TYPE','EXPENSE_CATEGORY','INCOME_CATEGORY','ACCOUNT_TYPE','INSTITUTION','DEBT_TYPE','ASSET_TYPE','CURRENCY','PAYMENT_METHOD','INCOME_SOURCE','TRANSACTION_SOURCE','VERIFICATION_STATUS',
 'BUSINESS_UNIT','TAX_TYPE','TRANSFER_TYPE','ACCOUNT_ROLE'
]::text[]));

insert into public.finance_master_data(master_data_type,code,name,display_order,is_active,record_status,source,source_reference)
values
 ('BUSINESS_UNIT','LAVENDER','Lavender',10,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('BUSINESS_UNIT','RUBY','Ruby',20,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('BUSINESS_UNIT','COZY_GARDEN','Cozy Garden',30,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('TRANSFER_TYPE','OWNER_DISTRIBUTION','Phân phối cho chủ sở hữu',10,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('TRANSFER_TYPE','OWNER_DRAW','Chủ sở hữu rút tiền',20,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('TRANSFER_TYPE','OWNER_CONTRIBUTION','Chủ sở hữu góp vốn',30,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('TRANSFER_TYPE','PERSONAL_PAID_FOR_BUSINESS','Cá nhân trả hộ kinh doanh',40,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('TRANSFER_TYPE','BUSINESS_PAID_FOR_PERSONAL','Kinh doanh trả hộ cá nhân',50,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('ACCOUNT_ROLE','PERSONAL_OPERATING_ACCOUNT','Tài khoản vận hành cá nhân',10,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('ACCOUNT_ROLE','BUSINESS_OPERATING_ACCOUNT','Tài khoản vận hành kinh doanh',20,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('ACCOUNT_ROLE','PERSONAL_SAFETY_ACCOUNT','Tài khoản quỹ an toàn',30,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('ACCOUNT_ROLE','BUSINESS_TAX_RESERVE_ACCOUNT','Tài khoản quỹ thuế',40,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929'),
 ('ACCOUNT_ROLE','OTA_SETTLEMENT_ACCOUNT','Tài khoản nhận OTA',50,true,'ACTIVE','OWNER_FINANCE_POLICY','FIN-OPS-V2-20260929')
on conflict do nothing;

insert into public.activity_logs(agent,unit,message,type)
values('TUAN OS','Finance','Finance Operating OS v2 prepared: tax reserve, account roles/reconciliation, PBT→tax→distributable cash gate, allocation proposal, transfer preview/approval data model, 25-step month-end close. No financial transfer executed.','action');
