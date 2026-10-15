-- BIZ20-009 STAGING-ONLY DRAFT; DO NOT APPLY without backup/restore, Gate A and owner release approval.
-- Adds tenant version and an isolated settings audit, preserving existing task-only audit constraints.
BEGIN;
ALTER TABLE public.bv_tenants ADD COLUMN IF NOT EXISTS settings_version bigint NOT NULL DEFAULT 1
 CHECK (settings_version >= 1);
CREATE TABLE IF NOT EXISTS public.bv_tenant_profile_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id),
 actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 previous_name text NOT NULL,
 new_name text NOT NULL,
 previous_version bigint NOT NULL,
 new_version bigint NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT bv_profile_audit_versions CHECK (new_version=previous_version+1)
);
CREATE INDEX IF NOT EXISTS bv_profile_audit_tenant_time
 ON public.bv_tenant_profile_audit(tenant_id,changed_at DESC);
ALTER TABLE public.bv_tenant_profile_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bv_tenant_profile_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.bv_tenant_profile_audit TO authenticated;
DROP POLICY IF EXISTS bv_profile_audit_owner_read ON public.bv_tenant_profile_audit;
CREATE POLICY bv_profile_audit_owner_read ON public.bv_tenant_profile_audit
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.bv_memberships m WHERE m.tenant_id=bv_tenant_profile_audit.tenant_id
 AND m.user_id=(SELECT auth.uid()) AND m.role IN ('owner','admin')
));
CREATE OR REPLACE FUNCTION public.bv_update_tenant_profile_atomic(
 p_tenant_id uuid,p_expected_version bigint,p_name text)
RETURNS TABLE(tenant_id uuid,name text,version bigint,audit_event_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid; v_old_name text; v_version bigint; v_next bigint; v_audit uuid;
BEGIN
 v_actor:=auth.uid();
 IF v_actor IS NULL THEN RAISE EXCEPTION 'SETTINGS_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120 OR
    p_expected_version IS NULL OR p_expected_version<1
 THEN RAISE EXCEPTION 'SETTINGS_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bv_memberships m
               WHERE m.tenant_id=p_tenant_id AND m.user_id=v_actor
               AND m.role IN ('owner','admin'))
 THEN RAISE EXCEPTION 'SETTINGS_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT t.name,t.settings_version INTO v_old_name,v_version
 FROM public.bv_tenants t WHERE t.id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SETTINGS_NOT_FOUND' USING ERRCODE='42501'; END IF;
 -- Recheck membership after taking the row lock to reduce revocation races.
 IF NOT EXISTS(SELECT 1 FROM public.bv_memberships m
               WHERE m.tenant_id=p_tenant_id AND m.user_id=v_actor
               AND m.role IN ('owner','admin'))
 THEN RAISE EXCEPTION 'SETTINGS_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF v_version<>p_expected_version
 THEN RAISE EXCEPTION 'SETTINGS_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
 v_next:=v_version+1;
 UPDATE public.bv_tenants t SET name=btrim(p_name),settings_version=v_next WHERE t.id=p_tenant_id;
 INSERT INTO public.bv_tenant_profile_audit
 (tenant_id,actor_user_id,previous_name,new_name,previous_version,new_version)
 VALUES (p_tenant_id,v_actor,v_old_name,btrim(p_name),v_version,v_next) RETURNING id INTO v_audit;
 RETURN QUERY SELECT p_tenant_id,btrim(p_name),v_next,v_audit;
END; $$;
REVOKE ALL ON FUNCTION public.bv_update_tenant_profile_atomic(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bv_update_tenant_profile_atomic(uuid,bigint,text) TO authenticated;
COMMIT;
-- STOP: no deployment to existing staging until independent restore and JWT/RLS verification.
