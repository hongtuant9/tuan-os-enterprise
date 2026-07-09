-- TUAN OS Command Center — v0.4 schema
-- Run in the Supabase SQL editor (or via `supabase db push`), then load
-- supabase/seed.sql to populate demo data.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- helpers
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

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

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

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  unit text not null default 'General',
  owner text not null default 'Unassigned',
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "Tasks are viewable by everyone" on public.tasks;
create policy "Tasks are viewable by everyone"
  on public.tasks for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage tasks" on public.tasks;
create policy "Authenticated users can manage tasks"
  on public.tasks for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- approvals
-- ---------------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  unit text not null default 'General',
  requested_by text not null default 'System',
  approved_by text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.approvals enable row level security;

drop policy if exists "Approvals are viewable by everyone" on public.approvals;
create policy "Approvals are viewable by everyone"
  on public.approvals for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage approvals" on public.approvals;
create policy "Authenticated users can manage approvals"
  on public.approvals for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.approvals;
create trigger set_updated_at before update on public.approvals
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_agents
-- ---------------------------------------------------------------------------
create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'General',
  status text not null default 'idle' check (status in ('online', 'offline', 'idle')),
  current_task text,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_agents enable row level security;

drop policy if exists "Agents are viewable by everyone" on public.ai_agents;
create policy "Agents are viewable by everyone"
  on public.ai_agents for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage agents" on public.ai_agents;
create policy "Authenticated users can manage agents"
  on public.ai_agents for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.ai_agents;
create trigger set_updated_at before update on public.ai_agents
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- hospitality_properties
-- ---------------------------------------------------------------------------
create table if not exists public.hospitality_properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'online' check (status in ('online', 'monitoring', 'offline')),
  occupancy int not null default 0 check (occupancy between 0 and 100),
  check_ins_today int not null default 0,
  check_outs_today int not null default 0,
  pending_guest_messages int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hospitality_properties enable row level security;

drop policy if exists "Properties are viewable by everyone" on public.hospitality_properties;
create policy "Properties are viewable by everyone"
  on public.hospitality_properties for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage properties" on public.hospitality_properties;
create policy "Authenticated users can manage properties"
  on public.hospitality_properties for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.hospitality_properties;
create trigger set_updated_at before update on public.hospitality_properties
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- activity_logs (append-only, no updated_at)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  unit text not null default 'General',
  message text not null,
  type text not null default 'info' check (type in ('info', 'action', 'approval', 'alert')),
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

drop policy if exists "Activity logs are viewable by everyone" on public.activity_logs;
create policy "Activity logs are viewable by everyone"
  on public.activity_logs for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can insert activity logs" on public.activity_logs;
create policy "Authenticated users can insert activity logs"
  on public.activity_logs for insert
  to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- knowledge_sources
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null default 'document' check (source_type in ('document', 'google_drive', 'url', 'note')),
  url text,
  status text not null default 'pending' check (status in ('synced', 'pending', 'error')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_sources enable row level security;

drop policy if exists "Knowledge sources are viewable by everyone" on public.knowledge_sources;
create policy "Knowledge sources are viewable by everyone"
  on public.knowledge_sources for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage knowledge sources" on public.knowledge_sources;
create policy "Authenticated users can manage knowledge sources"
  on public.knowledge_sources for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.knowledge_sources;
create trigger set_updated_at before update on public.knowledge_sources
  for each row execute procedure public.set_updated_at();
