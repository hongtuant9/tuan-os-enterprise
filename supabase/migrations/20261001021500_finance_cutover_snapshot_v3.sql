-- Finance cutover snapshot v3 — 01/10/2026
-- Use canonical opening position; do not derive cutover liquidity from reset per-account balances.
create or replace function public.finance_cutover_snapshot()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public
as $$
with opening as (
  select amount, verification_status
  from public.finance_opening_positions
  where record_status='ACTIVE'
    and financial_domain='BUSINESS'
    and position_type='BUSINESS_CASH_CONSOLIDATED'
    and cutover_date='2026-09-30'
  order by updated_at desc
  limit 1
)
select case when public.is_personal_finance_owner() then jsonb_build_object(
  'cutoverDate','2026-09-30',
  'canonicalActualFrom','2026-10-01',
  'knownCash',coalesce((select amount from opening),0),
  'classifiedPersonalCash',coalesce((select sum(current_balance) from public.finance_accounts where record_status='ACTIVE' and financial_domain='PERSONAL' and ownership_status='VERIFIED'),0),
  'classifiedBusinessCash',coalesce((select amount from opening),0),
  'unclassifiedCashCount',(select count(*) from public.finance_accounts where record_status='ACTIVE' and ownership_status<>'VERIFIED'),
  'businessAr',coalesce((select sum(amount-settled_amount) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AR' and amount is not null and payment_status not in ('RECONCILED','RECEIVED')),0),
  'knownBusinessAp',coalesce((select sum(amount-settled_amount) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is not null and payment_status not in ('PAID','RECONCILED')),0),
  'unknownApCount',(select count(*) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is null),
  'netOpeningLiquidity',case when (select count(*) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is null)=0 then coalesce((select amount from opening),0)-coalesce((select sum(amount-settled_amount) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is not null and payment_status not in ('PAID','RECONCILED')),0) else null end,
  'liquidityStatus',coalesce((select verification_status from opening),'NEED_VERIFY'),
  'accounts',(select coalesce(jsonb_agg(jsonb_build_object('code',account_code,'name',display_name,'institution',institution,'last4',account_ref_last4,'domain',financial_domain,'businessUnit',business_unit,'balance',current_balance,'ownershipStatus',ownership_status,'verificationStatus',verification_status,'roles',account_roles,'purposeNote',purpose_note,'restrictedCash',is_restricted_cash) order by account_code),'[]'::jsonb) from public.finance_accounts where record_status='ACTIVE'),
  'facilities',(select coalesce(jsonb_agg(jsonb_build_object('code',facility_code,'institution',institution,'last4',account_ref_last4,'limit',credit_limit,'usedPrincipal',used_principal,'availableCredit',credit_limit-used_principal,'rate',annual_interest_rate,'projectedMonthlyInterest',round(used_principal*annual_interest_rate/12,0),'maturity',maturity_date,'nextInterestDate',next_interest_date,'classification',classification,'verificationStatus',verification_status) order by facility_code),'[]'::jsonb) from public.finance_credit_facilities where record_status='ACTIVE'),
  'ar',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'counterparty',counterparty,'amount',amount,'settled',settled_amount,'outstanding',case when amount is null then null else amount-settled_amount end,'expectedSettlementDate',expected_settlement_date,'bookingReference',booking_reference,'status',payment_status,'verificationStatus',verification_status) order by business_unit,counterparty),'[]'::jsonb) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AR'),
  'ap',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'counterparty',counterparty,'category',category_code,'amount',amount,'dueDate',due_date,'status',payment_status,'verificationStatus',verification_status,'source',source) order by business_unit,category_code),'[]'::jsonb) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP'),
  'octoberPlan',(select coalesce(jsonb_agg(jsonb_build_object('domain',financial_domain,'businessUnit',business_unit,'code',line_code,'name',line_name,'priority',priority_order,'baseline',baseline_amount,'target',target_amount,'verificationStatus',verification_status,'gateStatus',gate_status,'formulaNote',formula_note,'reviewCondition',review_condition) order by priority_order,line_code),'[]'::jsonb) from public.finance_operating_plan_lines where plan_month='2026-10-01'),
  'monthEndClose',(select coalesce(jsonb_agg(jsonb_build_object('step',step_no,'code',checklist_code,'description',description,'domain',financial_domain,'status',status,'dueDate',due_date,'verificationStatus',verification_status) order by step_no),'[]'::jsonb) from public.finance_month_end_close_items where close_month='2026-10-01')
) else null end;
$$;

revoke all on function public.finance_cutover_snapshot() from public,anon;
grant execute on function public.finance_cutover_snapshot() to authenticated,service_role;
