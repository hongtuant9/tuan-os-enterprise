-- Register the 15 logical TCE AI Agent roles in the existing agents table.
-- Runtime remains shared; this does not create 15 containers/processes.

insert into public.agents
  (id, business_unit_id, name, unit, status, current_task, last_active_at)
values
  ('21000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Multi-entry Intent Router','TCE AI','online','ACTIVE · L1_SAFE · intent routing',now()),
  ('21000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','AI Receptionist','TCE AI','online','ACTIVE · L1_SAFE · guest FAQ/intake',now()),
  ('21000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','AI Concierge','TCE AI','idle','SHADOW · L1_SAFE · local concierge',now()),
  ('21000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','AI Upsell','TCE AI','idle','SHADOW · L1_SAFE · contextual cross-sell',now()),
  ('21000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','Booking Assistant','TCE AI','online','ACTIVE · L1_SAFE · read/draft only',now()),
  ('21000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000002','Booking Agent','TCE AI','idle','APPROVAL_REQUIRED · L2_APPROVAL · write gated',now()),
  ('21000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000002','Channel Auditor','TCE AI','online','ACTIVE · L0_READ · channel reconciliation',now()),
  ('21000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000002','Website Agent','TCE AI','idle','APPROVAL_REQUIRED · L2_APPROVAL · web mutation gated',now())
on conflict (id) do update set current_task=excluded.current_task, status=excluded.status, last_active_at=excluded.last_active_at;
insert into public.agents
  (id, business_unit_id, name, unit, status, current_task, last_active_at)
values
  ('21000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000002','Manager Agent','TCE AI','online','ACTIVE · L1_SAFE · CEO brief/triage',now()),
  ('21000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','Ads Agent','TCE AI','idle','SHADOW · L3_CRITICAL · recommend only',now()),
  ('21000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','Data Quality Agent','TCE AI','online','ACTIVE · L1_SAFE · SSOT guard',now()),
  ('21000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','Operations Quality Agent','TCE AI','idle','SHADOW · L1_SAFE · operations QA',now()),
  ('21000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000002','Reputation Agent','TCE AI','idle','SHADOW · L1_SAFE · review intelligence',now()),
  ('21000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000002','Revenue & Yield Agent','TCE AI','idle','SHADOW · L2_APPROVAL · rate recommendation',now()),
  ('21000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000002','Computer Operator Controller','TCE AI','idle','APPROVAL_REQUIRED · L2_APPROVAL · worker controller',now())
on conflict (id) do update set current_task=excluded.current_task, status=excluded.status, last_active_at=excluded.last_active_at;