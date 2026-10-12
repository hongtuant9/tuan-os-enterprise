-- STAGING ONLY: correct structure audit trigger column access by table type.
CREATE OR REPLACE FUNCTION public.bv_structure_audit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE v_actor uuid; v_tenant uuid; v_entity text; v_id uuid;
BEGIN
 v_actor := (SELECT auth.uid());
 IF v_actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
  RAISE EXCEPTION 'AUTH_REQUIRED';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'IMMUTABLE_STRUCTURE_ID';
  END IF;
  IF TG_TABLE_NAME='bv_properties' THEN
    IF NEW.business_unit_id IS DISTINCT FROM OLD.business_unit_id THEN
      RAISE EXCEPTION 'IMMUTABLE_STRUCTURE_PARENT';
    END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='bv_business_units' THEN v_entity:='business_unit'; ELSE v_entity:='property'; END IF;
 v_tenant:=NEW.tenant_id; v_id:=NEW.id;
 IF NOT EXISTS (SELECT 1 FROM public.bv_memberships m
  WHERE m.tenant_id=v_tenant AND m.user_id=v_actor AND m.role='owner') THEN
  RAISE EXCEPTION 'OWNER_REQUIRED';
 END IF;
 INSERT INTO public.bv_audit_events(tenant_id,actor_user_id,entity_type,entity_id,operation)
 VALUES(v_tenant,v_actor,v_entity,v_id,TG_OP);
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.bv_structure_audit_guard() FROM PUBLIC, anon, authenticated;