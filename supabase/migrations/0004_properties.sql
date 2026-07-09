-- properties: hospitality units (homestays) tracked by the Hospitality AI.

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete set null,
  name text not null,
  status text not null default 'online' check (status in ('online', 'monitoring', 'offline')),
  occupancy int not null default 0 check (occupancy between 0 and 100),
  check_ins_today int not null default 0,
  check_outs_today int not null default 0,
  pending_guest_messages int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties enable row level security;

drop policy if exists "Properties are viewable by everyone" on public.properties;
create policy "Properties are viewable by everyone"
  on public.properties for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage properties" on public.properties;
create policy "Authenticated users can manage properties"
  on public.properties for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.properties;
create trigger set_updated_at before update on public.properties
  for each row execute procedure public.set_updated_at();
