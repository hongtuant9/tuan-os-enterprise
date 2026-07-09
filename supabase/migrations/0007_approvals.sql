-- approvals: CEO approval queue for requests raised by AI agents.

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete set null,
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
