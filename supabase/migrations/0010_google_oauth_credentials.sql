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
