-- FND-020 security hardening: minimal, reversible permission/search_path fixes.
-- The four cozy_* tables with RLS enabled and no policies are intentionally
-- left fail-closed; no client-access policy is added here.

alter function public.set_updated_at()
  set search_path = pg_catalog;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

grant execute on function public.handle_new_user() to supabase_auth_admin;
