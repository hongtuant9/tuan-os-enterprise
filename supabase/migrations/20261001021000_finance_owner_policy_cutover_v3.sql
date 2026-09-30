-- Owner-approved Finance cutover policy — 01/10/2026
-- Idempotent canonicalization of account roles and operating policy.

update public.finance_accounts set
  display_name='TKK — HKD Lavender Homestay',
  financial_domain='BUSINESS',business_unit='HOSPITALITY_SHARED',
  account_roles=array['BUSINESS_REVENUE_COLLECTION_ACCOUNT','OTA_SETTLEMENT_ACCOUNT'],
  purpose_note='TKK chỉ nhận doanh thu Cozy Garden/Lavender/Ruby và OTA; không dùng chi vận hành; P&L phân loại theo Business Unit.',
  ownership_status='VERIFIED',verification_status='VERIFIED',
  source='OWNER_DECISION_20261001',source_reference='FIN-HOSPITALITY-001 / OWNER FINANCE CUTOVER 01/10/2026',updated_at=now()
where account_code='OPEN-HKD-TUAN';

update public.finance_accounts set
  display_name='TKK — HKD Ruby Homestay',
  financial_domain='BUSINESS',business_unit='HOSPITALITY_SHARED',
  account_roles=array['BUSINESS_REVENUE_COLLECTION_ACCOUNT','OTA_SETTLEMENT_ACCOUNT'],
  purpose_note='TKK chỉ nhận doanh thu Cozy Garden/Lavender/Ruby và OTA; không dùng chi vận hành; P&L phân loại theo Business Unit.',
  ownership_status='VERIFIED',verification_status='VERIFIED',
  source='OWNER_DECISION_20261001',source_reference='FIN-HOSPITALITY-001 / OWNER FINANCE CUTOVER 01/10/2026',updated_at=now()
where account_code='ROLE-HKD-RUBY';

update public.finance_accounts set
  display_name='BIDV 888 – Tuấn · Tài khoản chi vận hành TCE',
  financial_domain='BUSINESS',business_unit='HOSPITALITY_SHARED',
  account_roles=array['BUSINESS_OPERATING_ACCOUNT'],
  purpose_note='Chi vận hành toàn TCE; mỗi khoản chi phải gắn Business Unit + loại chi + evidence; không dùng chi gia đình.',
  ownership_status='VERIFIED',verification_status='VERIFIED',
  source='OWNER_DECISION_20261001',source_reference='FIN-HOSPITALITY-001 / OWNER FINANCE CUTOVER 01/10/2026',updated_at=now()
where account_code='OPEN-BIDV-TUAN';

update public.finance_accounts set
  display_name='TPBank 888 – Tuấn · Quỹ an toàn tài chính cá nhân',
  financial_domain='PERSONAL',business_unit='PERSONAL',
  account_roles=array['PERSONAL_SAFETY_ACCOUNT'],
  purpose_note='Quỹ an toàn/dự phòng tài chính cá nhân hướng tới tự do tài chính; không phải quỹ dự phòng TCE.',
  source='OWNER_DECISION_20261001',source_reference='FIN-HOSPITALITY-001 / OWNER FINANCE CUTOVER 01/10/2026',updated_at=now()
where account_code='ROLE-TPBANK-SAFETY';

update public.finance_accounts set
  record_status='SUPERSEDED',
  purpose_note='SUPERSEDED 01/10/2026: TPBank 501 không phải quỹ thuế; canonical role là tài khoản cá nhân/gia đình nhận CEO Compensation.',
  source='OWNER_DECISION_20261001',source_reference='FIN-HOSPITALITY-001 / OWNER FINANCE CUTOVER 01/10/2026',updated_at=now()
where account_code='ROLE-TPBANK-TAX';

insert into public.finance_accounts(
 account_code,display_name,institution,financial_domain,business_unit,opening_balance,current_balance,balance_as_of,currency_code,
 ownership_status,verification_status,source,source_reference,evidence,record_status,account_roles,bank_balance,book_balance,
 reconciliation_status,is_restricted_cash,purpose_note)
values
('ROLE-TPBANK-PERSONAL-501','TPBank 501 – Tuấn · Tài khoản cá nhân/gia đình','TPBank','PERSONAL','PERSONAL',null,null,'2026-10-01','VND',
 'VERIFIED','VERIFIED','OWNER_DECISION_20261001','FIN-HOSPITALITY-001 / OWNER FINANCE CUTOVER 01/10/2026',
 jsonb_build_object('policy','CEO Compensation 40.000.000 VND/tháng'),'ACTIVE',array['PERSONAL_OPERATING_ACCOUNT'],null,null,'NEED_VERIFY',false,
 'Nhận CEO Compensation 40 triệu/tháng; chi tiêu sau đó thuộc Personal Finance.'),
('ROLE-TPBANK-TCE-RESERVE-1984','TPBank 1984 – Tuấn · Tài khoản quỹ chung TCE','TPBank','BUSINESS','HOSPITALITY_SHARED',0,0,'2026-10-01','VND',
 'VERIFIED','VERIFIED','OWNER_DECISION_20261001','FIN-HOSPITALITY-001 / OWNER FINANCE CUTOVER 01/10/2026',
 jsonb_build_object('virtual_buckets',jsonb_build_array('TAX_RESERVE','BONUS_13_RESERVE','BUSINESS_RESERVE')),'ACTIVE',
 array['BUSINESS_RESERVE_ACCOUNT','BUSINESS_TAX_RESERVE_ACCOUNT','BUSINESS_BONUS_RESERVE_ACCOUNT'],0,0,'MATCHED',true,
 'Một tài khoản vật lý giữ Quỹ thuế + Quỹ thưởng tháng 13 + Quỹ dự phòng TCE.')
on conflict(account_code) do update set
 display_name=excluded.display_name,financial_domain=excluded.financial_domain,business_unit=excluded.business_unit,
 account_roles=excluded.account_roles,purpose_note=excluded.purpose_note,source=excluded.source,source_reference=excluded.source_reference,
 evidence=excluded.evidence,record_status='ACTIVE',ownership_status='VERIFIED',verification_status='VERIFIED',
 is_restricted_cash=excluded.is_restricted_cash,updated_at=now();

update public.finance_credit_facilities set
 used_principal=2850413761,annual_interest_rate=0.059,as_of_date='2026-09-30',verification_status='VERIFIED',
 source='OWNER_DECISION_20261001',source_reference='Bảng trạng thái thông tin tài chính đến hết 30.9.2026',updated_at=now()
where facility_code='BIDV-OD-401';

update public.finance_credit_facilities set
 used_principal=0,credit_limit=882000000,annual_interest_rate=0.10,as_of_date='2026-09-30',
 classification='CREDIT_FACILITY_UNUSED',verification_status='VERIFIED',
 source='OWNER_DECISION_20261001',source_reference='Bảng trạng thái thông tin tài chính đến hết 30.9.2026',updated_at=now()
where facility_code='BIDV-OD-407';

update public.finance_opening_positions set record_status='SUPERSEDED',updated_at=now()
where position_code='OPEN-BUSINESS-CASH-CONSOLIDATED-20260930-V2' and record_status='ACTIVE';

insert into public.finance_opening_positions(
 position_code,cutover_date,financial_domain,business_unit,position_type,amount,currency_code,verification_status,source,source_reference,notes,record_status)
values('OPEN-BUSINESS-LIQUIDITY-20260930-V3','2026-09-30','BUSINESS','HOSPITALITY_SHARED','BUSINESS_CASH_CONSOLIDATED',214073495,'VND','VERIFIED',
 'OWNER_DECISION_20261001','Bảng trạng thái thông tin tài chính đến hết 30.9.2026',
 'Nguồn tiền quản trị: tài khoản + tiền mặt + OTA đã duyệt; không bao gồm 153m tạm ứng/phải thu; không phải distributable profit.','ACTIVE')
on conflict(position_code) do update set amount=excluded.amount,verification_status='VERIFIED',notes=excluded.notes,record_status='ACTIVE',updated_at=now();

update public.finance_operating_plan_lines set
 baseline_amount=214073495,target_amount=214073495,verification_status='VERIFIED',gate_status='PASS',
 source='OWNER_DECISION_20261001',line_name='Opening Business Liquidity — owner-approved',
 formula_note='214,073,495 VND = account + cash + OTA approved; not Revenue/Profit.',updated_at=now()
where plan_month='2026-10-01' and financial_domain='CONSOLIDATED' and business_unit='NONE' and line_code='OPENING_CASH';

update public.finance_operating_plan_lines set
 baseline_amount=77424037,target_amount=77424037,verification_status='VERIFIED',gate_status='PASS',
 source='OWNER_DECISION_20261001',formula_note='OTA cash settlement belongs to original stay period; do not recognize revenue twice.',updated_at=now()
where plan_month='2026-10-01' and financial_domain='BUSINESS' and business_unit='NONE' and line_code='EXPECTED_OTA_RECEIPTS';

update public.finance_operating_plan_lines set
 baseline_amount=14014534.32,target_amount=14014534.32,verification_status='ESTIMATED',gate_status='PASS',
 source='OWNER_DECISION_20261001',formula_note='2,850,413,761 × 5.9% / 12; Actual from bank statement.',updated_at=now()
where plan_month='2026-10-01' and financial_domain='DEBT' and business_unit='NONE' and line_code='DEBT_INTEREST';

insert into public.finance_operating_plan_lines
(plan_month,financial_domain,business_unit,line_code,line_name,priority_order,baseline_amount,target_amount,verification_status,gate_status,source,source_reference,formula_note,review_condition)
values
('2026-10-01','PERSONAL','NONE','CEO_COMPENSATION','CEO Compensation — Tuấn',9,40000000,40000000,'VERIFIED','PASS','OWNER_DECISION_20261001','FIN-HOSPITALITY-001','40m/tháng → TPBank 501; Personal Finance after transfer.','Owner changes policy'),
('2026-10-01','BUSINESS','HOSPITALITY_SHARED','TAX_RESERVE_POLICY','Quỹ thuế — dự phòng quản trị',9,null,null,'VERIFIED','PASS','OWNER_DECISION_20261001','FIN-HOSPITALITY-001','Reserve policy 7% lợi nhuận; Actual Tax theo evidence.','Reconcile tax actual'),
('2026-10-01','BUSINESS','HOSPITALITY_SHARED','BONUS_13_RESERVE','Quỹ thưởng tháng 13',10,null,null,'VERIFIED','PASS','OWNER_DECISION_20261001','FIN-HOSPITALITY-001','Trích 1/12 quỹ lương đủ điều kiện mỗi tháng.','Review payroll eligibility'),
('2026-10-01','BUSINESS','HOSPITALITY_SHARED','BUSINESS_RESERVE','Quỹ dự phòng TCE',11,0,null,'VERIFIED','PASS','OWNER_DECISION_20261001','FIN-HOSPITALITY-001','Virtual bucket trong TPBank 1984.','Owner approval'),
('2026-10-01','BUSINESS','COZY_GARDEN','COZY_REINVESTMENT_EARMARK','Quỹ tái đầu tư Cozy — cutover 01/10',12,31473816,31473816,'VERIFIED','PASS','OWNER_DECISION_20261001','FIN-HOSPITALITY-001','NON-ADDITIVE earmark: sửa đèn/trang trí/menu phở/dinner garden.','Classify each spend')
on conflict(plan_month,financial_domain,business_unit,line_code) do update set
 line_name=excluded.line_name,priority_order=excluded.priority_order,baseline_amount=excluded.baseline_amount,target_amount=excluded.target_amount,
 verification_status=excluded.verification_status,gate_status=excluded.gate_status,source=excluded.source,
 source_reference=excluded.source_reference,formula_note=excluded.formula_note,review_condition=excluded.review_condition,updated_at=now();
