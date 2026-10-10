-- CORE 002: BÀI KIỂM THỬ RLS THẬT TRÊN POSTGRES, JWT CLAIM GIẢ LẬP.
-- DỰ ÁN DUY NHẤT ĐƯỢC PHÉP: oxakhhpyvvymujiwuvnm.
-- KHÔNG dùng trên production; không chứng minh JWT Auth API end-to-end.
-- Mọi tài khoản/tenant/task bên dưới sẽ ROLLBACK, không để lại dữ liệu thử.
BEGIN;
INSERT INTO auth.users (id,instance_id,aud,role) VALUES
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('33333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.bv_tenants(id,slug,name) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bv-core002-a','Doanh nghiệp A giả lập'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bv-core002-b','Doanh nghiệp B giả lập');
INSERT INTO public.bv_memberships(tenant_id,user_id,role) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','staff'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','owner');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM public.bv_tenants)<>1 THEN RAISE EXCEPTION 'A_TENANTS_NOT_ISOLATED'; END IF;
 IF (SELECT COUNT(*) FROM public.bv_memberships)<>1 THEN RAISE EXCEPTION 'A_MEMBERSHIPS_NOT_ISOLATED'; END IF;
 INSERT INTO public.bv_tasks(tenant_id,created_by,title)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','RLS_A_TASK');
 IF (SELECT COUNT(*) FROM public.bv_audit_events)<>1 THEN RAISE EXCEPTION 'AUDIT_INSERT_NOT_FOUND'; END IF;
 BEGIN
  INSERT INTO public.bv_tasks(tenant_id,created_by,title)
  VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','DENIED_A_TO_B');
  RAISE EXCEPTION 'A_TO_B_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM public.bv_tasks)<>1 THEN RAISE EXCEPTION 'STAFF_A_TASK_READ'; END IF;
 IF EXISTS(SELECT 1 FROM public.bv_audit_events) THEN RAISE EXCEPTION 'STAFF_A_AUDIT_LEAK'; END IF;
 BEGIN
  INSERT INTO public.bv_tasks(tenant_id,created_by,title)
  VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','DENIED_STAFF');
  RAISE EXCEPTION 'STAFF_INSERT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO public.bv_memberships(tenant_id,user_id,role)
  VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');
  RAISE EXCEPTION 'PRIVILEGE_ESCALATION_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM public.bv_tenants)<>1 THEN RAISE EXCEPTION 'B_TENANTS_NOT_ISOLATED'; END IF;
 IF EXISTS(SELECT 1 FROM public.bv_tasks WHERE title='RLS_A_TASK') THEN RAISE EXCEPTION 'B_CAN_READ_A_TASK'; END IF;
 INSERT INTO public.bv_tasks(tenant_id,created_by,title)
 VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','RLS_B_TASK');
 IF (SELECT COUNT(*) FROM public.bv_audit_events)<>1 THEN RAISE EXCEPTION 'AUDIT_CROSS_TENANT_LEAK'; END IF;
 BEGIN
  INSERT INTO public.bv_approvals(tenant_id,requested_by,status)
  VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','APPROVED');
  RAISE EXCEPTION 'APPROVAL_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM public.bv_tasks)<>1 THEN RAISE EXCEPTION 'A_CAN_READ_B_TASK'; END IF;
 IF (SELECT COUNT(*) FROM public.bv_audit_events)<>1 THEN RAISE EXCEPTION 'A_CAN_READ_B_AUDIT'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
