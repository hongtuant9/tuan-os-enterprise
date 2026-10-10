-- BIZVIORA Core 002 — diễn tập sao chép/khôi phục LOGICAL trên staging (không phải thử phục hồi backup thật).
-- CHỈ ĐƯỢC CHẠY trên dự án oxakhhpyvvymujiwuvnm đã được duyệt.
-- Kiểm tra dữ liệu thật rỗng; toàn bộ test nằm trong transaction và ROLLBACK.
BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bv_tenants)
 OR EXISTS(SELECT 1 FROM public.bv_memberships)
 OR EXISTS(SELECT 1 FROM public.bv_tasks)
 OR EXISTS(SELECT 1 FROM public.bv_audit_events)
 THEN RAISE EXCEPTION 'STAGING_NOT_EMPTY_ABORT_RESTORE_TEST'; END IF;
END $$;
INSERT INTO auth.users(id,instance_id,aud,role)
 VALUES('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.bv_tenants(id,slug,name)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bv-restore-a','BIZVIORA TEST KHÔI PHỤC');
INSERT INTO public.bv_memberships(tenant_id,user_id,role)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner');
INSERT INTO public.bv_business_units(id,tenant_id,name)
 VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Đơn vị mẫu');
INSERT INTO public.bv_properties(id,tenant_id,business_unit_id,name)
 VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Cơ sở mẫu');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.bv_tasks(id,tenant_id,business_unit_id,property_id,title,status,created_by)
 VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 'Khôi phục lịch công việc mẫu','TODO','11111111-1111-4111-8111-111111111111');
CREATE TEMP TABLE bv_restore_tenants AS SELECT * FROM public.bv_tenants;
CREATE TEMP TABLE bv_restore_memberships AS SELECT * FROM public.bv_memberships;
CREATE TEMP TABLE bv_restore_units AS SELECT * FROM public.bv_business_units;
CREATE TEMP TABLE bv_restore_properties AS SELECT * FROM public.bv_properties;
CREATE TEMP TABLE bv_restore_tasks AS SELECT * FROM public.bv_tasks;
CREATE TEMP TABLE bv_restore_audit AS SELECT * FROM public.bv_audit_events;
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM bv_restore_tenants)<>1 OR (SELECT COUNT(*) FROM bv_restore_tasks)<>1
 OR (SELECT COUNT(*) FROM bv_restore_audit)<>1
 THEN RAISE EXCEPTION 'SNAPSHOT_INCOMPLETE'; END IF;
END $$;
-- Giả lập mất dữ liệu chỉ trong transaction synthetic, sau đó khôi phục từ bản sao TEMP.
DELETE FROM public.bv_tasks;
DELETE FROM public.bv_audit_events;
DELETE FROM public.bv_properties;
DELETE FROM public.bv_business_units;
DELETE FROM public.bv_memberships;
DELETE FROM public.bv_tenants;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.bv_tenants) OR EXISTS (SELECT 1 FROM public.bv_tasks)
 THEN RAISE EXCEPTION 'SIMULATED_WIPE_FAILED'; END IF;
END $$;
INSERT INTO public.bv_tenants SELECT * FROM bv_restore_tenants;
INSERT INTO public.bv_memberships SELECT * FROM bv_restore_memberships;
INSERT INTO public.bv_business_units SELECT * FROM bv_restore_units;
INSERT INTO public.bv_properties SELECT * FROM bv_restore_properties;
INSERT INTO public.bv_tasks SELECT * FROM bv_restore_tasks;
DELETE FROM public.bv_audit_events;
INSERT INTO public.bv_audit_events OVERRIDING SYSTEM VALUE SELECT * FROM bv_restore_audit;
DO $$
BEGIN
 IF EXISTS(SELECT * FROM public.bv_tenants EXCEPT SELECT * FROM bv_restore_tenants)
 OR EXISTS(SELECT * FROM bv_restore_tenants EXCEPT SELECT * FROM public.bv_tenants)
 OR EXISTS(SELECT * FROM public.bv_memberships EXCEPT SELECT * FROM bv_restore_memberships)
 OR EXISTS(SELECT * FROM bv_restore_memberships EXCEPT SELECT * FROM public.bv_memberships)
 OR EXISTS(SELECT * FROM public.bv_business_units EXCEPT SELECT * FROM bv_restore_units)
 OR EXISTS(SELECT * FROM bv_restore_units EXCEPT SELECT * FROM public.bv_business_units)
 OR EXISTS(SELECT * FROM public.bv_properties EXCEPT SELECT * FROM bv_restore_properties)
 OR EXISTS(SELECT * FROM bv_restore_properties EXCEPT SELECT * FROM public.bv_properties)
 OR EXISTS(SELECT * FROM public.bv_tasks EXCEPT SELECT * FROM bv_restore_tasks)
 OR EXISTS(SELECT * FROM bv_restore_tasks EXCEPT SELECT * FROM public.bv_tasks)
 OR EXISTS(SELECT * FROM public.bv_audit_events EXCEPT SELECT * FROM bv_restore_audit)
 OR EXISTS(SELECT * FROM bv_restore_audit EXCEPT SELECT * FROM public.bv_audit_events)
 THEN RAISE EXCEPTION 'LOGICAL_RESTORE_MISMATCH'; END IF;
END $$;
-- Không lưu bản ghi thử, không chạm dữ liệu production.
ROLLBACK;
