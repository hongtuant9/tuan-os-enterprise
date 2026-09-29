-- TUAN OS canonical finance reset approved by Owner on 29/09/2026.
-- Cutover 30/09/2026; canonical Actual from 01/10/2026.
-- No money movement is executed by this migration.

create table if not exists public.finance_opening_positions (
  id uuid primary key default gen_random_uuid(),
  position_code text not null unique,
  cutover_date date not null,
  financial_domain text not null check(financial_domain in ('BUSINESS','PERSONAL','BRIDGE')),
  business_unit text,
  position_type text not null check(position_type in ('BUSINESS_CASH_CONSOLIDATED','PERSONAL_CASH','OTHER')),
  amount numeric(18,2) not null check(amount>=0),
  currency_code text not null default 'VND',
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  source text not null,
  source_reference text,
  notes text,
  record_status text not null default 'ACTIVE' check(record_status in ('ACTIVE','INACTIVE','SUPERSEDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_employee_advances (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  as_of_date date not null,
  payroll_period date not null,
  business_unit text not null check(business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED')),
  employee_name text not null,
  advance_type text not null default 'SALARY_ADVANCE' check(advance_type in ('SALARY_ADVANCE','EMPLOYEE_ADVANCE')),
  amount numeric(18,2) not null check(amount>=0),
  settled_amount numeric(18,2) not null default 0 check(settled_amount>=0),
  status text not null default 'OPEN' check(status in ('OPEN','PARTIAL','SETTLED','VOIDED')),
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  source text not null,
  source_reference text,
  notes text,
  record_status text not null default 'ACTIVE' check(record_status in ('ACTIVE','INACTIVE','SUPERSEDED','VOIDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(settled_amount<=amount)
);

-- Owner-only read; runtime/service role performs controlled writes.
do $$ declare t text; begin
  foreach t in array array['finance_opening_positions','finance_employee_advances'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists %I on public.%I',t||' owner select',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_personal_finance_owner())',t||' owner select',t);
  end loop;
end $$;

-- Reuse Finance OS v2 audit and hard-delete guard.
do $$ declare t text; begin
  foreach t in array array['finance_opening_positions','finance_employee_advances'] loop
    execute format('drop trigger if exists prevent_finance_hard_delete on public.%I',t);
    execute format('create trigger prevent_finance_hard_delete before delete on public.%I for each row execute function private.prevent_finance_hard_delete()',t);
    execute format('drop trigger if exists finance_audit_write on public.%I',t);
    execute format('create trigger finance_audit_write after insert or update on public.%I for each row execute function private.finance_audit_trigger()',t);
  end loop;
end $$;

-- Opening Business Cash is a consolidated cutover position, NOT a physical bank balance and NOT profit/income/distributable cash.
insert into public.finance_opening_positions(position_code,cutover_date,financial_domain,business_unit,position_type,amount,verification_status,source,source_reference,notes)
values('OPEN-BUSINESS-CASH-CONSOLIDATED-20260930','2026-09-30','BUSINESS','HOSPITALITY_SHARED','BUSINESS_CASH_CONSOLIDATED',165292017,'VERIFIED','OWNER_APPROVED_RESET','DEC-FIN-RESET-20260929-002','Consolidated opening business cash after CEO pooling. Not Personal Cash, Personal Income, Profit or Owner Distribution. September closing obligations remain to be deducted before Net Opening Liquidity is known.')
on conflict(position_code) do update set amount=excluded.amount,verification_status=excluded.verification_status,source=excluded.source,source_reference=excluded.source_reference,notes=excluded.notes,record_status='ACTIVE',updated_at=now();

-- Reset physical account semantics. Do not force consolidated opening cash into an individual bank account.
update public.finance_accounts set
  display_name='BIDV 888 – Tuấn', financial_domain='PERSONAL', business_unit='PERSONAL',
  opening_balance=0,current_balance=0,balance_as_of='2026-09-30',ownership_status='VERIFIED',verification_status='VERIFIED',
  source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',
  evidence=jsonb_build_object('cutover','2026-09-30','opening_balance',0,'authority','Owner approved finance reset'),
  record_status='ACTIVE', account_roles=array['PERSONAL_OPERATING_ACCOUNT'],bank_balance=0,book_balance=0,last_reconciled_at=now(),reconciliation_status='MATCHED',is_restricted_cash=false,
  purpose_note='Personal operating account from 01/10: Owner Distribution, personal income and family/personal expenses only.',updated_at=now()
where account_code='OPEN-BIDV-TUAN';

update public.finance_accounts set
  display_name='TK HKD – Tuấn',financial_domain='BUSINESS',business_unit='HOSPITALITY_SHARED',
  opening_balance=null,current_balance=null,balance_as_of='2026-09-30',ownership_status='VERIFIED',verification_status='NEED_VERIFY',
  source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',
  evidence=jsonb_build_object('cutover','2026-09-30','note','Business role verified; physical balance/routing requires bank reconciliation'),
  record_status='ACTIVE',account_roles=array['BUSINESS_OPERATING_ACCOUNT'],bank_balance=null,book_balance=null,last_reconciled_at=null,reconciliation_status='NEED_VERIFY',is_restricted_cash=false,
  purpose_note='Business operating account for Lavender/Ruby/Cozy/shared transactions; every transaction requires business_unit.',updated_at=now()
where account_code='OPEN-HKD-TUAN';

update public.finance_accounts set
  display_name='TPBank legacy opening — superseded',record_status='SUPERSEDED',ownership_status='HOLD',verification_status='HOLD',
  account_roles=array['NEED_VERIFY'],reconciliation_status='STALE',
  purpose_note='Superseded by Owner-approved reset: TPBank Safety and Tax Reserve are separate canonical roles with opening balance 0.',
  source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',updated_at=now()
where account_code='OPEN-TPBANK-TUAN';

update public.finance_accounts set
  display_name='TPBank 888 – Tuấn · Quỹ an toàn',institution='TPBank',financial_domain='PERSONAL',business_unit='PERSONAL',
  opening_balance=0,current_balance=0,balance_as_of='2026-09-30',ownership_status='VERIFIED',verification_status='VERIFIED',
  source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',evidence=jsonb_build_object('cutover','2026-09-30','opening_balance',0,'authority','Owner approved finance reset'),
  record_status='ACTIVE',account_roles=array['PERSONAL_SAFETY_ACCOUNT'],bank_balance=0,book_balance=0,last_reconciled_at=now(),reconciliation_status='MATCHED',is_restricted_cash=true,
  purpose_note='Emergency Fund / Safety Reserve only; not daily spending.',updated_at=now()
where account_code='ROLE-TPBANK-SAFETY';

update public.finance_accounts set
  display_name='TPBank 501 – Tuấn · Quỹ thuế',institution='TPBank',financial_domain='BUSINESS',business_unit='HOSPITALITY_SHARED',
  opening_balance=0,current_balance=0,balance_as_of='2026-09-30',ownership_status='VERIFIED',verification_status='VERIFIED',
  source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',evidence=jsonb_build_object('cutover','2026-09-30','opening_balance',0,'authority','Owner approved finance reset'),
  record_status='ACTIVE',account_roles=array['BUSINESS_TAX_RESERVE_ACCOUNT'],bank_balance=0,book_balance=0,last_reconciled_at=now(),reconciliation_status='MATCHED',is_restricted_cash=true,
  purpose_note='Restricted Cash: Tax Reserve / Tax Payment only. Never Personal, Debt, Investment or Business OPEX.',updated_at=now()
where account_code='ROLE-TPBANK-TAX';

update public.finance_accounts set
  display_name='TK HKD – Ruby',financial_domain='BUSINESS',business_unit='RUBY',ownership_status='VERIFIED',verification_status='NEED_VERIFY',
  source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',account_roles=array['BUSINESS_OPERATING_ACCOUNT','OTA_SETTLEMENT_ACCOUNT'],
  reconciliation_status='NEED_VERIFY',purpose_note='Business operating / OTA settlement account. Routing and physical bank balance require evidence; do not invent balance.',updated_at=now()
where account_code='ROLE-HKD-RUBY';

-- Personal Finance mirror: stale historical emergency fund is superseded; clean opening accounts start at zero.
update public.personal_finance_accounts set record_status='SUPERSEDED',status_reason='Superseded by 30/09/2026 cutover reset. TPBank Safety canonical opening is 0.',status_changed_at=now(),updated_at=now()
where record_status='ACTIVE' and is_emergency_fund=true and source<>'OWNER_APPROVED_RESET';

insert into public.personal_finance_accounts(name,account_type,institution,current_balance,balance_as_of,is_liquid,is_emergency_fund,source,source_reference,verification_status,source_updated_at,verification_evidence,verified_at,external_key,record_status,status_reason)
values
 ('BIDV 888 – Tuấn','BANK','BIDV',0,'2026-09-30',true,false,'OWNER_APPROVED_RESET','DEC-FIN-RESET-20260929-002','VERIFIED',now(),'Owner-approved 30/09 cutover opening balance = 0.',now(),'CUTOVER-BIDV-888-PERSONAL-20260930','ACTIVE','Canonical Personal Operating Account from 01/10/2026.'),
 ('TPBank 888 – Tuấn · Quỹ an toàn','BANK','TPBank',0,'2026-09-30',true,true,'OWNER_APPROVED_RESET','DEC-FIN-RESET-20260929-002','VERIFIED',now(),'Owner-approved 30/09 cutover opening balance = 0.',now(),'CUTOVER-TPBANK-888-SAFETY-20260930','ACTIVE','Canonical Personal Safety Account from 01/10/2026.')
on conflict(source,external_key) do update set name=excluded.name,institution=excluded.institution,current_balance=excluded.current_balance,balance_as_of=excluded.balance_as_of,is_liquid=excluded.is_liquid,is_emergency_fund=excluded.is_emergency_fund,source_reference=excluded.source_reference,verification_status=excluded.verification_status,source_updated_at=excluded.source_updated_at,verification_evidence=excluded.verification_evidence,verified_at=excluded.verified_at,record_status='ACTIVE',status_reason=excluded.status_reason,updated_at=now();

-- Debt facility semantic remains owner-approved and is normalized to the new naming.
update public.finance_credit_facilities set
  financial_domain='PERSONAL',credit_limit=3000000000,used_principal=2838413761,annual_interest_rate=0.059,maturity_date='2027-06-21',next_interest_date='2026-10-28',as_of_date='2026-09-30',classification='ACTIVE_BANK_DEBT',verification_status='VERIFIED',record_status='ACTIVE',source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',updated_at=now()
where facility_code='BIDV-OD-401';

update public.finance_credit_facilities set
  financial_domain='PERSONAL',credit_limit=882000000,used_principal=0,annual_interest_rate=0.10,maturity_date='2027-01-11',next_interest_date=null,as_of_date='2026-09-30',classification='CREDIT_FACILITY_UNUSED',verification_status='VERIFIED',record_status='ACTIVE',source='OWNER_APPROVED_RESET',source_reference='DEC-FIN-RESET-20260929-002',updated_at=now()
where facility_code='BIDV-OD-407';

-- Salary advances: opening subledger only. Do NOT post the 65m as payroll expense again.
insert into public.finance_employee_advances(external_key,as_of_date,payroll_period,business_unit,employee_name,advance_type,amount,settled_amount,status,verification_status,source,source_reference,notes)
values
 ('OPEN-ADVANCE-SEP2026-CHI-NAM','2026-09-30','2026-09-01','HOSPITALITY_SHARED','Chị Nam','SALARY_ADVANCE',30000000,0,'OPEN','VERIFIED','OWNER_APPROVED_RESET','DEC-FIN-RESET-20260929-002','Reception/Homestay salary advance paid in September. Settle against September Payroll Payable at 01/10 payroll close; never add this amount to Salary Expense again.'),
 ('OPEN-ADVANCE-SEP2026-HOANG','2026-09-30','2026-09-01','COZY_GARDEN','Hoàng','SALARY_ADVANCE',35000000,0,'OPEN','VERIFIED','OWNER_APPROVED_RESET','DEC-FIN-RESET-20260929-002','Cozy Garden bar staff salary advance paid in September. Settle against September Payroll Payable at 01/10 payroll close; never add this amount to Salary Expense again.')
on conflict(external_key) do update set amount=excluded.amount,settled_amount=excluded.settled_amount,status=excluded.status,verification_status=excluded.verification_status,source=excluded.source,source_reference=excluded.source_reference,notes=excluded.notes,record_status='ACTIVE',updated_at=now();

-- Future employee advance cash-outs are distinct from payroll expense and excluded from P&L payroll aggregation.
alter table public.business_finance_transactions drop constraint if exists business_finance_transactions_transaction_type_check;
alter table public.business_finance_transactions add constraint business_finance_transactions_transaction_type_check check(transaction_type = any(array[
 'REVENUE','CASH_IN','CASH_OUT','COGS','PAYROLL','OPEX','OTA_COMMISSION','UTILITY','AR_SETTLEMENT','AP_PAYMENT','TAX','INTEREST','DEBT_PRINCIPAL','OWNER_DISTRIBUTION','OWNER_CONTRIBUTION','TRANSFER','EMPLOYEE_ADVANCE','OTHER'
]::text[]));
insert into public.finance_master_data(master_data_type,code,name,display_order,is_active,record_status,source,source_reference)
values('TRANSACTION_TYPE','EMPLOYEE_ADVANCE','Tạm ứng nhân viên',95,true,'ACTIVE','OWNER_APPROVED_RESET','DEC-FIN-RESET-20260929-002')
on conflict(master_data_type,code) do update set name=excluded.name,is_active=true,record_status='ACTIVE',source=excluded.source,source_reference=excluded.source_reference,updated_at=now();

-- Upgrade month-end workflow to 26 steps by inserting Salary Advance settlement after Payroll close.
update public.finance_month_end_close_items set is_current=false,updated_at=now() where close_month='2026-10-01' and is_current;

insert into public.finance_month_end_close_items(close_month,step_no,checklist_code,description,financial_domain,business_unit,status,due_date,verification_status,workflow_version,is_current)
values('2026-10-01',5,'SALARY_ADVANCE_SETTLEMENT','Settle Salary Advances against Payroll Payable','BUSINESS','NONE','TODO','2026-11-01','NEED_VERIFY','v3',true)
on conflict(close_month,checklist_code,business_unit) do update set step_no=excluded.step_no,description=excluded.description,financial_domain=excluded.financial_domain,status='TODO',due_date=excluded.due_date,verification_status='NEED_VERIFY',workflow_version='v3',is_current=true,updated_at=now();

with steps(code,step_no) as (values
 ('BANK_RECON',1),('OTA_RECON',2),('AP_RECORD',3),('PAYROLL_CLOSE_V2',4),
 ('UTILITIES_CLOSE_V2',6),('OTA_COMMISSION_V2',7),('REVENUE_CLOSE',8),('EXPENSE_CLOSE',9),('PBT_CALC',10),('TAX_PROVISION',11),('TAX_RESERVE',12),('PAT_CALC',13),('BANK_CASH_CALC',14),('OPERATING_RESERVE',15),('DISTRIBUTABLE_CALC',16),('ALLOCATION_PROPOSAL',17),('CEO_ADJUST',18),('CEO_APPROVE',19),('TRANSFER_EXECUTION',20),('BANK_CONFIRMATION',21),('POST_TRANSFER_RECON',22),('PERSONAL_FINANCE_UPDATE_V2',23),('DEBT_UPDATE_V2',24),('EMERGENCY_FUND_UPDATE_V2',25),('MONTHLY_REVIEW_V2',26)
)
update public.finance_month_end_close_items c set step_no=s.step_no,workflow_version='v3',is_current=true,due_date='2026-11-01',updated_at=now()
from steps s where c.close_month='2026-10-01' and c.checklist_code=s.code;

-- Finance operating snapshot: opening position is separate from physical bank balances; book cash rolls from cutover + verified cash movements.
create or replace function public.finance_operating_snapshot(p_month date default date '2026-10-01')
returns jsonb
language sql security definer set search_path=pg_catalog,public as $$
with m as (select date_trunc('month',p_month)::date as period_month),
accounts as (
 select *, case when bank_balance is null or book_balance is null then null else bank_balance-book_balance end variance
 from public.finance_accounts where record_status='ACTIVE'
),
fac as (select * from public.finance_credit_facilities where record_status='ACTIVE'),
open_ar as (select * from public.business_finance_open_items where record_status='ACTIVE' and item_type='AR'),
open_ap as (select * from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP'),
opening as (select * from public.finance_opening_positions where record_status='ACTIVE' and position_type='BUSINESS_CASH_CONSOLIDATED' order by cutover_date desc limit 1),
adv as (select * from public.finance_employee_advances where record_status='ACTIVE' and status in ('OPEN','PARTIAL')),
tax as (select * from public.finance_tax_positions where period=(select period_month from m) and business_unit='CONSOLIDATED' limit 1),
plan as (select * from public.finance_operating_plan_lines where plan_month=(select period_month from m)),
pnl as (select * from public.business_finance_pnl_v where month=(select period_month from m)),
movements as (
 select
   coalesce(sum(amount) filter(where transaction_type in ('CASH_IN','AR_SETTLEMENT','OWNER_CONTRIBUTION')),0) cash_in,
   coalesce(sum(amount) filter(where transaction_type in ('CASH_OUT','AP_PAYMENT','TAX','INTEREST','DEBT_PRINCIPAL','OWNER_DISTRIBUTION','EMPLOYEE_ADVANCE')),0) cash_out
 from public.business_finance_transactions
 where record_status='ACTIVE' and verification_status='VERIFIED'
   and transaction_date>=date '2026-10-01'
   and transaction_date < ((select period_month from m)+interval '1 month')
),
calc as (
 select
   coalesce((select sum(bank_balance) from accounts where 'PERSONAL_OPERATING_ACCOUNT'=any(account_roles) and verification_status='VERIFIED'),0) personal_cash,
   coalesce((select sum(bank_balance) from accounts where 'PERSONAL_SAFETY_ACCOUNT'=any(account_roles) and verification_status='VERIFIED'),0) emergency_fund,
   coalesce((select sum(bank_balance) from accounts where 'BUSINESS_TAX_RESERVE_ACCOUNT'=any(account_roles) and verification_status='VERIFIED'),0) tax_reserve,
   (select sum(bank_balance) from accounts where financial_domain='BUSINESS' and not is_restricted_cash and verification_status='VERIFIED') bank_business_cash,
   coalesce((select amount from opening),0)+(select cash_in-cash_out from movements) book_business_cash,
   coalesce((select amount from opening),0) opening_business_cash,
   coalesce((select sum(amount-settled_amount) from open_ar where amount is not null and payment_status not in ('RECEIVED','RECONCILED')),0) ota_receivable,
   coalesce((select sum(amount-settled_amount) from open_ap where amount is not null and payment_status not in ('PAID','RECONCILED')),0) known_ap,
   (select count(*) from open_ap where amount is null and payment_status not in ('PAID','RECONCILED')) unknown_ap_count,
   coalesce((select sum(amount-settled_amount) from adv),0) employee_advances_outstanding,
   (select count(*) from adv) employee_advance_count,
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
   case when c.unknown_ap_count=0 then c.opening_business_cash-c.known_ap else null end net_opening_liquidity,
   case when c.pnl_unverified_count=0 and c.revenue>0 then c.revenue-c.pnl_expense else null end profit_before_tax,
   tax.tax_provision, tax.tax_actual, tax.tax_reserve_required,
   case when c.pnl_unverified_count=0 and c.revenue>0 and tax.verification_status='VERIFIED' and tax.tax_provision is not null then c.revenue-c.pnl_expense-tax.tax_provision else null end profit_after_tax,
   case when c.pnl_unverified_count=0 and c.revenue>0 and tax.verification_status='VERIFIED' and tax.tax_provision is not null and c.unknown_ap_count=0 and c.operating_reserve_required is not null
     then greatest(least(c.revenue-c.pnl_expense-tax.tax_provision, c.book_business_cash-c.known_ap-tax.tax_reserve_required-c.projected_interest-c.operating_reserve_required),0)
     else null end owner_distributable_cash
 from calc c left join tax on true
)
select case when public.is_personal_finance_owner() then jsonb_build_object(
 'month',(select period_month from m),'cutoverDate','2026-09-30','canonicalActualFrom','2026-10-01',
 'summary',jsonb_build_object(
   'personalCash',d.personal_cash,'emergencyFund',d.emergency_fund,'taxReserve',d.tax_reserve,
   'openingBusinessCash',d.opening_business_cash,'bankBusinessCash',d.bank_business_cash,'bookBusinessCash',d.book_business_cash,'businessCash',d.book_business_cash,
   'netOpeningLiquidity',d.net_opening_liquidity,'employeeAdvancesOutstanding',d.employee_advances_outstanding,'employeeAdvanceCount',d.employee_advance_count,
   'otaReceivable',d.ota_receivable,'knownAp',d.known_ap,'unknownApCount',d.unknown_ap_count,
   'bankDebtUsed',d.bank_debt_used,'availableCredit',d.available_credit,'projectedInterest',d.projected_interest,
   'bankBookVariance',d.bank_book_variance,'bankReconOpenCount',d.bank_recon_open_count,
   'revenue',d.revenue,'profitBeforeTax',d.profit_before_tax,'taxProvision',d.tax_provision,'profitAfterTax',d.profit_after_tax,
   'ownerDistributableCash',d.owner_distributable_cash,'operatingReserveRequired',d.operating_reserve_required,'personalLivingTarget',d.personal_living_target,
   'distributionStatus',case when d.owner_distributable_cash is null then 'HOLD' else 'VERIFIED' end,
   'openingLiquidityStatus',case when d.net_opening_liquidity is null then 'HOLD' else 'VERIFIED' end
 ),
 'openingPosition',(select to_jsonb(o) from opening o),
 'employeeAdvances',(select coalesce(jsonb_agg(to_jsonb(a) order by business_unit,employee_name),'[]'::jsonb) from adv a),
 'accounts',(select coalesce(jsonb_agg(jsonb_build_object('code',account_code,'name',display_name,'domain',financial_domain,'businessUnit',business_unit,'roles',account_roles,'bankBalance',bank_balance,'bookBalance',book_balance,'variance',variance,'reconciliationStatus',reconciliation_status,'verificationStatus',verification_status,'restricted',is_restricted_cash,'purpose',purpose_note) order by account_code),'[]'::jsonb) from accounts),
 'facilities',(select coalesce(jsonb_agg(jsonb_build_object('code',facility_code,'limit',credit_limit,'usedPrincipal',used_principal,'availableCredit',credit_limit-used_principal,'rate',annual_interest_rate,'projectedMonthlyInterest',round(used_principal*annual_interest_rate/12,0),'maturity',maturity_date,'nextInterestDate',next_interest_date,'classification',classification,'verificationStatus',verification_status) order by facility_code),'[]'::jsonb) from fac),
 'ar',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'ota',counterparty,'expected',amount,'received',settled_amount,'outstanding',case when amount is null then null else amount-settled_amount end,'expectedSettlementDate',expected_settlement_date,'bookingReference',booking_reference,'status',payment_status,'verificationStatus',verification_status) order by business_unit,counterparty),'[]'::jsonb) from open_ar),
 'ap',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'category',category_code,'counterparty',counterparty,'amount',amount,'dueDate',due_date,'status',payment_status,'verificationStatus',verification_status) order by business_unit,category_code),'[]'::jsonb) from open_ap),
 'pnl',(select coalesce(jsonb_agg(to_jsonb(p) order by business_unit),'[]'::jsonb) from pnl p),
 'taxPosition',(select to_jsonb(t) from tax t),
 'latestAllocation',(select to_jsonb(a) from public.finance_allocation_proposals a where proposal_month=(select period_month from m) and status not in ('SUPERSEDED','CANCELLED') order by updated_at desc limit 1),
 'closeChecklist',(select coalesce(jsonb_agg(to_jsonb(c) order by step_no),'[]'::jsonb) from public.finance_month_end_close_items c where close_month=(select period_month from m) and is_current),
 'plan',(select coalesce(jsonb_agg(to_jsonb(p) order by priority_order,line_code),'[]'::jsonb) from plan p)
) else null end from dist d;
$$;
revoke all on function public.finance_operating_snapshot(date) from public,anon;
grant execute on function public.finance_operating_snapshot(date) to authenticated,service_role;

insert into public.activity_logs(agent,unit,message,type)
values('TUAN OS','Finance','Owner-approved finance reset applied for 30/09 cutover: consolidated Business Cash 165,292,017; Personal/Safety/Tax opening 0; HKD physical balances require reconciliation; 401/407 normalized; Salary Advances 65,000,000 tracked outside Payroll Expense; Month-End Close upgraded to 26 steps. No money movement executed.','action');
