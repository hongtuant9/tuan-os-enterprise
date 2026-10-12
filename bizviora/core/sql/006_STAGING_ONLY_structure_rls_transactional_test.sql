-- STAGING transactional negative/positive suite; synthetic UUIDs only; rollback all fixture writes.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role) VALUES
('f6111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('f6222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('f6333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.bv_tenants(id,slug,name) VALUES
('f6aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bv-struct-qa-20261012-a','Synthetic A'),
('f6bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bv-struct-qa-20261012-b','Synthetic B');
INSERT INTO public.bv_memberships(tenant_id,user_id,role) VALUES
('f6aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','f6111111-1111-4111-8111-111111111111','owner'),
('f6aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','f6222222-2222-4222-8222-222222222222','staff'),
('f6bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','f6333333-3333-4333-8333-333333333333','owner');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f6111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
INSERT INTO public.bv_business_units(id,tenant_id,name) VALUES ('f6a10000-0000-4000-8000-000000000001','f6aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Unit A');
INSERT INTO public.bv_properties(id,tenant_id,business_unit_id,name) VALUES ('f6a20000-0000-4000-8000-000000000001','f6aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','f6a10000-0000-4000-8000-000000000001','Property A');
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.bv_audit_events WHERE entity_type IN ('business_unit','property')) <> 2 THEN RAISE EXCEPTION 'AUDIT_A_MISSING'; END IF;
 BEGIN
   INSERT INTO public.bv_business_units(tenant_id,name) VALUES ('f6bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Cross');
   RAISE EXCEPTION 'CROSS_WRITE_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('OWNER_REQUIRED','new row violates row-level security policy for table "bv_business_units"') THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE public.bv_business_units SET tenant_id='f6bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id='f6a10000-0000-4000-8000-000000000001';
   RAISE EXCEPTION 'MOVE_ALLOWED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'IMMUTABLE_STRUCTURE_ID' THEN RAISE; END IF;
 END;
 UPDATE public.bv_business_units SET name='Unit A Edited' WHERE id='f6a10000-0000-4000-8000-000000000001';
 IF (SELECT count(*) FROM public.bv_audit_events WHERE entity_type='business_unit') <> 2 THEN RAISE EXCEPTION 'AUDIT_UPDATE_MISSING'; END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','f6222222-2222-4222-8222-222222222222',true);
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.bv_business_units)<>1 THEN RAISE EXCEPTION 'STAFF_A_READ_FAILED'; END IF;
 BEGIN
   INSERT INTO public.bv_business_units(tenant_id,name) VALUES ('f6aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Staff denied');
   RAISE EXCEPTION 'STAFF_WRITE_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('OWNER_REQUIRED','new row violates row-level security policy for table "bv_business_units"') THEN RAISE; END IF;
 END;
END $test$;
SELECT set_config('request.jwt.claim.sub','f6333333-3333-4333-8333-333333333333',true);
DO $test$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bv_properties WHERE name='Property A') THEN RAISE EXCEPTION 'B_CAN_READ_A'; END IF;
 BEGIN
   INSERT INTO public.bv_properties(tenant_id,business_unit_id,name) VALUES ('f6bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','f6a10000-0000-4000-8000-000000000001','Cross FK');
   RAISE EXCEPTION 'CROSS_PARENT_ALLOWED';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 INSERT INTO public.bv_business_units(tenant_id,name) VALUES ('f6bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Unit B');
 IF (SELECT count(*) FROM public.bv_audit_events WHERE entity_type='business_unit') <> 1 THEN RAISE EXCEPTION 'AUDIT_B_LEAK_OR_MISSING'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'A_OWNER_B_OWNER_A_STAFF_RLS_AUDIT_TRANSACTIONAL_PASS' AS result;