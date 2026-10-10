-- BIZVIORA CORE 001: chỉ áp dụng một lần cho Supabase staging độc lập sau phê duyệt.
-- KHÔNG chạy lên dự án TUAN OS production. Chưa có bằng chứng RLS A/B thật.
BEGIN;
CREATE TABLE public.bv_tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.bv_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('owner','admin','manager','staff')),
 UNIQUE(tenant_id,user_id));
CREATE INDEX bv_memberships_user_idx ON public.bv_memberships(user_id,tenant_id);
CREATE TABLE public.bv_business_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 UNIQUE(tenant_id,id));
CREATE TABLE public.bv_properties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id),
 business_unit_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,business_unit_id,id),
 FOREIGN KEY(tenant_id,business_unit_id) REFERENCES public.bv_business_units(tenant_id,id));
CREATE TABLE public.bv_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id),
 business_unit_id uuid,
 property_id uuid,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 180),
 status text NOT NULL DEFAULT 'TODO'
   CHECK(status IN ('TODO','IN_PROGRESS','HOLD','DONE')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 assigned_to uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 CHECK(property_id IS NULL OR business_unit_id IS NOT NULL),
 FOREIGN KEY(tenant_id,business_unit_id) REFERENCES public.bv_business_units(tenant_id,id),
 FOREIGN KEY(tenant_id,business_unit_id,property_id)
   REFERENCES public.bv_properties(tenant_id,business_unit_id,id));
CREATE INDEX bv_tasks_tenant_time ON public.bv_tasks(tenant_id,created_at DESC);
CREATE TABLE public.bv_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id),
 task_id uuid,
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'PENDING'
   CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,task_id) REFERENCES public.bv_tasks(tenant_id,id));
CREATE TABLE public.bv_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id),
 actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 entity_type text NOT NULL CHECK(entity_type='task'),
 entity_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
 occurred_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX bv_audit_tenant_time ON public.bv_audit_events(tenant_id,occurred_at DESC);

CREATE FUNCTION public.bv_task_audit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.bv_tasks; actor uuid;
BEGIN
 actor := auth.uid();
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND
   (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
    NEW.id IS DISTINCT FROM OLD.id OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.created_at IS DISTINCT FROM OLD.created_at)
 THEN RAISE EXCEPTION 'IMMUTABLE_TASK_IDENTITY'; END IF;
 IF TG_OP='DELETE' THEN current_row:=OLD;
 ELSE current_row:=NEW; END IF;
 IF TG_OP='UPDATE' THEN NEW.updated_at:=now(); END IF;
 INSERT INTO public.bv_audit_events(tenant_id,actor_user_id,entity_type,entity_id,operation)
 VALUES(current_row.tenant_id,actor,'task',current_row.id,TG_OP);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bv_tasks_audit_guard BEFORE INSERT OR UPDATE OR DELETE
 ON public.bv_tasks FOR EACH ROW EXECUTE FUNCTION public.bv_task_audit_guard();

ALTER TABLE public.bv_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bv_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bv_business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bv_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bv_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bv_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bv_audit_events ENABLE ROW LEVEL SECURITY;

-- Membership không có quyền INSERT/UPDATE/DELETE từ tài khoản khách hàng.
CREATE POLICY bv_member_self ON public.bv_memberships FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
CREATE POLICY bv_tenant_member ON public.bv_tenants FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_tenants.id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY bv_business_unit_member ON public.bv_business_units FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_business_units.tenant_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY bv_property_member ON public.bv_properties FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_properties.tenant_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY bv_task_member_read ON public.bv_tasks FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_tasks.tenant_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY bv_task_manager_insert ON public.bv_tasks FOR INSERT TO authenticated
 WITH CHECK(
 created_by=(SELECT auth.uid()) AND
 EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_tasks.tenant_id AND m.user_id=(SELECT auth.uid())
 AND m.role IN ('owner','admin','manager')) AND
 (assigned_to IS NULL OR EXISTS(SELECT 1 FROM public.bv_memberships a
 WHERE a.tenant_id=bv_tasks.tenant_id AND a.user_id=bv_tasks.assigned_to)));
CREATE POLICY bv_task_manager_update ON public.bv_tasks FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_tasks.tenant_id AND m.user_id=(SELECT auth.uid())
 AND m.role IN ('owner','admin','manager')))
 WITH CHECK (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_tasks.tenant_id AND m.user_id=(SELECT auth.uid())
 AND m.role IN ('owner','admin','manager')) AND
 (assigned_to IS NULL OR EXISTS(SELECT 1 FROM public.bv_memberships a
 WHERE a.tenant_id=bv_tasks.tenant_id AND a.user_id=bv_tasks.assigned_to)));
CREATE POLICY bv_approval_member_read ON public.bv_approvals FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_approvals.tenant_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY bv_audit_manager_read ON public.bv_audit_events FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=bv_audit_events.tenant_id AND m.user_id=(SELECT auth.uid())
 AND m.role IN ('owner','admin','manager')));

REVOKE ALL ON public.bv_tenants,public.bv_memberships,
 public.bv_business_units,public.bv_properties,public.bv_tasks,
 public.bv_approvals,public.bv_audit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.bv_tenants,public.bv_memberships,
 public.bv_business_units,public.bv_properties,public.bv_tasks,
 public.bv_approvals,public.bv_audit_events TO authenticated;
GRANT INSERT,UPDATE ON public.bv_tasks TO authenticated;
COMMIT;
-- Không có tài khoản mật khẩu demo. Quyền tạo tenant/membership cần quy trình admin riêng.
-- Chưa nghiệm thu thử JWT A/B thật, hồi phục, Git secret scan. SECURITY_GATE_HOLD.
