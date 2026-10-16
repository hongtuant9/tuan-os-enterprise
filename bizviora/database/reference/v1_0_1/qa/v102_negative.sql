\set ON_ERROR_STOP on
INSERT INTO public.bv_tenants(id,slug,name) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','qa-v102-a','A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','qa-v102-b','B');
INSERT INTO auth.users(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.bv_memberships(tenant_id,user_id,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');
INSERT INTO public.bv_business_units(id,tenant_id,name) VALUES('a1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','BU1'),('a2222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','BU2');
INSERT INTO public.bv_properties(id,tenant_id,business_unit_id,name) VALUES('a3333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a2222222-2222-4222-8222-222222222222','Property under BU2');
DO $$ BEGIN
 BEGIN
  INSERT INTO bv_industry.services(tenant_id,business_unit_id,property_id,service_type,name,data_origin) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333','LODGING','WRONG_UNIT','synthetic');
  RAISE EXCEPTION 'CROSS_BU_PROPERTY_NOT_BLOCKED';
 EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PROPERTY_UNIT_CROSS_REFERENCE_DENIED_PASS'; END;
 BEGIN
  INSERT INTO bv_industry.services(tenant_id,property_id,service_type,name,data_origin) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a3333333-3333-4333-8333-333333333333','LODGING','MISSING_UNIT','synthetic');
  RAISE EXCEPTION 'NULL_UNIT_NOT_BLOCKED';
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PROPERTY_REQUIRES_UNIT_PASS'; END;
END $$;
INSERT INTO bv_industry.services(tenant_id,business_unit_id,property_id,service_type,name,data_origin) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a2222222-2222-4222-8222-222222222222','a3333333-3333-4333-8333-333333333333','LODGING','VALID_REFERENCE','synthetic');
INSERT INTO bv_ai.agent_templates(code,title,purpose,status) VALUES('QA_TEMPLATE','QA','QA','DRAFT');
INSERT INTO bv_ai.template_versions(template_id,version_tag) SELECT id,'0.1' FROM bv_ai.agent_templates WHERE code='QA_TEMPLATE';
INSERT INTO bv_ai.tenant_agents(id,tenant_id,template_version_id,display_name,data_origin) SELECT 'a4444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id,'Agent A','synthetic' FROM bv_ai.template_versions;
INSERT INTO bv_ai.tool_catalog(code,title,risk_class) VALUES('QA_READ','QA_READ','READ_ONLY');
DO $$ BEGIN
 BEGIN
  INSERT INTO bv_ai.agent_tool_grants(tenant_id,agent_id,tool_code,approved_by,data_origin) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a4444444-4444-4444-8444-444444444444','QA_READ','22222222-2222-4222-8222-222222222222','synthetic');
  RAISE EXCEPTION 'FOREIGN_APPROVER_NOT_BLOCKED';
 EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'FOREIGN_TOOL_APPROVER_DENIED_PASS'; END;
 BEGIN
  INSERT INTO bv_ai.agent_runs(tenant_id,agent_id,requested_by,data_origin) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a4444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','synthetic');
  RAISE EXCEPTION 'FOREIGN_REQUESTER_NOT_BLOCKED';
 EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'FOREIGN_AGENT_REQUESTER_DENIED_PASS'; END;
 BEGIN
  INSERT INTO bv_private.owner_finance_envelopes(tenant_id,owner_user_id,ciphertext,key_alias,record_category,data_origin) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',decode('ABCD','hex'),'TEST_ONLY','QA','synthetic');
  RAISE EXCEPTION 'FOREIGN_OWNER_NOT_BLOCKED';
 EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'FOREIGN_PRIVATE_OWNER_DENIED_PASS'; END;
END $$;
