create table if not exists public.zalo_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zalo_oa',
  app_id text not null,
  oa_id text,
  app_secret text,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  oauth_state text,
  code_verifier text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  last_refresh_at timestamptz,
  last_error text,
  unique (provider, app_id)
);

alter table public.zalo_oauth_connections enable row level security;
revoke all on public.zalo_oauth_connections from authenticated, anon;

drop trigger if exists set_updated_at on public.zalo_oauth_connections;
create trigger set_updated_at before update on public.zalo_oauth_connections
  for each row execute procedure public.set_updated_at();

comment on table public.zalo_oauth_connections is
  'Server-side only Zalo OA OAuth connection. Secrets/tokens are readable/writable only through service-role.';
