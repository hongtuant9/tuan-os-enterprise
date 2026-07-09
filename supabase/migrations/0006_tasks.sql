-- tasks: work items tracked across every business unit's Task Center.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete set null,
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
