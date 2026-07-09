-- TUAN OS Command Center — v0.3 schema
-- Run in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role text default 'member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Automatically create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'open',
  priority text default 'normal',
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "Tasks are viewable by authenticated users"
  on public.tasks for select
  to authenticated
  using (true);

create policy "Authenticated users can manage tasks"
  on public.tasks for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- approvals
-- ---------------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'pending',
  requested_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.approvals enable row level security;

create policy "Approvals are viewable by authenticated users"
  on public.approvals for select
  to authenticated
  using (true);

create policy "Authenticated users can manage approvals"
  on public.approvals for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- ai_agents
-- ---------------------------------------------------------------------------
create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'idle',
  model text,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_agents enable row level security;

create policy "Agents are viewable by authenticated users"
  on public.ai_agents for select
  to authenticated
  using (true);

create policy "Authenticated users can manage agents"
  on public.ai_agents for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- hospitality_properties
-- ---------------------------------------------------------------------------
create table if not exists public.hospitality_properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  status text not null default 'active',
  occupancy_rate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hospitality_properties enable row level security;

create policy "Properties are viewable by authenticated users"
  on public.hospitality_properties for select
  to authenticated
  using (true);

create policy "Authenticated users can manage properties"
  on public.hospitality_properties for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- activity_logs
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  action text not null,
  target text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

create policy "Activity logs are viewable by authenticated users"
  on public.activity_logs for select
  to authenticated
  using (true);

create policy "Authenticated users can insert activity logs"
  on public.activity_logs for insert
  to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.approvals;
create trigger set_updated_at before update on public.approvals
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.ai_agents;
create trigger set_updated_at before update on public.ai_agents
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.hospitality_properties;
create trigger set_updated_at before update on public.hospitality_properties
  for each row execute procedure public.set_updated_at();
