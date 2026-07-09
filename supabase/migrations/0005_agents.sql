-- agents: the AI workers running each business unit (status, current task).

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete set null,
  name text not null,
  unit text not null default 'General',
  status text not null default 'idle' check (status in ('online', 'offline', 'idle')),
  current_task text,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agents enable row level security;

drop policy if exists "Agents are viewable by everyone" on public.agents;
create policy "Agents are viewable by everyone"
  on public.agents for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage agents" on public.agents;
create policy "Authenticated users can manage agents"
  on public.agents for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.agents;
create trigger set_updated_at before update on public.agents
  for each row execute procedure public.set_updated_at();
