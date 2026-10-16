-- TUAN OS Internal-First: additive draft only. DO NOT apply to shared staging until isolated tests and scoped approval.
-- Existing Core tables are untouched. No anon/authenticated grants or policies are added.
begin;
create table if not exists public.bv_tenant_profiles (
  tenant_id uuid primary key references public.bv_tenants(id) on delete cascade,
  legal_name text,
  business_registration_no text,
  tax_code text,
  contact_email text,
  contact_phone text,
  address_text text,
  source_reference text,
  verification_status text not null default 'NOT_VERIFIED'
    check (verification_status in ('NOT_VERIFIED','VERIFIED','NEEDS_REVIEW')),
  updated_at timestamptz not null default now()
);
create table if not exists public.bv_property_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bv_tenants(id) on delete cascade,
  property_id uuid not null,
  constraint bv_property_services_tenant_property_fk foreign key (tenant_id, property_id)
    references public.bv_properties(tenant_id, id) on delete cascade,
  service_name text not null,
  status text not null default 'NOT_VERIFIED'
    check (status in ('NOT_VERIFIED','ACTIVE','INACTIVE')),
  source_reference text,
  created_at timestamptz not null default now(),
  unique (tenant_id,property_id,service_name)
);
create table if not exists public.bv_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bv_tenants(id) on delete cascade,
  source_type text not null,
  display_name text not null,
  source_reference text,
  sync_status text not null default 'NOT_CONFIGURED'
    check (sync_status in ('NOT_CONFIGURED','PENDING','ACTIVE','ERROR','DISABLED')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bv_property_services_tenant_idx on public.bv_property_services(tenant_id,property_id);
create index if not exists bv_knowledge_sources_tenant_idx on public.bv_knowledge_sources(tenant_id);
alter table public.bv_tenant_profiles enable row level security;
alter table public.bv_property_services enable row level security;
alter table public.bv_knowledge_sources enable row level security;
-- Fail closed: no policies, no browser grants. Authenticated read API requires a separately reviewed server-side authorization boundary.
revoke all on public.bv_tenant_profiles, public.bv_property_services, public.bv_knowledge_sources from anon, authenticated;
commit;
