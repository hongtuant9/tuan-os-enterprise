-- Synthetic only. Transaction is rolled back; no production data.
BEGIN;
INSERT INTO bv_platform_managers(user_id) VALUES ('11111111-1111-4111-8111-111111111111');
SET LOCAL ROLE bv_api_member;
SELECT set_config('app.actor_user_id','22222222-2222-4222-8222-222222222222',true);
INSERT INTO bv_company_applications(applicant_user_id,company_name,requested_slug) VALUES
('22222222-2222-4222-8222-222222222222','Synthetic A','onboard-qa-a'),
('22222222-2222-4222-8222-222222222222','Synthetic B','onboard-qa-b');
DO $$
DECLARE a uuid;
BEGIN
 SELECT id INTO a FROM bv_company_applications WHERE requested_slug='onboard-qa-a';
 BEGIN
   PERFORM * FROM bv_review_application(a,'APPROVED');
   RAISE EXCEPTION 'NON_FOUNDER_APPROVED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM bv_tenants WHERE slug='onboard-qa-a') THEN
  RAISE EXCEPTION 'UNAUTHORIZED_TENANT_CREATED'; END IF;
 RAISE NOTICE 'NON_FOUNDER_DECISION_DENY_PASS';
END $$;
SELECT set_config('app.actor_user_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE a uuid;b uuid;
BEGIN
 IF NOT bv_platform_manager() THEN RAISE EXCEPTION 'MANAGER_GATE_FAILED'; END IF;
 SELECT id INTO a FROM bv_company_applications WHERE requested_slug='onboard-qa-a';
 SELECT id INTO b FROM bv_company_applications WHERE requested_slug='onboard-qa-b';
 PERFORM * FROM bv_review_application(a,'APPROVED');
 PERFORM * FROM bv_review_application(b,'REJECTED');
 IF (SELECT count(*) FROM bv_tenants WHERE slug='onboard-qa-a')<>1 OR
    EXISTS(SELECT 1 FROM bv_tenants WHERE slug='onboard-qa-b') OR
    (SELECT count(*) FROM bv_memberships m JOIN bv_tenants t ON m.tenant_id=t.id WHERE t.slug='onboard-qa-a' AND m.role='owner')<>1
 THEN RAISE EXCEPTION 'ACTIVATION_STATE_FAILED';END IF;
 BEGIN
   PERFORM * FROM bv_review_application(a,'APPROVED');
   RAISE EXCEPTION 'REPLAY_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '23505' THEN NULL; END;
 IF (SELECT count(*) FROM bv_company_audit WHERE application_id IN(a,b))<>4
 THEN RAISE EXCEPTION 'AUDIT_COUNT_MISMATCH'; END IF;
 RAISE NOTICE 'FOUNDER_APPROVE_REJECT_REPLAY_AUDIT_PASS';
END $$;
SELECT set_config('app.actor_user_id','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM bv_company_applications)<>2 THEN
  RAISE EXCEPTION 'APPLICANT_APPLICATION_READ_FAILED';END IF;
 IF (SELECT count(*) FROM bv_company_audit)<>4 THEN
  RAISE EXCEPTION 'APPLICANT_AUDIT_READ_FAILED';END IF;
 RAISE NOTICE 'APPLICANT_READ_ISOLATION_PASS';
END $$;
ROLLBACK;
