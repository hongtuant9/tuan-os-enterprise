-- TUAN OS Financial Operating Model cutover
-- 30/09/2026 = opening position; 01/10/2026+ = canonical actual finance.
-- Additive migration. No provider/financial transaction is performed.

alter table public.personal_finance_debts
  add column if not exists liability_quantity numeric,
  add column if not exists liability_unit text,
  add column if not exists reference_unit_price numeric,
  add column if not exists reference_price_as_of date,
  add column if not exists valuation_method text;

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  display_name text not null,
  institution text,
  account_ref_last4 text,
  financial_domain text not null check(financial_domain in ('PERSONAL','BUSINESS','MIXED','NEED_VERIFY')),
  business_unit text check(business_unit is null or business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED','PERSONAL')),
  opening_balance numeric(18,2),
  current_balance numeric(18,2),
  balance_as_of date,
  currency_code text not null default 'VND',
  ownership_status text not null default 'NEED_VERIFY' check(ownership_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  source text not null,
  source_reference text,
  evidence jsonb not null default '{}'::jsonb,
  record_status text not null default 'ACTIVE' check(record_status in ('ACTIVE','INACTIVE','SUPERSEDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_credit_facilities (
  id uuid primary key default gen_random_uuid(),
  facility_code text not null unique,
  financial_domain text not null check(financial_domain in ('PERSONAL','BUSINESS','MIXED','NEED_VERIFY')),
  institution text not null,
  account_ref_last4 text,
  facility_type text not null default 'OVERDRAFT',
  credit_limit numeric(18,2) not null check(credit_limit>=0),
  used_principal numeric(18,2) not null default 0 check(used_principal>=0),
  annual_interest_rate numeric(12,8) not null default 0 check(annual_interest_rate>=0),
  maturity_date date,
  next_interest_date date,
  as_of_date date not null,
  classification text not null check(classification in ('CREDIT_FACILITY_UNUSED','ACTIVE_BANK_DEBT','CREDIT_FACILITY_USED')),
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  source text not null,
  source_reference text,
  evidence jsonb not null default '{}'::jsonb,
  record_status text not null default 'ACTIVE' check(record_status in ('ACTIVE','INACTIVE','SUPERSEDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(used_principal<=credit_limit),
  check((used_principal=0 and classification='CREDIT_FACILITY_UNUSED') or used_principal>0)
);

create table if not exists public.business_finance_open_items (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  opening_date date not null,
  item_type text not null check(item_type in ('AR','AP')),
  business_unit text not null check(business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED')),
  counterparty text not null,
  category_code text not null,
  amount numeric(18,2),
  settled_amount numeric(18,2) not null default 0 check(settled_amount>=0),
  expected_settlement_date date,
  due_date date,
  booking_reference text,
  payment_status text not null check(payment_status in ('EXPECTED','IN_TRANSIT','UNPAID','PARTIAL','PAID','RECEIVED','RECONCILED','NEED_VERIFY')),
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  source text not null,
  source_document text,
  source_reference text,
  notes text,
  record_status text not null default 'ACTIVE' check(record_status in ('ACTIVE','INACTIVE','SUPERSEDED','VOIDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(amount is null or amount>=0),
  check(amount is null or settled_amount<=amount)
);

create table if not exists public.business_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  transaction_date date not null,
  business_unit text not null check(business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED')),
  account_code text references public.finance_accounts(account_code),
  transaction_type text not null check(transaction_type in ('REVENUE','CASH_IN','CASH_OUT','COGS','PAYROLL','OPEX','OTA_COMMISSION','UTILITY','AR_SETTLEMENT','AP_PAYMENT','TAX','INTEREST','DEBT_PRINCIPAL','OWNER_DISTRIBUTION','OWNER_CONTRIBUTION','TRANSFER','OTHER')),
  category_code text not null,
  subcategory_code text,
  counterparty text,
  amount numeric(18,2) not null check(amount>=0),
  source_document text,
  source_reference text,
  payment_status text not null default 'NEED_VERIFY' check(payment_status in ('PENDING','UNPAID','PARTIAL','PAID','RECEIVED','RECONCILED','NEED_VERIFY')),
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  created_by uuid references public.users(id),
  source text not null,
  record_status text not null default 'ACTIVE' check(record_status in ('ACTIVE','INACTIVE','SUPERSEDED','VOIDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_operating_plan_lines (
  id uuid primary key default gen_random_uuid(),
  plan_month date not null,
  financial_domain text not null check(financial_domain in ('BUSINESS','PERSONAL','BRIDGE','DEBT','CONSOLIDATED')),
  business_unit text not null default 'NONE' check(business_unit in ('NONE','LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED')),
  line_code text not null,
  line_name text not null,
  priority_order integer not null,
  baseline_amount numeric(18,2),
  target_amount numeric(18,2),
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD','ESTIMATED')),
  gate_status text not null default 'HOLD' check(gate_status in ('PASS','HOLD','NEED_VERIFY')),
  source text not null,
  source_reference text,
  formula_note text,
  review_condition text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_month,financial_domain,business_unit,line_code)
);

create table if not exists public.finance_month_end_close_items (
  id uuid primary key default gen_random_uuid(),
  close_month date not null,
  step_no integer not null,
  checklist_code text not null,
  description text not null,
  financial_domain text not null check(financial_domain in ('BUSINESS','PERSONAL','BRIDGE','DEBT','CONSOLIDATED')),
  business_unit text not null default 'NONE' check(business_unit in ('NONE','LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED')),
  status text not null default 'TODO' check(status in ('TODO','IN_PROGRESS','PASS','NEED_VERIFY','HOLD')),
  due_date date,
  evidence_reference text,
  verification_status text not null default 'NEED_VERIFY' check(verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(close_month,checklist_code,business_unit)
);

create index if not exists business_finance_open_items_lookup_idx on public.business_finance_open_items(item_type,business_unit,payment_status,opening_date);
create index if not exists business_finance_transactions_date_idx on public.business_finance_transactions(transaction_date,business_unit,transaction_type);
create index if not exists finance_operating_plan_month_idx on public.finance_operating_plan_lines(plan_month,priority_order);
create index if not exists finance_month_end_close_month_idx on public.finance_month_end_close_items(close_month,step_no);

-- Sensitive finance cutover data: owner-only direct reads; service role handles runtime sync/write.
do $$ declare t text; begin
  foreach t in array array['finance_accounts','finance_credit_facilities','business_finance_open_items','business_finance_transactions','finance_operating_plan_lines','finance_month_end_close_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists %I on public.%I',t||' owner select',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_personal_finance_owner())',t||' owner select',t);
  end loop;
end $$;

-- Opening/cutover read model. No raw full account identifiers are exposed.
create or replace function public.finance_cutover_snapshot()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public
as $$
  select case when public.is_personal_finance_owner() then jsonb_build_object(
    'cutoverDate','2026-09-30',
    'canonicalActualFrom','2026-10-01',
    'knownCash',coalesce((select sum(current_balance) from public.finance_accounts where record_status='ACTIVE' and balance_as_of='2026-09-30'),0),
    'classifiedPersonalCash',coalesce((select sum(current_balance) from public.finance_accounts where record_status='ACTIVE' and financial_domain='PERSONAL' and ownership_status='VERIFIED'),0),
    'classifiedBusinessCash',coalesce((select sum(current_balance) from public.finance_accounts where record_status='ACTIVE' and financial_domain='BUSINESS' and ownership_status='VERIFIED'),0),
    'unclassifiedCashCount',(select count(*) from public.finance_accounts where record_status='ACTIVE' and ownership_status<>'VERIFIED'),
    'businessAr',coalesce((select sum(amount-settled_amount) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AR' and amount is not null and payment_status not in ('RECONCILED','RECEIVED')),0),
    'knownBusinessAp',coalesce((select sum(amount-settled_amount) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is not null and payment_status not in ('PAID','RECONCILED')),0),
    'unknownApCount',(select count(*) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is null),
    'netOpeningLiquidity',case
      when (select count(*) from public.finance_accounts where record_status='ACTIVE' and ownership_status<>'VERIFIED')=0
       and (select count(*) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is null)=0
      then coalesce((select sum(current_balance) from public.finance_accounts where record_status='ACTIVE'),0)
         + coalesce((select sum(amount-settled_amount) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AR' and amount is not null and payment_status not in ('RECONCILED','RECEIVED')),0)
         - coalesce((select sum(amount-settled_amount) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is not null and payment_status not in ('PAID','RECONCILED')),0)
      else null end,
    'liquidityStatus',case
      when (select count(*) from public.finance_accounts where record_status='ACTIVE' and ownership_status<>'VERIFIED')>0 then 'NEED_VERIFY'
      when (select count(*) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP' and amount is null)>0 then 'HOLD'
      else 'VERIFIED' end,
    'accounts',(select coalesce(jsonb_agg(jsonb_build_object('code',account_code,'name',display_name,'institution',institution,'last4',account_ref_last4,'domain',financial_domain,'businessUnit',business_unit,'balance',current_balance,'ownershipStatus',ownership_status,'verificationStatus',verification_status) order by account_code),'[]'::jsonb) from public.finance_accounts where record_status='ACTIVE'),
    'facilities',(select coalesce(jsonb_agg(jsonb_build_object('code',facility_code,'institution',institution,'last4',account_ref_last4,'limit',credit_limit,'usedPrincipal',used_principal,'availableCredit',credit_limit-used_principal,'rate',annual_interest_rate,'projectedMonthlyInterest',round(used_principal*annual_interest_rate/12,0),'maturity',maturity_date,'nextInterestDate',next_interest_date,'classification',classification,'verificationStatus',verification_status) order by facility_code),'[]'::jsonb) from public.finance_credit_facilities where record_status='ACTIVE'),
    'ar',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'counterparty',counterparty,'amount',amount,'settled',settled_amount,'outstanding',case when amount is null then null else amount-settled_amount end,'expectedSettlementDate',expected_settlement_date,'bookingReference',booking_reference,'status',payment_status,'verificationStatus',verification_status) order by business_unit,counterparty),'[]'::jsonb) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AR'),
    'ap',(select coalesce(jsonb_agg(jsonb_build_object('businessUnit',business_unit,'counterparty',counterparty,'category',category_code,'amount',amount,'dueDate',due_date,'status',payment_status,'verificationStatus',verification_status,'source',source) order by business_unit,category_code),'[]'::jsonb) from public.business_finance_open_items where record_status='ACTIVE' and item_type='AP'),
    'octoberPlan',(select coalesce(jsonb_agg(jsonb_build_object('domain',financial_domain,'businessUnit',business_unit,'code',line_code,'name',line_name,'priority',priority_order,'baseline',baseline_amount,'target',target_amount,'verificationStatus',verification_status,'gateStatus',gate_status,'formulaNote',formula_note,'reviewCondition',review_condition) order by priority_order,line_code),'[]'::jsonb) from public.finance_operating_plan_lines where plan_month='2026-10-01'),
    'monthEndClose',(select coalesce(jsonb_agg(jsonb_build_object('step',step_no,'code',checklist_code,'description',description,'domain',financial_domain,'status',status,'dueDate',due_date,'verificationStatus',verification_status) order by step_no),'[]'::jsonb) from public.finance_month_end_close_items where close_month='2026-10-01')
  ) else null end;
$$;
revoke all on function public.finance_cutover_snapshot() from public,anon;
grant execute on function public.finance_cutover_snapshot() to authenticated,service_role;

-- Owner-authorized opening position. Exact full bank account numbers are intentionally not stored.
insert into public.finance_accounts(account_code,display_name,institution,account_ref_last4,financial_domain,business_unit,opening_balance,current_balance,balance_as_of,ownership_status,verification_status,source,source_reference,evidence)
values
 ('OPEN-BIDV-TUAN','BIDV Tuấn','BIDV',null,'NEED_VERIFY',null,13790269,13790269,'2026-09-30','NEED_VERIFY','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001',jsonb_build_object('cutover','2026-09-30','note','Balance owner-provided; ownership classification pending')),
 ('OPEN-HKD-TUAN','HKD Tuấn',null,null,'NEED_VERIFY',null,4563428,4563428,'2026-09-30','NEED_VERIFY','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001',jsonb_build_object('cutover','2026-09-30','note','Balance owner-provided; ownership classification pending')),
 ('OPEN-TPBANK-TUAN','TPBank Tuấn','TPBank',null,'NEED_VERIFY',null,4514283,4514283,'2026-09-30','NEED_VERIFY','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001',jsonb_build_object('cutover','2026-09-30','note','Balance owner-provided; ownership classification pending'))
on conflict(account_code) do update set opening_balance=excluded.opening_balance,current_balance=excluded.current_balance,balance_as_of=excluded.balance_as_of,financial_domain=excluded.financial_domain,business_unit=excluded.business_unit,ownership_status=excluded.ownership_status,verification_status=excluded.verification_status,source=excluded.source,source_reference=excluded.source_reference,evidence=excluded.evidence,updated_at=now();

insert into public.finance_credit_facilities(facility_code,financial_domain,institution,account_ref_last4,credit_limit,used_principal,annual_interest_rate,maturity_date,next_interest_date,as_of_date,classification,verification_status,source,source_reference,evidence)
values
 ('BIDV-OD-407','PERSONAL','BIDV','8877',882000000,0,0.10,'2027-01-11',null,'2026-09-30','CREDIT_FACILITY_UNUSED','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001',jsonb_build_object('rule','No interest when used principal = 0')),
 ('BIDV-OD-401','PERSONAL','BIDV','7515',3000000000,2838413761,0.059,'2027-06-21','2026-10-28','2026-09-30','ACTIVE_BANK_DEBT','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001',jsonb_build_object('rule','Projected interest = actual outstanding principal × annual rate / 12; actual interest from bank statement'))
on conflict(facility_code) do update set credit_limit=excluded.credit_limit,used_principal=excluded.used_principal,annual_interest_rate=excluded.annual_interest_rate,maturity_date=excluded.maturity_date,next_interest_date=excluded.next_interest_date,as_of_date=excluded.as_of_date,classification=excluded.classification,verification_status=excluded.verification_status,source=excluded.source,source_reference=excluded.source_reference,evidence=excluded.evidence,updated_at=now();

-- Bank debt 401 supersedes the stale 12/08 generic overdraft amount in Personal Finance.
update public.personal_finance_debts set
  name='BIDV overdraft · ending 7515', debt_type='OVERDRAFT', opening_principal=2838413761,
  current_principal=2838413761, interest_rate_annual=0.059, maturity_date='2027-06-21', next_payment_date='2026-10-28',
  as_of_date='2026-09-30', source='OWNER_CUTOVER', source_reference='DEC-FIN-CUTOVER-20260929-001 · BIDV-OD-401',
  verification_status='VERIFIED', verification_evidence='Owner-approved opening position 30/09/2026', verified_at=now(),
  source_updated_at=now(), external_key='CUTOVER-BIDV-OD-401', updated_at=now()
where status='ACTIVE' and debt_type='OVERDRAFT';

-- Family liability: retain physical gold quantity and reference valuation, not VND-only debt.
update public.personal_finance_debts set
  name='Ông Thiên · 14 chỉ vàng', debt_type='FAMILY', opening_principal=200900000,current_principal=200900000,
  liability_quantity=14, liability_unit='CHI_GOLD', reference_unit_price=14350000, reference_price_as_of='2026-09-29',
  valuation_method='QUANTITY_X_REFERENCE_PRICE', as_of_date='2026-09-30', source='OWNER_CUTOVER',
  source_reference='DEC-FIN-CUTOVER-20260929-001 · 14 chỉ × 14.350.000đ/chỉ',verification_status='VERIFIED',
  verification_evidence='Owner-approved quantity and reference price for cutover',verified_at=now(),source_updated_at=now(),
  external_key='CUTOVER-FAMILY-GOLD-THIEN',updated_at=now()
where status='ACTIVE' and debt_type='FAMILY';

-- OTA business receivables at opening.
insert into public.business_finance_open_items(external_key,opening_date,item_type,business_unit,counterparty,category_code,amount,settled_amount,payment_status,verification_status,source,source_reference,notes)
values
 ('OPEN-AR-EXPEDIA-LAVENDER','2026-09-30','AR','LAVENDER','Expedia','OTA_RECEIVABLE',13339594,0,'EXPECTED','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001','Business AR only; not Personal Cash/Income.'),
 ('OPEN-AR-EXPEDIA-RUBY','2026-09-30','AR','RUBY','Expedia','OTA_RECEIVABLE',6069788,0,'EXPECTED','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001','Business AR only; not Personal Cash/Income.'),
 ('OPEN-AR-AGODA-LAVENDER','2026-09-30','AR','LAVENDER','Agoda','OTA_RECEIVABLE',31517931,0,'EXPECTED','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001','Business AR only; not Personal Cash/Income.'),
 ('OPEN-AR-AGODA-RUBY','2026-09-30','AR','RUBY','Agoda','OTA_RECEIVABLE',26496724,0,'EXPECTED','VERIFIED','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001','Business AR only; not Personal Cash/Income.')
on conflict(external_key) do update set amount=excluded.amount,settled_amount=excluded.settled_amount,payment_status=excluded.payment_status,verification_status=excluded.verification_status,source=excluded.source,source_reference=excluded.source_reference,notes=excluded.notes,updated_at=now();

-- September obligations: create every required open item; NULL amount means not yet evidenced and must not be treated as zero.
insert into public.business_finance_open_items(external_key,opening_date,item_type,business_unit,counterparty,category_code,amount,settled_amount,payment_status,verification_status,source,source_document,source_reference,notes)
values
 ('OPEN-AP-COZY-PAYROLL-SEP','2026-09-30','AP','COZY_GARDEN','Nhân sự Cozy Garden','PAYROLL',8214279,0,'NEED_VERIFY','NEED_VERIFY','FIN-HOSPITALITY-001','KiotViet payroll BL000016','07_ACTUAL_BRIDGE','TEMP ACTUAL only; final payroll close required.'),
 ('OPEN-AP-HS-PAYROLL-SEP','2026-09-30','AP','HOSPITALITY_SHARED','Nhân sự Lavender/Ruby','PAYROLL',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Amount required from final September payroll.'),
 ('OPEN-AP-ELECTRICITY-SEP','2026-09-30','AP','HOSPITALITY_SHARED','Nhà cung cấp điện','UTILITY_ELECTRICITY',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Allocate Lavender/Ruby/Cozy when invoice evidence is available.'),
 ('OPEN-AP-WATER-SEP','2026-09-30','AP','HOSPITALITY_SHARED','Nhà cung cấp nước','UTILITY_WATER',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Allocate Lavender/Ruby/Cozy when invoice evidence is available.'),
 ('OPEN-AP-BOOKING-LAVENDER-SEP','2026-09-30','AP','LAVENDER','Booking.com','OTA_COMMISSION',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Use Booking settlement/invoice; do not use forecast percentage.'),
 ('OPEN-AP-BOOKING-RUBY-SEP','2026-09-30','AP','RUBY','Booking.com','OTA_COMMISSION',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Use Booking settlement/invoice; do not use forecast percentage.'),
 ('OPEN-AP-SUPPLIER-SEP','2026-09-30','AP','HOSPITALITY_SHARED','Nhà cung cấp','SUPPLIER_PAYABLE',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Reconcile supplier subledger; legacy anomaly is not imported as fact.'),
 ('OPEN-AP-OTHER-ACCRUED-SEP','2026-09-30','AP','HOSPITALITY_SHARED','Khác','OTHER_ACCRUED_EXPENSE',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Capture other accrued September obligations if evidenced.'),
 ('OPEN-AP-TAX-FEE-SEP','2026-09-30','AP','HOSPITALITY_SHARED','Cơ quan thuế / phí','TAX_FEE',null,0,'NEED_VERIFY','NEED_VERIFY','CUTOVER_CHECKLIST',null,'DEC-FIN-CUTOVER-20260929-001','Tax/fee actual from declaration/payment evidence; not zero by default.')
on conflict(external_key) do update set amount=excluded.amount,settled_amount=excluded.settled_amount,payment_status=excluded.payment_status,verification_status=excluded.verification_status,source=excluded.source,source_document=excluded.source_document,source_reference=excluded.source_reference,notes=excluded.notes,updated_at=now();

-- October 2026 operating plan. Values without evidence remain NULL/HOLD; no optimistic filling.
insert into public.finance_operating_plan_lines(plan_month,financial_domain,business_unit,line_code,line_name,priority_order,baseline_amount,target_amount,verification_status,gate_status,source,source_reference,formula_note,review_condition)
values
 ('2026-10-01','CONSOLIDATED','NONE','OPENING_CASH','Opening Cash — known bank balances',1,22867980,null,'VERIFIED','HOLD','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001','Known balance total; free liquidity HOLD until ownership and AP are complete.','Classify all accounts PERSONAL/BUSINESS/MIXED and close September AP.'),
 ('2026-10-01','BUSINESS','NONE','EXPECTED_OTA_RECEIPTS','Expected OTA Receipts',2,77424037,null,'VERIFIED','HOLD','OWNER_CUTOVER','DEC-FIN-CUTOVER-20260929-001','Opening Business AR; settlement dates still need reconciliation.','Reconcile Expedia/Agoda settlement date and bank receipt.'),
 ('2026-10-01','BUSINESS','HOSPITALITY_SHARED','EXPECTED_BUSINESS_REVENUE','Expected Business Revenue',3,420000000,null,'ESTIMATED','NEED_VERIFY','FIN-HOSPITALITY-001','02 Plan & Assumption','Old October plan baseline only; allocate Lavender/Ruby before final.','Replace with October operating forecast after unit allocation.'),
 ('2026-10-01','BUSINESS','NONE','MANDATORY_PAYABLES','Mandatory September/October Payables',4,8214279,null,'NEED_VERIFY','HOLD','CUTOVER_OPEN_ITEMS','business_finance_open_items','Known amount only; 8 AP rows still have unknown amount.','All opening AP amounts/due dates must be captured.'),
 ('2026-10-01','BUSINESS','NONE','PAYROLL','Payroll',5,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001','October payroll target not yet approved.','Close September payroll and prepare October roster/payroll budget.'),
 ('2026-10-01','BUSINESS','NONE','UTILITIES','Utilities',6,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001','No Actual invoice amount yet.','Capture electricity/water invoices by BU.'),
 ('2026-10-01','BUSINESS','NONE','OTA_COMMISSION','OTA Commissions',7,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001','Use actual settlement/invoice, not revenue percentage.','Capture Booking/Agoda/Expedia commission evidence.'),
 ('2026-10-01','DEBT','NONE','DEBT_INTEREST','Debt Interest — planning exposure',8,13955534,13955534,'ESTIMATED','PASS','BIDV-OD-401','DEC-FIN-CUTOVER-20260929-001','2,838,413,761 × 5.9% / 12. Actual interest must come from bank statement.','Recalculate if principal/rate changes; replace with bank actual on 28/10.'),
 ('2026-10-01','PERSONAL','NONE','PERSONAL_LIVING_EXPENSE','Personal Essential Living Cost',9,75762500,75762500,'ESTIMATED','NEED_VERIFY','TUAN OS — Mô hình tài chính gia đình','planning baseline','Planning baseline only; Actual personal expense begins 01/10.','Track 100% major personal transactions from 01/10.'),
 ('2026-10-01','CONSOLIDATED','NONE','MIN_LIQUIDITY_BUFFER','Minimum Liquidity Buffer',10,null,null,'NEED_VERIFY','HOLD','CUTOVER_POLICY','DEC-FIN-CUTOVER-20260929-001','Cannot finalize until business mandatory payables and account ownership are complete.','Opening AP complete + account ownership VERIFIED.'),
 ('2026-10-01','DEBT','NONE','PLANNED_PRINCIPAL_REDUCTION','Planned Principal Reduction',11,0,0,'VERIFIED','PASS','OWNER_POLICY','DEC-FIN-CUTOVER-20260929-001','Default 0 until business obligations, personal essentials, interest and liquidity floor PASS.','Increase only after all cashflow gates PASS.'),
 ('2026-10-01','BRIDGE','NONE','OWNER_DISTRIBUTION','Owner Distribution',12,0,0,'VERIFIED','PASS','OWNER_POLICY','DEC-FIN-CUTOVER-20260929-001','Default 0 until business cash, obligations, retention and actual profit/tax gates PASS.','Create actual Business→Personal transfer only after approved/reconciled distribution.')
on conflict(plan_month,financial_domain,business_unit,line_code) do nothing;

insert into public.finance_month_end_close_items(close_month,step_no,checklist_code,description,financial_domain,status,due_date,verification_status)
values
 ('2026-10-01',1,'BANK_RECON','Reconcile bank balances','CONSOLIDATED','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',2,'OTA_AR_RECON','Reconcile OTA receivables','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',3,'AP_CAPTURE','Record unpaid payables','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',4,'PAYROLL_CLOSE','Close payroll','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',5,'UTILITIES_CLOSE','Close utilities','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',6,'OTA_COMMISSION_CLOSE','Record OTA commission','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',7,'REVENUE_EXPENSE_CLOSE','Close Revenue / Expense','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',8,'PROFIT_CLOSE','Calculate Profit','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',9,'DISTRIBUTABLE_CASH','Calculate Distributable Cash','BUSINESS','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',10,'PERSONAL_UPDATE','Update Personal Finance','PERSONAL','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',11,'DEBT_UPDATE','Update Debt','DEBT','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',12,'EMERGENCY_FUND_UPDATE','Update Emergency Fund','PERSONAL','TODO','2026-10-31','NEED_VERIFY'),
 ('2026-10-01',13,'MONTHLY_REVIEW','Generate Monthly Financial Review','CONSOLIDATED','TODO','2026-10-31','NEED_VERIFY')
on conflict(close_month,checklist_code,business_unit) do nothing;

insert into public.activity_logs(agent,unit,message,type)
values('TUAN OS','Finance','Financial Operating Model cutover prepared: 30/09/2026 opening position; 01/10/2026 canonical actual. No financial transaction executed. Source DEC-FIN-CUTOVER-20260929-001.','finance_cutover');
