-- business_units: the catalog of AI-run business units (Hospitality, Marketing,
-- Finance, iSTEAM, Knowledge Center, CEO Overview). Every other domain table
-- links back to one via business_unit_id.

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_units enable row level security;

drop policy if exists "Business units are viewable by everyone" on public.business_units;
create policy "Business units are viewable by everyone"
  on public.business_units for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage business units" on public.business_units;
create policy "Authenticated users can manage business units"
  on public.business_units for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.business_units;
create trigger set_updated_at before update on public.business_units
  for each row execute procedure public.set_updated_at();
