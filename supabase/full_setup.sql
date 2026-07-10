-- =============================================================================
-- TUAN OS Command Center — full Supabase setup (v1 + sync framework)
-- Paste this entire file into the Supabase SQL Editor and run it once.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT).
--
-- Contents:
--   1. Migrations 0001-0010 (extensions, business_units, users, properties,
--      agents, tasks, approvals, activity_logs, sync framework, Google OAuth
--      credential storage)
--   2. Seed data for business_units, properties, agents, tasks, approvals,
--      activity_logs, sync_sources
--   3. Demo admin account (admin@tuanos.vn / 12345678)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- migrations/0001_extensions_and_helpers.sql
-- -----------------------------------------------------------------------------
-- TUAN OS Command Center — v1 schema
-- Extensions and shared helper functions used by every table below.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- migrations/0002_business_units.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- migrations/0003_users.sql
-- -----------------------------------------------------------------------------
-- users: application profile for every auth.users row, keyed 1:1 by id.
-- Populated automatically by the on_auth_user_created trigger whenever a
-- new Supabase Auth account is created (sign-up, invite, or admin.createUser).

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  business_unit_id uuid references public.business_units (id) on delete set null,
  full_name text,
  email text,
  role text not null default 'member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "Users are viewable by authenticated users" on public.users;
create policy "Users are viewable by authenticated users"
  on public.users for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own row" on public.users;
create policy "Users can update their own row"
  on public.users for update
  to authenticated
  using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists set_updated_at on public.users;
create trigger set_updated_at before update on public.users
  for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- migrations/0004_properties.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- migrations/0005_agents.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- migrations/0006_tasks.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- migrations/0007_approvals.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- migrations/0008_activity_logs.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- migrations/0009_sync_framework.sql
-- -----------------------------------------------------------------------------
-- Google Drive/Sheets <-> Supabase synchronization framework.
-- Google Sheets remains the source of truth; Supabase is the operational
-- database these sources sync into. Google OAuth/Sheets API access is not
-- wired up yet (see src/server/sync/adapters/google-sheets.adapter.ts) —
-- this schema supports building and exercising the rest of the framework
-- (runs, logs, status, incremental cursors, scheduling, triggers) today.

-- ---------------------------------------------------------------------------
-- sync_sources: one row per Google Sheet/tab we import from.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  business_unit_id uuid references public.business_units (id) on delete set null,
  sheet_id text,
  sheet_range text,
  supports_incremental boolean not null default true,
  schedule_enabled boolean not null default false,
  schedule_interval_minutes int,
  status text not null default 'idle' check (status in ('idle', 'running', 'error')),
  last_synced_at timestamptz,
  last_cursor text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sync_sources enable row level security;

drop policy if exists "Sync sources are viewable by everyone" on public.sync_sources;
create policy "Sync sources are viewable by everyone"
  on public.sync_sources for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage sync sources" on public.sync_sources;
create policy "Authenticated users can manage sync sources"
  on public.sync_sources for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.sync_sources;
create trigger set_updated_at before update on public.sync_sources
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sync_runs: one row per sync attempt (manual, scheduled, or n8n-triggered).
-- ---------------------------------------------------------------------------
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sync_sources (id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'scheduled', 'n8n')),
  status text not null default 'running' check (status in ('running', 'success', 'failed', 'partial')),
  triggered_by text,
  records_seen int not null default 0,
  records_created int not null default 0,
  records_updated int not null default 0,
  records_skipped int not null default 0,
  records_failed int not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.sync_runs enable row level security;

drop policy if exists "Sync runs are viewable by everyone" on public.sync_runs;
create policy "Sync runs are viewable by everyone"
  on public.sync_runs for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage sync runs" on public.sync_runs;
create policy "Authenticated users can manage sync runs"
  on public.sync_runs for all
  to authenticated
  using (true)
  with check (true);

create index if not exists sync_runs_source_id_started_at_idx
  on public.sync_runs (source_id, started_at desc);

-- ---------------------------------------------------------------------------
-- import_logs: per-row detail for a sync run (append-only).
-- ---------------------------------------------------------------------------
create table if not exists public.import_logs (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.sync_runs (id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

alter table public.import_logs enable row level security;

drop policy if exists "Import logs are viewable by everyone" on public.import_logs;
create policy "Import logs are viewable by everyone"
  on public.import_logs for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can insert import logs" on public.import_logs;
create policy "Authenticated users can insert import logs"
  on public.import_logs for insert
  to authenticated
  with check (true);

create index if not exists import_logs_sync_run_id_idx on public.import_logs (sync_run_id);

-- ---------------------------------------------------------------------------
-- sync_records: idempotency ledger mapping an external sheet row to the
-- internal record it produced. For sources with a typed target table
-- (tasks, approvals) target_table/target_id point at that row. For sources
-- with no dedicated table yet (fin-001, business portfolio, family, health)
-- `data` IS the operational record until a typed table is warranted.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_records (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  external_id text not null,
  target_table text,
  target_id uuid,
  data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, external_id)
);

alter table public.sync_records enable row level security;

drop policy if exists "Sync records are viewable by everyone" on public.sync_records;
create policy "Sync records are viewable by everyone"
  on public.sync_records for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can manage sync records" on public.sync_records;
create policy "Authenticated users can manage sync records"
  on public.sync_records for all
  to authenticated
  using (true)
  with check (true);

drop trigger if exists set_updated_at on public.sync_records;
create trigger set_updated_at before update on public.sync_records
  for each row execute procedure public.set_updated_at();

create index if not exists sync_records_source_key_idx on public.sync_records (source_key);

-- -----------------------------------------------------------------------------
-- migrations/0010_google_oauth_credentials.sql
-- -----------------------------------------------------------------------------
-- Stores the connected Google account's OAuth tokens for the sync
-- framework's Drive/Sheets/Docs adapter (src/server/integrations/google/).
--
-- refresh_token is a long-lived credential — this table intentionally has
-- RLS enabled with ZERO policies, so neither `anon` nor `authenticated`
-- can select/insert/update/delete it via PostgREST under any circumstance.
-- Only the service-role client (which bypasses RLS) can touch it, and only
-- src/server/integrations/google/token-store.ts and the OAuth callback
-- route ever construct that client for this table.

create table if not exists public.google_oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  label text not null unique default 'default',
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  connected_by text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_credentials enable row level security;

drop trigger if exists set_updated_at on public.google_oauth_credentials;
create trigger set_updated_at before update on public.google_oauth_credentials
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- seed.sql — sample data
-- =============================================================================

-- TUAN OS Command Center — v1 seed data
-- Run after every file in supabase/migrations/. Safe to re-run (fixed ids,
-- on conflict do nothing). Demo auth users are created separately via
-- `npm run seed:users` (raw SQL cannot safely create auth.users rows).

-- ---------------------------------------------------------------------------
-- business_units (6)
-- ---------------------------------------------------------------------------
insert into public.business_units
  (id, name, slug, description)
values
  ('00000000-0000-4000-8000-000000000001', 'CEO Overview', 'ceo-overview', 'Company-wide performance at a glance'),
  ('00000000-0000-4000-8000-000000000002', 'Hospitality AI', 'hospitality-ai', 'Guest messaging & reception automation'),
  ('00000000-0000-4000-8000-000000000003', 'Marketing AI', 'marketing-ai', 'Campaigns, content & channel performance'),
  ('00000000-0000-4000-8000-000000000004', 'Finance AI', 'finance-ai', 'Revenue, expenses & forecasting'),
  ('00000000-0000-4000-8000-000000000005', 'iSTEAM AI', 'isteam-ai', 'Education programs & learning ops'),
  ('00000000-0000-4000-8000-000000000006', 'Knowledge Center', 'knowledge-center', 'Shared documents & retrieval-augmented context')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- properties (3)
-- ---------------------------------------------------------------------------
insert into public.properties
  (id, business_unit_id, name, status, occupancy, check_ins_today, check_outs_today, pending_guest_messages)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Lavender Homestay', 'online', 92, 2, 1, 3),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Ruby Homestay', 'monitoring', 78, 1, 0, 1),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Cozy Garden', 'online', 100, 0, 2, 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- agents (6)
-- ---------------------------------------------------------------------------
insert into public.agents
  (id, business_unit_id, name, unit, status, current_task, last_active_at)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'CEO Chief of Staff', 'CEO Overview', 'online', 'Compiling daily priority brief', now() - interval '1 minute'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Hospitality AI', 'Hospitality AI', 'online', 'Replying to guest messages', now()),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'Marketing AI', 'Marketing AI', 'online', 'Scheduling social content', now() - interval '2 minutes'),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'Finance AI', 'Finance AI', 'online', 'Reconciling OTA payouts', now() - interval '5 minutes'),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005', 'iSTEAM AI', 'iSTEAM AI', 'idle', 'Waiting on enrollment copy approval', now() - interval '24 minutes'),
  ('20000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000006', 'Knowledge AI', 'Knowledge Center', 'offline', 'Google Drive sync (v1)', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tasks (5)
-- ---------------------------------------------------------------------------
insert into public.tasks
  (id, business_unit_id, title, unit, owner, status, priority, due_date)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'Approve July marketing budget reallocation', 'Finance AI', 'Finance AI', 'in-progress', 'high', current_date),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Review guest complaint escalation at Ruby Homestay', 'Hospitality AI', 'Hospitality AI', 'todo', 'high', current_date),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005', 'Finalize iSTEAM summer program enrollment copy', 'iSTEAM AI', 'iSTEAM AI', 'in-progress', 'medium', current_date + 1),
  ('30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Publish Instagram carousel for Cozy Garden', 'Marketing AI', 'Marketing AI', 'todo', 'medium', current_date),
  ('30000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 'Reconcile OTA payouts for June', 'Finance AI', 'Finance AI', 'blocked', 'high', current_date - 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- approvals (5)
-- ---------------------------------------------------------------------------
insert into public.approvals
  (id, business_unit_id, title, summary, unit, requested_by, status, created_at)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Discount 15% for Lavender Homestay long-stay guest', 'Guest booking 14 nights, requesting loyalty discount before confirming payment.', 'Hospitality AI', 'Hospitality AI', 'pending', now() - interval '50 minutes'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'July marketing spend increase (+8,000,000 VND)', 'Boost ad budget for Cozy Garden listing after strong CTR this week.', 'Marketing AI', 'Marketing AI', 'pending', now() - interval '1 hour 20 minutes'),
  ('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', 'Refund request — Ruby Homestay booking #2291', 'Guest cancelled due to weather; refund policy allows 70% refund.', 'Finance AI', 'Finance AI', 'pending', now() - interval '18 hours'),
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', 'New iSTEAM partner school onboarding', 'Add Greenfield International School as a new enrollment partner.', 'iSTEAM AI', 'iSTEAM AI', 'approved', now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 'Vendor invoice — cleaning supplies', 'Monthly recurring invoice from Sach Xanh Supplies for all three properties.', 'Finance AI', 'Finance AI', 'rejected', now() - interval '2 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- activity_logs (10)
-- ---------------------------------------------------------------------------
insert into public.activity_logs
  (id, business_unit_id, agent, unit, message, type, created_at)
values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Hospitality AI', 'Hospitality AI', 'Answered guest inquiry about late check-out at Lavender Homestay.', 'action', now() - interval '10 minutes'),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'Marketing AI', 'Marketing AI', 'Drafted Instagram caption for Cozy Garden weekend promo.', 'action', now() - interval '25 minutes'),
  ('50000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Hospitality AI', 'Hospitality AI', 'Requested CEO approval for a 15% loyalty discount.', 'approval', now() - interval '50 minutes'),
  ('50000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'Finance AI', 'Finance AI', 'Flagged mismatched payout amount from Booking.com for review.', 'alert', now() - interval '1 hour 5 minutes'),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'CEO Chief of Staff', 'CEO Overview', 'Compiled daily priority brief for CEO review.', 'info', now() - interval '1 hour 30 minutes'),
  ('50000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000005', 'iSTEAM AI', 'iSTEAM AI', 'Updated enrollment tracker with 3 new leads.', 'info', now() - interval '10 hours'),
  ('50000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000004', 'Finance AI', 'Finance AI', 'Reconciled OTA payouts for the first half of July.', 'action', now() - interval '14 hours'),
  ('50000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000006', 'Knowledge AI', 'Knowledge Center', 'Google Drive sync skipped — integration not yet connected.', 'alert', now() - interval '20 hours'),
  ('50000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000002', 'Hospitality AI', 'Hospitality AI', 'Confirmed housekeeping schedule for weekend check-ins at Cozy Garden.', 'action', now() - interval '1 day'),
  ('50000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000003', 'Marketing AI', 'Marketing AI', 'Requested CEO approval for July ad spend increase.', 'approval', now() - interval '1 day 2 hours')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- sync_sources (6) — Google Sheets sources the sync framework will import.
-- Google OAuth isn't wired up yet, so these all start idle with no sheet_id;
-- running one today fails fast with a clear "not configured" error, which is
-- itself useful for exercising the sync_runs / import_logs / activity_logs
-- plumbing end-to-end.
-- ---------------------------------------------------------------------------
insert into public.sync_sources
  (id, key, name, description, business_unit_id, supports_incremental, schedule_enabled, schedule_interval_minutes)
values
  ('60000000-0000-4000-8000-000000000001', 'task-001', 'TASK-001', 'Task tracker sheet — imports into public.tasks.', null, true, false, 60),
  ('60000000-0000-4000-8000-000000000002', 'approval-001', 'APPROVAL-001', 'Approval requests sheet — imports into public.approvals.', null, true, false, 60),
  ('60000000-0000-4000-8000-000000000003', 'fin-001', 'FIN-001', 'Finance line items sheet.', '00000000-0000-4000-8000-000000000004', true, false, 240),
  ('60000000-0000-4000-8000-000000000004', 'business-portfolio', 'Business Portfolio', 'Business unit / asset overview sheet.', '00000000-0000-4000-8000-000000000001', true, false, 1440),
  ('60000000-0000-4000-8000-000000000005', 'family', 'Family', 'Family life-admin sheet.', null, true, false, 1440),
  ('60000000-0000-4000-8000-000000000006', 'health', 'Health', 'Health tracking sheet.', null, true, false, 1440)
on conflict (id) do nothing;

-- =============================================================================
-- demo admin account — admin@tuanos.vn / 12345678
-- Creates the auth.users + auth.identities rows directly (there is no CLI /
-- service-role access in this path), then upserts the matching public.users
-- profile with the "owner" role. Safe to re-run: skips creation if the auth
-- user already exists by email, and always upserts the profile row.
-- =============================================================================
do $$
declare
  admin_id uuid;
  admin_email text := 'admin@tuanos.vn';
  admin_password text := '12345678';
begin
  select id into admin_id from auth.users where email = admin_email;

  if admin_id is null then
    admin_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      admin_id,
      'authenticated',
      'authenticated',
      admin_email,
      crypt(admin_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', admin_email),
      'email',
      admin_id::text,
      now(), now(), now()
    );
  end if;

  -- The on_auth_user_created trigger (migrations/0003_users.sql) already
  -- inserts a bare public.users row on new auth.users inserts; upsert it
  -- here so the role/business unit are set correctly either way.
  insert into public.users (id, email, full_name, role, business_unit_id)
  values (
    admin_id,
    admin_email,
    'TUAN OS Admin',
    'owner',
    (select id from public.business_units where slug = 'ceo-overview')
  )
  on conflict (id) do update
    set role = excluded.role,
        business_unit_id = excluded.business_unit_id,
        full_name = excluded.full_name,
        email = excluded.email;
end $$;
