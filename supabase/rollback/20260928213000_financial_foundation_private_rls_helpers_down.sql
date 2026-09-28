-- DOWN: restore pre-hardening public SECURITY DEFINER helpers.

create or replace function public.is_personal_finance_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role = 'owner'
  );
$$;

create or replace function public.can_manage_financial_drafts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role in ('owner','admin')
  );
$$;

grant execute on function public.is_personal_finance_owner() to authenticated, service_role;
grant execute on function public.can_manage_financial_drafts() to authenticated, service_role;

drop function if exists private.is_personal_finance_owner_internal();
drop function if exists private.can_manage_financial_drafts_internal();
