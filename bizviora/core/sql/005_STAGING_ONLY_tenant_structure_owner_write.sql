-- BIZVIORA STAGING ONLY. Tenant-scoped owner administration; no production application.
BEGIN;
ALTER TABLE public.bv_audit_events DROP CONSTRAINT bv_audit_events_entity_type_check;
ALTER TABLE public.bv_audit_events ADD CONSTRAINT bv_audit_events_entity_type_check
 CHECK (entity_type IN ('task','business_unit','property'));

GRANT INSERT, UPDATE ON public.bv_business_units, public.bv_properties TO authenticated;
CREATE POLICY bv_business_unit_owner_insert ON public.bv_business_units
 FOR INSERT TO authenticated WITH CHECK (
 EXISTS (SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_business_units.tenant_id
 AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));
CREATE POLICY bv_business_unit_owner_update ON public.bv_business_units
 FOR UPDATE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_business_units.tenant_id
 AND m.user_id=(SELECT auth.uid()) AND m.role='owner'))
 WITH CHECK (
 EXISTS (SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_business_units.tenant_id
 AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));
CREATE POLICY bv_property_owner_insert ON public.bv_properties
 FOR INSERT TO authenticated WITH CHECK (
 EXISTS (SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_properties.tenant_id
 AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));
CREATE POLICY bv_property_owner_update ON public.bv_properties
 FOR UPDATE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_properties.tenant_id
 AND m.user_id=(SELECT auth.uid()) AND m.role='owner'))
 WITH CHECK (
 EXISTS (SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_properties.tenant_id
 AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));

CREATE FUNCTION public.bv_structure_audit_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
 AS $body$
 DECLARE v_actor uuid; v_tenant uuid; v_entity text; v_id uuid;
 BEGIN
   v_actor := (SELECT auth.uid());
   IF v_actor IS NULL OR current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'authenticated' THEN
     RAISE EXCEPTION 'AUTH_REQUIRED';
   END IF;
   IF TG_OP = 'UPDATE' THEN
     IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR (TG_TABLE_NAME='bv_properties' AND NEW.business_unit_id IS DISTINCT FROM OLD.business_unit_id) THEN
       RAISE EXCEPTION 'IMMUTABLE_STRUCTURE_ID';
     END IF;
   END IF;
   IF TG_TABLE_NAME='bv_business_units' THEN v_entity:='business_unit'; ELSE v_entity:='property'; END IF;
   v_tenant:=NEW.tenant_id; v_id:=NEW.id;
   -- Trigger enforces access again; RLS and trigger must both agree.
   IF NOT EXISTS (SELECT 1 FROM public.bv_memberships m WHERE m.tenant_id=v_tenant AND m.user_id=v_actor AND m.role='owner') THEN
     RAISE EXCEPTION 'OWNER_REQUIRED';
   END IF;
   INSERT INTO public.bv_audit_events(tenant_id,actor_user_id,entity_type,entity_id,operation)
   VALUES(v_tenant,v_actor,v_entity,v_id,TG_OP);
   RETURN NEW;
 END;
 $body$;
 REVOKE ALL ON FUNCTION public.bv_structure_audit_guard() FROM PUBLIC, anon, authenticated;
 CREATE TRIGGER bv_business_unit_audit BEFORE INSERT OR UPDATE ON public.bv_business_units
  FOR EACH ROW EXECUTE FUNCTION public.bv_structure_audit_guard();
 CREATE TRIGGER bv_property_audit BEFORE INSERT OR UPDATE ON public.bv_properties
  FOR EACH ROW EXECUTE FUNCTION public.bv_structure_audit_guard();
COMMIT;
