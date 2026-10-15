\set ON_ERROR_STOP on
-- Synthetic JWT claim is injected by the harness, not verified cryptographically.
-- This tests RLS enforcement under the authenticated role, NOT signed-token verification.
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON public.bv_tenants,public.bv_memberships TO authenticated;
ALTER TABLE public.bv_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bv_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY bv_ci_membership_self ON public.bv_memberships FOR SELECT TO authenticated
 USING (user_id=auth.uid());
CREATE POLICY bv_ci_tenant_member ON public.bv_tenants FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_tenants.id AND m.user_id=auth.uid()));
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $$
DECLARE v int; r record;
BEGIN
 SELECT count(*) INTO v FROM public.bv_tenants;
 IF v<>1 THEN RAISE EXCEPTION 'RLS_TENANT_LEAK %',v; END IF;
 SELECT * INTO r FROM public.bv_update_tenant_profile_atomic(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3,'Owner A role verified');
 IF r.version<>4 OR r.audit_event_id IS NULL THEN RAISE EXCEPTION 'RPC_AUTH_ROLE_FAILED'; END IF;
 RAISE NOTICE 'AUTHENTICATED_ROLE_RPC_AND_RLS_PASS';
END $$;
-- Authenticated clients must not modify tenant or audit tables directly.
DO $$ BEGIN
 BEGIN
  UPDATE public.bv_tenants SET name='BYPASS' WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  RAISE EXCEPTION 'DIRECT_UPDATE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'DIRECT_UPDATE_DENIED_PASS'; END;
 BEGIN
  INSERT INTO public.bv_tenant_profile_audit
  (tenant_id,actor_user_id,previous_name,new_name,previous_version,new_version)
  VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111','before','after',4,5);
  RAISE EXCEPTION 'DIRECT_AUDIT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'DIRECT_AUDIT_DENIED_PASS'; END;
END $$;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $$
DECLARE v int;
BEGIN
 SELECT count(*) INTO v FROM public.bv_tenants;
 IF v<>1 THEN RAISE EXCEPTION 'TENANT_B_RLS_LEAK %',v; END IF;
 BEGIN
  PERFORM public.bv_update_tenant_profile_atomic('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',4,'Cross write');
  RAISE EXCEPTION 'TENANT_B_CROSS_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TENANT_B_DENIED_PASS'; END;
END $$;
RESET ROLE;
