-- Synthetic Phase1 only: local PostgreSQL tenant isolation and finance privacy.
-- Executed as the PostgreSQL table owner during isolated volume initialization.
CREATE TABLE bv_tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, name text NOT NULL
);
CREATE TABLE bv_memberships (
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id),
 user_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('staff','manager','admin','owner')),
 PRIMARY KEY (tenant_id,user_id)
);
CREATE TABLE bv_business_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id), name text NOT NULL
);
CREATE TABLE bv_properties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id),
 business_unit_id uuid REFERENCES bv_business_units(id), name text NOT NULL
);
CREATE TABLE bv_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id),
 business_unit_id uuid REFERENCES bv_business_units(id),
 property_id uuid REFERENCES bv_properties(id),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
 status text NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','DONE')),
 assigned_to uuid,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bv_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id),
 task_id uuid REFERENCES bv_tasks(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
 requested_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bv_audit_events (
 id bigserial PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id),
 actor_user_id uuid NOT NULL,
 entity_type text NOT NULL,
 entity_id uuid NOT NULL,
 operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
-- Test-only financial RLS fixtures. No business/customer financial data.
CREATE TABLE bv_qa_business_finance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id),
 amount numeric(14,2) NOT NULL
);
CREATE TABLE bv_qa_private_finance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES bv_tenants(id),
 owner_user_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL
);
CREATE INDEX ON bv_tasks(tenant_id,created_at DESC);
CREATE INDEX ON bv_approvals(tenant_id,created_at DESC);
CREATE INDEX ON bv_audit_events(tenant_id,occurred_at DESC);

CREATE FUNCTION bv_actor() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('app.actor_user_id',true),'')::uuid
$$;
CREATE FUNCTION bv_member(t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM bv_memberships m WHERE m.tenant_id=t AND m.user_id=bv_actor())
$$;
CREATE FUNCTION bv_manager(t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM bv_memberships m
 WHERE m.tenant_id=t AND m.user_id=bv_actor() AND m.role IN ('manager','admin','owner'))
$$;
REVOKE ALL ON FUNCTION bv_member(uuid), bv_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bv_member(uuid), bv_manager(uuid), bv_actor() TO bv_api_member;

ALTER TABLE bv_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_qa_business_finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_qa_private_finance ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_read ON bv_tenants FOR SELECT TO bv_api_member USING (bv_member(id));
CREATE POLICY memberships_read ON bv_memberships FOR SELECT TO bv_api_member USING (user_id=bv_actor());
CREATE POLICY bu_read ON bv_business_units FOR SELECT TO bv_api_member USING (bv_member(tenant_id));
CREATE POLICY properties_read ON bv_properties FOR SELECT TO bv_api_member USING (bv_member(tenant_id));
CREATE POLICY tasks_read ON bv_tasks FOR SELECT TO bv_api_member USING (bv_member(tenant_id));
CREATE POLICY tasks_insert ON bv_tasks FOR INSERT TO bv_api_member
 WITH CHECK (bv_manager(tenant_id) AND created_by=bv_actor());
CREATE POLICY approval_read ON bv_approvals FOR SELECT TO bv_api_member USING (bv_member(tenant_id));
CREATE POLICY approval_insert ON bv_approvals FOR INSERT TO bv_api_member
 WITH CHECK (bv_member(tenant_id) AND requested_by=bv_actor() AND status='PENDING');
CREATE POLICY approval_update ON bv_approvals FOR UPDATE TO bv_api_member
 USING (bv_manager(tenant_id)) WITH CHECK (bv_manager(tenant_id));
CREATE POLICY audit_read ON bv_audit_events FOR SELECT TO bv_api_member USING (bv_manager(tenant_id));
-- Business finance requires a finance-authorized management role. Staff cannot read it.
CREATE POLICY biz_finance_read ON bv_qa_business_finance FOR SELECT TO bv_api_member
 USING (bv_manager(tenant_id));
-- Personal finance is strictly owned by tenant owner; explicit delegation is disabled
-- until a separately reviewed, revocable authorisation flow exists.
CREATE FUNCTION bv_owner(t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM bv_memberships m
 WHERE m.tenant_id=t AND m.user_id=bv_actor() AND m.role='owner')
$$;
REVOKE ALL ON FUNCTION bv_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bv_owner(uuid) TO bv_api_member;
CREATE POLICY private_finance_read ON bv_qa_private_finance FOR SELECT TO bv_api_member
 USING (owner_user_id=bv_actor() AND bv_owner(tenant_id));
GRANT USAGE ON SCHEMA public TO bv_api_member;
GRANT SELECT ON bv_tenants,bv_memberships,bv_business_units,bv_properties,bv_tasks,bv_approvals,bv_audit_events,
 bv_qa_business_finance,bv_qa_private_finance TO bv_api_member;
GRANT INSERT ON bv_tasks,bv_approvals TO bv_api_member;
GRANT UPDATE(status) ON bv_approvals TO bv_api_member;
REVOKE ALL ON bv_qa_private_finance,bv_qa_business_finance FROM PUBLIC;

-- DB-owned guards and audit. Never let HTTP actors forge historical Audit.
CREATE FUNCTION bv_task_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO bv_audit_events(tenant_id,actor_user_id,entity_type,entity_id,operation)
 VALUES(NEW.tenant_id,bv_actor(),'task',NEW.id,TG_OP);
 RETURN NEW;
END $$;
CREATE TRIGGER bv_task_insert_audit AFTER INSERT ON bv_tasks FOR EACH ROW EXECUTE FUNCTION bv_task_audit();
CREATE FUNCTION bv_approval_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'PENDING' OR NEW.requested_by IS DISTINCT FROM bv_actor()
   THEN RAISE EXCEPTION 'INVALID_APPROVAL_REQUEST' USING ERRCODE='42501'; END IF;
 ELSE
   IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED')
   THEN RAISE EXCEPTION 'INVALID_APPROVAL_TRANSITION' USING ERRCODE='42501'; END IF;
   IF ROW(NEW.id,NEW.tenant_id,NEW.task_id,NEW.requested_by,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.task_id,OLD.requested_by,OLD.created_at)
   THEN RAISE EXCEPTION 'IMMUTABLE_APPROVAL_FIELDS' USING ERRCODE='42501'; END IF;
   IF NOT bv_manager(OLD.tenant_id)
   THEN RAISE EXCEPTION 'APPROVAL_DECISION_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO bv_audit_events(tenant_id,actor_user_id,entity_type,entity_id,operation)
 VALUES(NEW.tenant_id,bv_actor(),'approval',NEW.id,TG_OP);
 RETURN NEW;
END $$;
CREATE TRIGGER bv_approval_guard_audit BEFORE INSERT OR UPDATE ON bv_approvals
 FOR EACH ROW EXECUTE FUNCTION bv_approval_guard();

-- Defense-in-depth: linked business unit/property/approval task must belong to actor tenant.
CREATE FUNCTION bv_validate_task_tenant() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.business_unit_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM bv_business_units WHERE id=NEW.business_unit_id AND tenant_id=NEW.tenant_id)
 THEN RAISE EXCEPTION 'CROSS_TENANT_BUSINESS_UNIT' USING ERRCODE='42501'; END IF;
 IF NEW.property_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM bv_properties WHERE id=NEW.property_id AND tenant_id=NEW.tenant_id)
 THEN RAISE EXCEPTION 'CROSS_TENANT_PROPERTY' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bv_task_tenant_refs BEFORE INSERT OR UPDATE ON bv_tasks
 FOR EACH ROW EXECUTE FUNCTION bv_validate_task_tenant();
CREATE FUNCTION bv_validate_approval_task_tenant() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.task_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM bv_tasks WHERE id=NEW.task_id AND tenant_id=NEW.tenant_id)
 THEN RAISE EXCEPTION 'CROSS_TENANT_APPROVAL_TASK' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bv_approval_tenant_refs BEFORE INSERT ON bv_approvals
 FOR EACH ROW EXECUTE FUNCTION bv_validate_approval_task_tenant();


-- Founder onboarding QA: platform grants are DBA-provisioned only, never self-service.
CREATE TABLE bv_platform_managers(user_id uuid PRIMARY KEY);
CREATE FUNCTION bv_platform_manager() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM bv_platform_managers WHERE user_id=bv_actor())
$$;
REVOKE ALL ON bv_platform_managers FROM PUBLIC;
REVOKE ALL ON FUNCTION bv_platform_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bv_platform_manager() TO bv_api_member;

CREATE TABLE bv_company_applications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 applicant_user_id uuid NOT NULL,
 company_name text NOT NULL CHECK(length(trim(company_name)) BETWEEN 2 AND 120),
 requested_slug text NOT NULL CHECK(requested_slug ~ '^[a-z][a-z0-9-]{2,47}$'),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 tenant_id uuid UNIQUE REFERENCES bv_tenants(id),
 reviewed_by uuid, decision_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 UNIQUE(applicant_user_id,requested_slug)
);
CREATE TABLE bv_company_audit(
 id bigserial PRIMARY KEY,
 application_id uuid NOT NULL REFERENCES bv_company_applications(id),
 actor_user_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('CREATED','APPROVED','REJECTED')),
 tenant_id uuid REFERENCES bv_tenants(id),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bv_company_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_company_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY application_read ON bv_company_applications FOR SELECT TO bv_api_member
 USING(applicant_user_id=bv_actor() OR bv_platform_manager());
CREATE POLICY application_submit ON bv_company_applications FOR INSERT TO bv_api_member
 WITH CHECK(applicant_user_id=bv_actor() AND status='PENDING' AND tenant_id IS NULL AND reviewed_by IS NULL);
CREATE POLICY company_audit_read ON bv_company_audit FOR SELECT TO bv_api_member
 USING(bv_platform_manager() OR EXISTS(
 SELECT 1 FROM bv_company_applications a WHERE a.id=application_id AND a.applicant_user_id=bv_actor()));
GRANT SELECT,INSERT ON bv_company_applications TO bv_api_member;
GRANT SELECT ON bv_company_audit TO bv_api_member;

CREATE FUNCTION bv_application_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO bv_company_audit(application_id,actor_user_id,operation)
 VALUES(NEW.id,bv_actor(),'CREATED');
 RETURN NEW;
END $$;
CREATE TRIGGER company_application_created AFTER INSERT ON bv_company_applications
 FOR EACH ROW EXECUTE FUNCTION bv_application_audit();

-- Only a platform manager can execute this atomic, row-locked decision.
CREATE FUNCTION bv_review_application(p_application uuid,p_decision text)
 RETURNS TABLE(application_id uuid,decision_status text,activated_tenant uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a bv_company_applications%ROWTYPE; t uuid;
BEGIN
 IF NOT bv_platform_manager() THEN RAISE EXCEPTION 'FOUNDER_DENIED' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('APPROVED','REJECTED') THEN
  RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE='22023';
 END IF;
 SELECT * INTO a FROM bv_company_applications WHERE id=p_application FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF a.status<>'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23505'; END IF;
 IF p_decision='APPROVED' THEN
  INSERT INTO bv_tenants(slug,name) VALUES(a.requested_slug,a.company_name) RETURNING id INTO t;
  INSERT INTO bv_memberships(tenant_id,user_id,role) VALUES(t,a.applicant_user_id,'owner');
 END IF;
 UPDATE bv_company_applications SET status=p_decision,tenant_id=t,
  reviewed_by=bv_actor(),reviewed_at=now() WHERE id=a.id;
 INSERT INTO bv_company_audit(application_id,actor_user_id,operation,tenant_id)
 VALUES(a.id,bv_actor(),p_decision,t);
 RETURN QUERY SELECT a.id,p_decision,t;
END $$;
REVOKE ALL ON FUNCTION bv_review_application(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bv_review_application(uuid,text) TO bv_api_member;
