-- QA ONLY RLS policy reference, security definer must be reviewed before any use.
-- These schemas deliberately NOT exposed in Supabase Data API unless separately approved.
BEGIN;
CREATE OR REPLACE FUNCTION bv_security.is_member(p_tenant uuid) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.bv_memberships m
 WHERE m.tenant_id=p_tenant AND m.user_id=(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION bv_security.is_member(uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA bv_security TO authenticated;
GRANT EXECUTE ON FUNCTION bv_security.is_member(uuid) TO authenticated;
DROP POLICY IF EXISTS tenant_profiles_member_read ON bv_config.tenant_profiles;
CREATE POLICY tenant_profiles_member_read ON bv_config.tenant_profiles FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS integration_connections_member_read ON bv_config.integration_connections;
CREATE POLICY integration_connections_member_read ON bv_config.integration_connections FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS feature_flags_member_read ON bv_config.feature_flags;
CREATE POLICY feature_flags_member_read ON bv_config.feature_flags FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS services_member_read ON bv_industry.services;
CREATE POLICY services_member_read ON bv_industry.services FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS checklists_member_read ON bv_ops.checklists;
CREATE POLICY checklists_member_read ON bv_ops.checklists FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS tenant_agents_member_read ON bv_ai.tenant_agents;
CREATE POLICY tenant_agents_member_read ON bv_ai.tenant_agents FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS agent_runs_member_read ON bv_ai.agent_runs;
CREATE POLICY agent_runs_member_read ON bv_ai.agent_runs FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS usage_daily_member_read ON bv_ai.usage_daily;
CREATE POLICY usage_daily_member_read ON bv_ai.usage_daily FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));
DROP POLICY IF EXISTS metric_daily_member_read ON bv_metrics.metric_daily;
CREATE POLICY metric_daily_member_read ON bv_metrics.metric_daily FOR SELECT TO authenticated USING (bv_security.is_member(tenant_id));

-- No INSERT / UPDATE / DELETE policies and no GRANT to clients by default.
-- Future API gateway may grant minimal SELECT to specific safe tables (not all).
COMMIT;
