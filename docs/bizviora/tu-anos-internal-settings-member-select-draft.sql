-- Run AFTER the base schema draft; isolated QA only until authorized staging review.
-- Authenticated SELECT requires verified auth.uid() membership; no write grants.
begin;
grant select on public.bv_tenant_profiles, public.bv_property_services, public.bv_knowledge_sources to authenticated;
create policy bv_tenant_profiles_member_read on public.bv_tenant_profiles
for select to authenticated
using (exists (select 1 from public.bv_memberships m where m.tenant_id = bv_tenant_profiles.tenant_id and m.user_id = (select auth.uid())));
create policy bv_property_services_member_read on public.bv_property_services
for select to authenticated
using (exists (select 1 from public.bv_memberships m where m.tenant_id = bv_property_services.tenant_id and m.user_id = (select auth.uid())));
create policy bv_knowledge_sources_member_read on public.bv_knowledge_sources
for select to authenticated
using (exists (select 1 from public.bv_memberships m where m.tenant_id = bv_knowledge_sources.tenant_id and m.user_id = (select auth.uid())));
commit;
