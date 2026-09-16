-- TCE AI Cost Guard — usage ledger and fail-closed budget accounting.
create table if not exists public.tce_ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  model text not null,
  input_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  request_source text not null default 'control-center',
  created_at timestamptz not null default now()
);

alter table public.tce_ai_usage_ledger enable row level security;
revoke all on public.tce_ai_usage_ledger from anon, authenticated;
create index if not exists tce_ai_usage_ledger_created_idx on public.tce_ai_usage_ledger(created_at desc);
create index if not exists tce_ai_usage_ledger_agent_idx on public.tce_ai_usage_ledger(agent_id, created_at desc);
