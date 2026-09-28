-- TUAN OS Financial Foundation security hardening
-- Move privileged role lookup into non-exposed private schema while preserving public RLS helper API.

create schema if not exists private;

create or replace function private.is_personal_finance_owner_internal()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'owner'
  );
$$;

create or replace function private.can_manage_financial_drafts_internal()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('owner','admin')
  );
$$;

revoke all on function private.is_personal_finance_owner_internal() from public, anon;
revoke all on function private.can_manage_financial_drafts_internal() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_personal_finance_owner_internal() to authenticated, service_role;
grant execute on function private.can_manage_financial_drafts_internal() to authenticated, service_role;

create or replace function public.is_personal_finance_owner()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.is_personal_finance_owner_internal();
$$;

create or replace function public.can_manage_financial_drafts()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.can_manage_financial_drafts_internal();
$$;

revoke all on function public.is_personal_finance_owner() from public, anon;
revoke all on function public.can_manage_financial_drafts() from public, anon;
grant execute on function public.is_personal_finance_owner() to authenticated, service_role;
grant execute on function public.can_manage_financial_drafts() to authenticated, service_role;
