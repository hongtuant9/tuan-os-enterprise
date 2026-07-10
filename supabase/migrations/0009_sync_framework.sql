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
