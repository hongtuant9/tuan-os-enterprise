-- REFERENCE DDL V1 / QA ONLY / DO NOT APPLY TO STAGING OR PRODUCTION
-- Requires existing verified public.bv_tenants/bv_memberships/bv_business_units/bv_properties.
-- Requires Supabase auth schema, pgcrypto gen_random_uuid, authenticated/anon roles.
-- This is additive, not a migration approval. Explicitly qualify every object.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.bv_tenants') IS NULL OR
    to_regclass('public.bv_memberships') IS NULL OR
    to_regclass('public.bv_business_units') IS NULL OR
    to_regclass('public.bv_properties') IS NULL
 THEN RAISE EXCEPTION 'CORE_BASELINE_MISSING'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS bv_config;
CREATE SCHEMA IF NOT EXISTS bv_crm;
CREATE SCHEMA IF NOT EXISTS bv_industry;
CREATE SCHEMA IF NOT EXISTS bv_ops;
CREATE SCHEMA IF NOT EXISTS bv_people;
CREATE SCHEMA IF NOT EXISTS bv_fin;
CREATE SCHEMA IF NOT EXISTS bv_mkt;
CREATE SCHEMA IF NOT EXISTS bv_ai;
CREATE SCHEMA IF NOT EXISTS bv_metrics;
CREATE SCHEMA IF NOT EXISTS bv_audit;
CREATE SCHEMA IF NOT EXISTS bv_security;
CREATE SCHEMA IF NOT EXISTS bv_private;
REVOKE ALL ON SCHEMA bv_config,bv_crm,bv_industry,bv_ops,bv_people,bv_fin,bv_mkt,bv_ai,bv_metrics,bv_audit,bv_security,bv_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS bv_config.tenant_profiles (
 tenant_id uuid PRIMARY KEY REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
 display_name text, locale text NOT NULL DEFAULT 'vi-VN', time_zone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
 contact_email text, contact_phone text, website_url text,
 verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED')),
 settings_version bigint NOT NULL DEFAULT 1 CHECK (settings_version>=1),
 data_origin text NOT NULL DEFAULT 'real' CHECK(data_origin IN ('real','synthetic')),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bv_config.feature_flags (
 tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id), flag_key text NOT NULL,
 enabled boolean NOT NULL DEFAULT false, approved_at timestamptz,
 PRIMARY KEY (tenant_id,flag_key),
 CHECK (flag_key IN ('AUTO_SEND','BOOKING_WRITE','ADS_SPEND','AGENT_TOOLS'))
);

CREATE TABLE IF NOT EXISTS bv_config.connector_catalog (
 code text PRIMARY KEY, title text NOT NULL, capability text NOT NULL,
 is_approved boolean NOT NULL DEFAULT false, published_version text NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS bv_config.integration_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  connector_code text NOT NULL REFERENCES bv_config.connector_catalog(code),
  status text NOT NULL DEFAULT 'NOT_CONFIGURED' CHECK(status IN ('NOT_CONFIGURED','PENDING','VERIFIED','DISABLED','ERROR')),
  credential_alias text,
  last_verified_at timestamptz,
  UNIQUE(tenant_id,connector_code),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_config_integration_connections_tenant_created_idx ON bv_config.integration_connections(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_crm.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  display_label text NOT NULL,
  customer_code text,
  pii_ciphertext bytea,
  source_channel text,
  UNIQUE (tenant_id,customer_code),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_crm_customers_tenant_created_idx ON bv_crm.customers(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_crm.consent_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  purpose text NOT NULL,
  consent_status text NOT NULL CHECK(consent_status IN ('GRANTED','REVOKED','UNKNOWN')),
  evidence_ref text,
  FOREIGN KEY (tenant_id,customer_id) REFERENCES bv_crm.customers(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_crm_consent_events_tenant_created_idx ON bv_crm.consent_events(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_crm.interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  channel text NOT NULL,
  summary_redacted text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES bv_crm.customers(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_crm_interactions_tenant_created_idx ON bv_crm.interactions(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_industry.services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  business_unit_id uuid,
  property_id uuid,
  service_type text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  FOREIGN KEY (tenant_id,business_unit_id) REFERENCES public.bv_business_units(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,property_id) REFERENCES public.bv_properties(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_industry_services_tenant_created_idx ON bv_industry.services(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_industry.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_code text NOT NULL,
  room_type text,
  status text NOT NULL DEFAULT 'INACTIVE',
  UNIQUE(tenant_id,property_id,room_code),
  UNIQUE(tenant_id,property_id,id),
  FOREIGN KEY (tenant_id,property_id) REFERENCES public.bv_properties(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_industry_rooms_tenant_created_idx ON bv_industry.rooms(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_industry.reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_id uuid,
  customer_id uuid,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  external_ref text,
  CHECK(ends_on > starts_on),
  FOREIGN KEY (tenant_id,property_id) REFERENCES public.bv_properties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,property_id,room_id) REFERENCES bv_industry.rooms(tenant_id,property_id,id),
  FOREIGN KEY (tenant_id,room_id) REFERENCES bv_industry.rooms(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,customer_id) REFERENCES bv_crm.customers(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_industry_reservations_tenant_created_idx ON bv_industry.reservations(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_industry.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  property_id uuid,
  customer_id uuid,
  status text NOT NULL DEFAULT 'DRAFT',
  currency text NOT NULL DEFAULT 'VND',
  total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor>=0),
  FOREIGN KEY (tenant_id,property_id) REFERENCES public.bv_properties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,customer_id) REFERENCES bv_crm.customers(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_industry_orders_tenant_created_idx ON bv_industry.orders(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_industry.order_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL,
  service_id uuid,
  qty numeric(12,3) NOT NULL CHECK(qty>0),
  unit_amount_minor bigint NOT NULL CHECK(unit_amount_minor>=0),
  FOREIGN KEY (tenant_id,order_id) REFERENCES bv_industry.orders(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,service_id) REFERENCES bv_industry.services(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_industry_order_lines_tenant_created_idx ON bv_industry.order_lines(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ops.checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  property_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  FOREIGN KEY (tenant_id,property_id) REFERENCES public.bv_properties(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ops_checklists_tenant_created_idx ON bv_ops.checklists(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ops.incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  property_id uuid,
  summary text NOT NULL,
  severity text NOT NULL DEFAULT 'LOW',
  status text NOT NULL DEFAULT 'OPEN',
  FOREIGN KEY (tenant_id,property_id) REFERENCES public.bv_properties(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ops_incidents_tenant_created_idx ON bv_ops.incidents(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_people.staff_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  display_name text,
  staff_code text,
  UNIQUE(tenant_id,user_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES public.bv_memberships(tenant_id,user_id),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_people_staff_profiles_tenant_created_idx ON bv_people.staff_profiles(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_people.shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL,
  property_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  CHECK(ends_at>starts_at),
  FOREIGN KEY (tenant_id,staff_id) REFERENCES bv_people.staff_profiles(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,property_id) REFERENCES public.bv_properties(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_people_shifts_tenant_created_idx ON bv_people.shifts(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_fin.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  code text NOT NULL,
  label text NOT NULL,
  account_type text NOT NULL CHECK(account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  currency text NOT NULL DEFAULT 'VND',
  UNIQUE(tenant_id,code),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_fin_accounts_tenant_created_idx ON bv_fin.accounts(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_fin.journals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  posted_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','VOID')),
  memo text,
  source_ref text,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_fin_journals_tenant_created_idx ON bv_fin.journals(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_fin.journal_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  journal_id uuid NOT NULL,
  account_id uuid NOT NULL,
  side text NOT NULL CHECK(side IN ('DR','CR')),
  amount_minor bigint NOT NULL CHECK(amount_minor>0),
  currency text NOT NULL DEFAULT 'VND',
  FOREIGN KEY (tenant_id,journal_id) REFERENCES bv_fin.journals(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,account_id) REFERENCES bv_fin.accounts(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_fin_journal_lines_tenant_created_idx ON bv_fin.journal_lines(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_mkt.campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  budget_minor bigint CHECK(budget_minor>=0),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_mkt_campaigns_tenant_created_idx ON bv_mkt.campaigns(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_mkt.campaign_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  attribution_model text,
  FOREIGN KEY (tenant_id,campaign_id) REFERENCES bv_mkt.campaigns(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_mkt_campaign_events_tenant_created_idx ON bv_mkt.campaign_events(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.agent_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 title text NOT NULL, purpose text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','RETIRED')),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bv_ai.template_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES bv_ai.agent_templates(id),
 version_tag text NOT NULL, contract_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 reviewed_at timestamptz, approval_state text NOT NULL DEFAULT 'DRAFT' CHECK(approval_state IN ('DRAFT','APPROVED','RETIRED')),
 UNIQUE(template_id,version_tag)
);

CREATE TABLE IF NOT EXISTS bv_ai.tool_catalog (
 code text PRIMARY KEY, title text NOT NULL,
 risk_class text NOT NULL CHECK(risk_class IN ('READ_ONLY','INTERNAL_WRITE','EXTERNAL_WRITE','FINANCIAL')),
 default_allowed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS bv_ai.tenant_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES bv_ai.template_versions(id),
  display_name text NOT NULL,
  business_unit_id uuid,
  property_id uuid,
  status text NOT NULL DEFAULT 'DISABLED' CHECK(status IN ('DISABLED','DRAFT','PENDING_APPROVAL','ACTIVE','SUSPENDED')),
  config_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(property_id IS NULL OR business_unit_id IS NOT NULL),
  FOREIGN KEY (tenant_id,business_unit_id) REFERENCES public.bv_business_units(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,business_unit_id,property_id) REFERENCES public.bv_properties(tenant_id,business_unit_id,id),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_tenant_agents_tenant_created_idx ON bv_ai.tenant_agents(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.agent_tool_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL,
  tool_code text NOT NULL REFERENCES bv_ai.tool_catalog(code),
  grant_state text NOT NULL DEFAULT 'DENIED' CHECK(grant_state IN ('DENIED','PENDING','APPROVED','REVOKED')),
  approved_by uuid REFERENCES auth.users(id),
  UNIQUE(tenant_id,agent_id,tool_code),
  FOREIGN KEY (tenant_id,agent_id) REFERENCES bv_ai.tenant_agents(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_agent_tool_grants_tenant_created_idx ON bv_ai.agent_tool_grants(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.knowledge_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  agent_id uuid,
  document_title text NOT NULL,
  storage_key text,
  approval_state text NOT NULL DEFAULT 'DRAFT' CHECK(approval_state IN ('DRAFT','APPROVED','REJECTED','REVOKED')),
  content_version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (tenant_id,agent_id) REFERENCES bv_ai.tenant_agents(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_knowledge_sources_tenant_created_idx ON bv_ai.knowledge_sources(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.knowledge_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL,
  chunk_index integer NOT NULL CHECK(chunk_index>=0),
  content_redacted text NOT NULL,
  embedding_ref text,
  UNIQUE(tenant_id,source_id,chunk_index),
  FOREIGN KEY (tenant_id,source_id) REFERENCES bv_ai.knowledge_sources(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_knowledge_chunks_tenant_created_idx ON bv_ai.knowledge_chunks(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.agent_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL,
  ciphertext bytea NOT NULL,
  key_alias text NOT NULL,
  expires_at timestamptz,
  FOREIGN KEY (tenant_id,agent_id) REFERENCES bv_ai.tenant_agents(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_agent_memory_tenant_created_idx ON bv_ai.agent_memory(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.agent_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL,
  requested_by uuid REFERENCES auth.users(id),
  state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','RUNNING','WAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED')),
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE(tenant_id,id,agent_id),
  FOREIGN KEY (tenant_id,agent_id) REFERENCES bv_ai.tenant_agents(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_agent_runs_tenant_created_idx ON bv_ai.agent_runs(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.run_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  step_index integer NOT NULL,
  summary_redacted text,
  state text NOT NULL DEFAULT 'PENDING',
  UNIQUE(tenant_id,run_id,step_index),
  FOREIGN KEY (tenant_id,run_id) REFERENCES bv_ai.agent_runs(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_run_steps_tenant_created_idx ON bv_ai.run_steps(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.tool_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  tool_code text NOT NULL REFERENCES bv_ai.tool_catalog(code),
  state text NOT NULL DEFAULT 'DENIED',
  idempotency_key text NOT NULL,
  result_redacted text,
  UNIQUE(tenant_id,idempotency_key),
  UNIQUE(tenant_id,run_id,id),
  FOREIGN KEY (tenant_id,run_id,agent_id) REFERENCES bv_ai.agent_runs(tenant_id,id,agent_id),
  FOREIGN KEY (tenant_id,run_id) REFERENCES bv_ai.agent_runs(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,agent_id) REFERENCES bv_ai.tenant_agents(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_tool_executions_tenant_created_idx ON bv_ai.tool_executions(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.agent_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  tool_execution_id uuid,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  FOREIGN KEY (tenant_id,run_id) REFERENCES bv_ai.agent_runs(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,run_id,tool_execution_id) REFERENCES bv_ai.tool_executions(tenant_id,run_id,id),
  FOREIGN KEY (tenant_id,tool_execution_id) REFERENCES bv_ai.tool_executions(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_agent_approvals_tenant_created_idx ON bv_ai.agent_approvals(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_ai.usage_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL,
  usage_date date NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  UNIQUE(tenant_id,agent_id,usage_date,data_origin),
  FOREIGN KEY (tenant_id,agent_id) REFERENCES bv_ai.tenant_agents(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_ai_usage_daily_tenant_created_idx ON bv_ai.usage_daily(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_metrics.metric_definitions (
 code text PRIMARY KEY, label text NOT NULL, version_tag text NOT NULL,
 unit text NOT NULL, real_only boolean NOT NULL DEFAULT true, logic_note text NOT NULL
);

CREATE TABLE IF NOT EXISTS bv_metrics.metric_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  metric_code text NOT NULL REFERENCES bv_metrics.metric_definitions(code),
  metric_date date NOT NULL,
  value_numeric numeric(20,4) NOT NULL,
  unit text NOT NULL,
  UNIQUE(tenant_id,metric_code,metric_date,data_origin),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_metrics_metric_daily_tenant_created_idx ON bv_metrics.metric_daily(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_audit.tenant_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id),
  agent_id uuid,
  event_type text NOT NULL,
  trace_id uuid,
  payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (tenant_id,agent_id) REFERENCES bv_ai.tenant_agents(tenant_id,id) ON DELETE RESTRICT,
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_audit_tenant_events_tenant_created_idx ON bv_audit.tenant_events(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bv_private.owner_finance_envelopes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.bv_tenants(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  ciphertext bytea NOT NULL,
  key_alias text NOT NULL,
  record_category text NOT NULL,
  UNIQUE (tenant_id,owner_user_id,id),
  data_origin text NOT NULL DEFAULT 'real' CHECK (data_origin IN ('real','synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_bv_private_owner_finance_envelopes_tenant_created_idx ON bv_private.owner_finance_envelopes(tenant_id,created_at DESC);

-- ALL TENANT TABLES: RLS enabled AND forced. No automatic authenticated grant to private schemas.
ALTER TABLE bv_config.tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_config.tenant_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_config.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_config.feature_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_config.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_config.integration_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_crm.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_crm.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_crm.consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_crm.consent_events FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_crm.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_crm.interactions FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.services FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_industry.order_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ops.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ops.checklists FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ops.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ops.incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_people.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_people.staff_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_people.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_people.shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_fin.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_fin.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_fin.journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_fin.journals FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_fin.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_fin.journal_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_mkt.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_mkt.campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_mkt.campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_mkt.campaign_events FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.tenant_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.tenant_agents FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_tool_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_tool_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.knowledge_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.knowledge_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_memory FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.run_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.tool_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.agent_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_ai.usage_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_metrics.metric_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_metrics.metric_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_audit.tenant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_audit.tenant_events FORCE ROW LEVEL SECURITY;
ALTER TABLE bv_private.owner_finance_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bv_private.owner_finance_envelopes FORCE ROW LEVEL SECURITY;

-- Default deny: no direct read/write privileges issued for tenant data in this DDL.
-- Do not expose these schemas in Supabase Data API; expose audited API facade only after release gates.
REVOKE ALL ON ALL TABLES IN SCHEMA bv_config,bv_crm,bv_industry,bv_ops,bv_people,bv_fin,bv_mkt,bv_ai,bv_metrics,bv_audit,bv_private FROM PUBLIC,anon,authenticated;
COMMIT;
