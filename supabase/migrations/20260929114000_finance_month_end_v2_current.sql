-- Preserve v1 close history but expose exactly one current 25-step workflow.
alter table public.finance_month_end_close_items
  add column if not exists workflow_version text not null default 'v1',
  add column if not exists is_current boolean not null default false;

update public.finance_month_end_close_items
set workflow_version='v1',is_current=false,updated_at=now()
where close_month='2026-10-01';

update public.finance_month_end_close_items
set workflow_version='v2',is_current=true,updated_at=now()
where close_month='2026-10-01' and checklist_code in (
 'BANK_RECON','OTA_RECON','AP_RECORD','PAYROLL_CLOSE_V2','UTILITIES_CLOSE_V2','OTA_COMMISSION_V2',
 'REVENUE_CLOSE','EXPENSE_CLOSE','PBT_CALC','TAX_PROVISION','TAX_RESERVE','PAT_CALC','BANK_CASH_CALC',
 'OPERATING_RESERVE','DISTRIBUTABLE_CALC','ALLOCATION_PROPOSAL','CEO_ADJUST','CEO_APPROVE','TRANSFER_EXECUTION',
 'BANK_CONFIRMATION','POST_TRANSFER_RECON','PERSONAL_FINANCE_UPDATE_V2','DEBT_UPDATE_V2',
 'EMERGENCY_FUND_UPDATE_V2','MONTHLY_REVIEW_V2'
);

create unique index if not exists finance_month_end_current_step_uq
  on public.finance_month_end_close_items(close_month,step_no)
  where is_current;

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
tax as (select * from public.finance_tax_positions where period=(select period_month from m) and business_unit='CONSOLIDATED' limit 1),
plan as (select * from public.finance_operating_plan_lines where plan_month=(select period_month from m)),
pnl as (select * from public.business_finance_pnl_v where month=(select period_month from m)),
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
 'month',(select period_month from m),'cutoverDate','2026-09-30','canonicalActualFrom','2026-10-01',
 'summary',jsonb_build_object('personalCash',d.personal_cash,'emergencyFund',d.emergency_fund,'taxReserve',d.tax_reserve,'businessCash',d.business_cash,'otaReceivable',d.ota_receivable,'knownAp',d.known_ap,'unknownApCount',d.unknown_ap_count,'bankDebtUsed',d.bank_debt_used,'availableCredit',d.available_credit,'projectedInterest',d.projected_interest,'bankBookVariance',d.bank_book_variance,'bankReconOpenCount',d.bank_recon_open_count,'revenue',d.revenue,'profitBeforeTax',d.profit_before_tax,'taxProvision',d.tax_provision,'profitAfterTax',d.profit_after_tax,'ownerDistributableCash',d.owner_distributable_cash,'operatingReserveRequired',d.operating_reserve_required,'personalLivingTarget',d.personal_living_target,'distributionStatus',case when d.owner_distributable_cash is null then 'HOLD' else 'VERIFIED' end),
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
