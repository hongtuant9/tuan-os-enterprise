-- activity_logs: append-only feed of everything the AI agents do.

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete set null,
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
