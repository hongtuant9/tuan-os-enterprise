-- Independent self-hosted DB RLS/Audit regression; entire transaction is rolled back.
-- Run only on fresh isolated QA database, never on customer / production.
BEGIN;
INSERT INTO bv_tenants(id,slug,name) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic-a','Synthetic A'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','synthetic-b','Synthetic B');
INSERT INTO bv_memberships(tenant_id,user_id,role) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','staff'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','owner');
INSERT INTO bv_qa_business_finance(tenant_id,amount) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',200);
INSERT INTO bv_qa_private_finance(tenant_id,owner_user_id,amount) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',300),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',400),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333',500);
SET LOCAL ROLE bv_api_member;
SELECT set_config('app.actor_user_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE task_id uuid; approval_id uuid; audit_count integer;
BEGIN
 IF (SELECT count(*) FROM bv_tenants)<>1 OR
    (SELECT count(*) FROM bv_qa_business_finance)<>1 OR
    (SELECT amount FROM bv_qa_private_finance LIMIT 1)<>300 OR
    (SELECT count(*) FROM bv_qa_private_finance)<>1
 THEN RAISE EXCEPTION 'OWNER_A_FINANCIAL_ISOLATION_FAILED'; END IF;
 INSERT INTO bv_tasks(tenant_id,title,created_by) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic QA Task','11111111-1111-4111-8111-111111111111')
 RETURNING id INTO task_id;
 BEGIN
   INSERT INTO bv_tasks(tenant_id,title,created_by) VALUES
   ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cross','11111111-1111-4111-8111-111111111111');
   RAISE EXCEPTION 'CROSS_TENANT_TASK_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 INSERT INTO bv_approvals(tenant_id,task_id,requested_by) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',task_id,'11111111-1111-4111-8111-111111111111')
 RETURNING id INTO approval_id;
 UPDATE bv_approvals SET status='APPROVED' WHERE id=approval_id;
 BEGIN
  UPDATE bv_approvals SET status='REJECTED' WHERE id=approval_id;
  RAISE EXCEPTION 'REPEAT_APPROVAL_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 SELECT count(*) INTO audit_count FROM bv_audit_events
 WHERE entity_id=approval_id AND operation IN ('INSERT','UPDATE');
 IF audit_count<>2 THEN RAISE EXCEPTION 'APPROVAL_AUDIT_MISSING'; END IF;
 RAISE NOTICE 'QA OWNER A RLS TASK APPROVAL AUDIT PASS';
END $$;
SELECT set_config('app.actor_user_id','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM bv_qa_private_finance)
 OR EXISTS (SELECT 1 FROM bv_qa_business_finance)
 THEN RAISE EXCEPTION 'STAFF_FINANCE_LEAK'; END IF;
 BEGIN
  INSERT INTO bv_tasks(tenant_id,title,created_by)
  VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','staff cannot write','22222222-2222-4222-8222-222222222222');
  RAISE EXCEPTION 'STAFF_TASK_WRITE_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM bv_audit_events) THEN
  RAISE EXCEPTION 'STAFF_AUDIT_LEAK';
 END IF;
 RAISE NOTICE 'QA STAFF BUSINESS_FINANCE_DENY PRIVATE_FINANCE_DENY TASK_WRITE_DENY AUDIT_DENY PASS';
END $$;
SELECT set_config('app.actor_user_id','33333333-3333-4333-8333-333333333333',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM bv_tenants)<>1 OR
 (SELECT count(*) FROM bv_qa_business_finance)<>1 OR
 (SELECT amount FROM bv_qa_private_finance LIMIT 1)<>500 OR
 (SELECT count(*) FROM bv_tasks)<>0
 THEN RAISE EXCEPTION 'TENANT_B_ISOLATION_FAILED'; END IF;
 RAISE NOTICE 'QA OWNER B CROSS TENANT AND PRIVATE FINANCE PASS';
END $$;
ROLLBACK;
