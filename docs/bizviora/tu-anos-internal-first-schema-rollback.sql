-- Review-only rollback. Execute only after confirming no dependent objects or live data.
-- No CASCADE: fail rather than silently dropping dependent objects.
begin;
drop table if exists public.bv_knowledge_sources;
drop table if exists public.bv_property_services;
drop table if exists public.bv_tenant_profiles;
commit;
