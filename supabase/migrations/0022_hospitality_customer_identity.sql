-- Hospitality CRM customer identity foundation.
-- Keep channel identities scoped; do not expose tables to anonymous users.
create table if not exists public.hospitality_customers (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  preferred_language text,
  country_code text,
  lifecycle_status text not null default 'lead' check (lifecycle_status in ('lead','guest','past_guest','blocked','archived')),
  consent_status text not null default 'unknown' check (consent_status in ('unknown','granted','declined','withdrawn')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hospitality_customers enable row level security;
drop policy if exists "Hospitality customers viewable by authenticated users" on public.hospitality_customers;
create policy "Hospitality customers viewable by authenticated users" on public.hospitality_customers for select to authenticated using (true);
drop trigger if exists set_updated_at on public.hospitality_customers;
create trigger set_updated_at before update on public.hospitality_customers for each row execute procedure public.set_updated_at();
create index if not exists hospitality_customers_last_seen_idx on public.hospitality_customers (last_seen_at desc);

create table if not exists public.hospitality_customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.hospitality_customers(id) on delete cascade,
  identity_type text not null check (identity_type in ('phone','email','whatsapp','facebook','instagram','zalo','website','ota','other')),
  identity_value text not null,
  identity_hash text not null,
  source_channel text,
  is_primary boolean not null default false,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_type, identity_hash)
);

alter table public.hospitality_customer_identities enable row level security;
drop policy if exists "Hospitality identities viewable by authenticated users" on public.hospitality_customer_identities;
create policy "Hospitality identities viewable by authenticated users" on public.hospitality_customer_identities for select to authenticated using (true);
drop trigger if exists set_updated_at on public.hospitality_customer_identities;
create trigger set_updated_at before update on public.hospitality_customer_identities for each row execute procedure public.set_updated_at();
create index if not exists hospitality_customer_identities_customer_idx on public.hospitality_customer_identities (customer_id);

alter table public.ai_conversations add column if not exists customer_id uuid references public.hospitality_customers(id) on delete set null;
create index if not exists ai_conversations_customer_last_message_idx on public.ai_conversations (customer_id, last_message_at desc) where customer_id is not null;

alter table public.ai_booking_records add column if not exists customer_id uuid references public.hospitality_customers(id) on delete set null;
create index if not exists ai_booking_records_customer_created_idx on public.ai_booking_records (customer_id, created_at desc) where customer_id is not null;

alter table public.ai_upsell_events add column if not exists customer_id uuid references public.hospitality_customers(id) on delete set null;
create index if not exists ai_upsell_events_customer_created_idx on public.ai_upsell_events (customer_id, created_at desc) where customer_id is not null;

comment on table public.hospitality_customers is 'Canonical hospitality CRM customer profile for multi-entry journeys.';
comment on table public.hospitality_customer_identities is 'Channel/contact identities mapped to canonical hospitality customers.';
