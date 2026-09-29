-- Normalize October plan to Lavender / Ruby / Cozy Garden dimensions.
-- Do not keep the old combined 420m Hospitality+Cozy baseline as a BU target.

delete from public.finance_operating_plan_lines
where plan_month='2026-10-01'
  and financial_domain='BUSINESS'
  and line_code in ('EXPECTED_BUSINESS_REVENUE','PAYROLL','UTILITIES','OTA_COMMISSION');

insert into public.finance_operating_plan_lines(
  plan_month,financial_domain,business_unit,line_code,line_name,priority_order,
  baseline_amount,target_amount,verification_status,gate_status,source,source_reference,formula_note,review_condition
) values
 ('2026-10-01','BUSINESS','LAVENDER','EXPECTED_BUSINESS_REVENUE','Expected Revenue — Lavender',3,null,null,'NEED_VERIFY','HOLD','CUTOVER_PLAN','DEC-FIN-CUTOVER-20260929-001','FIN has Homestay aggregate plan only; no authoritative Lavender/Ruby split.','Set target only after branch-level October forecast is approved.'),
 ('2026-10-01','BUSINESS','RUBY','EXPECTED_BUSINESS_REVENUE','Expected Revenue — Ruby',3,null,null,'NEED_VERIFY','HOLD','CUTOVER_PLAN','DEC-FIN-CUTOVER-20260929-001','FIN has Homestay aggregate plan only; no authoritative Lavender/Ruby split.','Set target only after branch-level October forecast is approved.'),
 ('2026-10-01','BUSINESS','COZY_GARDEN','EXPECTED_BUSINESS_REVENUE','Expected Revenue — Cozy Garden',3,220000000,null,'ESTIMATED','NEED_VERIFY','FIN-HOSPITALITY-001','02 Plan & Assumption · October Cozy plan','Planning baseline only, not Actual.','Replace with approved October operating forecast if revised.'),
 ('2026-10-01','BUSINESS','LAVENDER','PAYROLL','Payroll — Lavender',5,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Close September payroll and approve October roster/payroll budget.'),
 ('2026-10-01','BUSINESS','RUBY','PAYROLL','Payroll — Ruby',5,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Close September payroll and approve October roster/payroll budget.'),
 ('2026-10-01','BUSINESS','COZY_GARDEN','PAYROLL','Payroll — Cozy Garden',5,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Close September payroll and approve October roster/payroll budget.'),
 ('2026-10-01','BUSINESS','LAVENDER','UTILITIES','Utilities — Lavender',6,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Capture actual electricity/water invoices.'),
 ('2026-10-01','BUSINESS','RUBY','UTILITIES','Utilities — Ruby',6,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Capture actual electricity/water invoices.'),
 ('2026-10-01','BUSINESS','COZY_GARDEN','UTILITIES','Utilities — Cozy Garden',6,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Capture actual electricity/water invoices.'),
 ('2026-10-01','BUSINESS','LAVENDER','OTA_COMMISSION','OTA Commission — Lavender',7,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Use actual settlement/invoice, not forecast percentage.'),
 ('2026-10-01','BUSINESS','RUBY','OTA_COMMISSION','OTA Commission — Ruby',7,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Use actual settlement/invoice, not forecast percentage.'),
 ('2026-10-01','BUSINESS','COZY_GARDEN','OTA_COMMISSION','Channel/Platform Fees — Cozy Garden',7,null,null,'NEED_VERIFY','HOLD','CUTOVER_CHECKLIST','DEC-FIN-CUTOVER-20260929-001',null,'Use actual platform/payment fee evidence if applicable.')
on conflict(plan_month,financial_domain,business_unit,line_code) do update set
 line_name=excluded.line_name,priority_order=excluded.priority_order,baseline_amount=excluded.baseline_amount,
 target_amount=excluded.target_amount,verification_status=excluded.verification_status,gate_status=excluded.gate_status,
 source=excluded.source,source_reference=excluded.source_reference,formula_note=excluded.formula_note,
 review_condition=excluded.review_condition,updated_at=now();

insert into public.activity_logs(agent,unit,message,type)
values('TUAN OS','Finance','October 2026 operating plan normalized to Lavender / Ruby / Cozy Garden business-unit dimensions; no combined Hospitality+Cozy revenue target is treated as canonical.','action');
