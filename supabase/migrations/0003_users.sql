-- users: application profile for every auth.users row, keyed 1:1 by id.
-- Populated automatically by the on_auth_user_created trigger whenever a
-- new Supabase Auth account is created (sign-up, invite, or admin.createUser).

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  business_unit_id uuid references public.business_units (id) on delete set null,
  full_name text,
  email text,
  role text not null default 'member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "Users are viewable by authenticated users" on public.users;
create policy "Users are viewable by authenticated users"
  on public.users for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own row" on public.users;
create policy "Users can update their own row"
  on public.users for update
  to authenticated
  using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists set_updated_at on public.users;
create trigger set_updated_at before update on public.users
  for each row execute procedure public.set_updated_at();
