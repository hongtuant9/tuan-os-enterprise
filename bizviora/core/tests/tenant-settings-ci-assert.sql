\set ON_ERROR_STOP on
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM public.bv_update_tenant_profile_atomic('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'TUAN OS updated');
 IF r.version<>2 OR r.audit_event_id IS NULL THEN RAISE EXCEPTION 'UPDATE_AUDIT_FAILED'; END IF;
 IF (SELECT count(*) FROM public.bv_tenant_profile_audit WHERE tenant_id=r.tenant_id)<>1 THEN RAISE EXCEPTION 'AUDIT_COUNT'; END IF;
 RAISE NOTICE 'OWNER_A_UPDATE_AUDIT_PASS';
END $$;
DO $$ BEGIN
 PERFORM public.bv_update_tenant_profile_atomic('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'Cross tenant');
 RAISE EXCEPTION 'CROSS_TENANT_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'CROSS_TENANT_DENIED_PASS'; END $$;
SET request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
DO $$ BEGIN
 PERFORM public.bv_update_tenant_profile_atomic('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'Staff write');
 RAISE EXCEPTION 'STAFF_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'STAFF_DENIED_PASS'; END $$;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 PERFORM public.bv_update_tenant_profile_atomic('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'Stale update');
 RAISE EXCEPTION 'STALE_WRITE_ALLOWED';
EXCEPTION WHEN serialization_failure THEN RAISE NOTICE 'STALE_VERSION_DENIED_PASS'; END $$;
DO $$
BEGIN
 BEGIN
  ALTER TABLE public.bv_tenant_profile_audit ADD CONSTRAINT force_audit_error CHECK (new_name <> 'Must rollback') NOT VALID;
  PERFORM public.bv_update_tenant_profile_atomic('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'Must rollback');
  RAISE EXCEPTION 'AUDIT_FAILURE_WAS_IGNORED';
 EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'AUDIT_ERROR_ROLLBACK_PASS';
 END;
 IF (SELECT settings_version FROM public.bv_tenants WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>2 THEN RAISE EXCEPTION 'VERSION_NOT_ROLLED_BACK'; END IF;
 IF (SELECT count(*) FROM public.bv_tenant_profile_audit WHERE tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>1 THEN RAISE EXCEPTION 'AUDIT_COUNT_AFTER_ROLLBACK'; END IF;
END $$;
