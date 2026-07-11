-- Replaces the single label-based google_oauth_credentials row with a
-- per-user connections table. Each authenticated TUAN OS user can connect
-- their own Google account; RLS lets a user read only their own row, and
-- every write (insert/update/refresh) happens server-side with the
-- service-role key, which bypasses RLS entirely.
drop table if exists public.google_oauth_credentials;

create table if not exists public.google_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'google',
  google_email text,
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_refresh_at timestamptz,
  last_error text,
  unique (user_id, provider)
);

alter table public.google_oauth_connections enable row level security;

drop policy if exists "Users can view their own Google connection" on public.google_oauth_connections;
create policy "Users can view their own Google connection"
  on public.google_oauth_connections for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policies for anon/authenticated — only the
-- service-role client (SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS) may
-- write to this table.

-- Defense in depth beyond RLS: even for a user's own row, the access/refresh
-- tokens are never selectable through PostgREST — only the service-role
-- client (which bypasses column privileges too) can read them. Server code
-- exposing "connected" status to the browser must select these columns
-- explicitly; it can never do so via the authenticated role regardless.
revoke all on public.google_oauth_connections from authenticated, anon;
grant select (
  id, user_id, provider, google_email, token_type, scope,
  access_token_expires_at, connected_at, updated_at, last_refresh_at, last_error
) on public.google_oauth_connections to authenticated;

drop trigger if exists set_updated_at on public.google_oauth_connections;
create trigger set_updated_at before update on public.google_oauth_connections
  for each row execute procedure public.set_updated_at();
