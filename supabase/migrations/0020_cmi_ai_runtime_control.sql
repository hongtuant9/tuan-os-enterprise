-- CMI + AI Marketing V0.9 — runtime AI toggle + budget guard

create table if not exists public.cmi_ai_settings (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false,
  monthly_budget_usd numeric(10,4) not null default 5.0000 check (monthly_budget_usd >= 0 and monthly_budget_usd <= 1000),
  daily_limit integer not null default 10 check (daily_limit between 1 and 100),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.cmi_ai_settings (id, enabled, monthly_budget_usd, daily_limit)
values ('default', false, 5.0000, 10)
on conflict (id) do nothing;

alter table public.cmi_ai_usage
  add column if not exists model text,
  add column if not exists input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0,
  add column if not exists web_search_calls integer not null default 0,
  add column if not exists reserved_cost_usd numeric(12,6) not null default 0,
  add column if not exists estimated_cost_usd numeric(12,6) not null default 0,
  add column if not exists status text not null default 'completed' check (status in ('reserved','completed','failed'));

create index if not exists cmi_ai_usage_created_at_idx on public.cmi_ai_usage(created_at desc);
create index if not exists cmi_ai_usage_status_created_idx on public.cmi_ai_usage(status, created_at desc);

alter table public.cmi_ai_settings enable row level security;
drop policy if exists "CMI AI settings authenticated select" on public.cmi_ai_settings;
create policy "CMI AI settings authenticated select"
  on public.cmi_ai_settings for select to authenticated using (true);

create or replace function public.reserve_cmi_ai_budget(
  p_action_type text,
  p_created_by uuid,
  p_reserved_cost_usd numeric,
  p_model text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.cmi_ai_settings%rowtype;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  v_daily_count integer;
  v_month_cost numeric;
  v_id uuid;
begin
  select * into v_settings from public.cmi_ai_settings where id='default' for update;
  if not found or not v_settings.enabled then
    raise exception 'CMI_AI_RUNTIME_DISABLED';
  end if;

  select count(*) into v_daily_count
  from public.cmi_ai_usage
  where usage_date = v_today and status in ('reserved','completed');
  if v_daily_count >= v_settings.daily_limit then
    raise exception 'CMI_AI_DAILY_QUOTA_REACHED';
  end if;

  select coalesce(sum(case when status='reserved' then reserved_cost_usd else estimated_cost_usd end),0)
    into v_month_cost
  from public.cmi_ai_usage
  where created_at >= v_month_start and status in ('reserved','completed');

  if v_month_cost + greatest(coalesce(p_reserved_cost_usd,0),0) > v_settings.monthly_budget_usd then
    raise exception 'CMI_AI_MONTHLY_BUDGET_REACHED';
  end if;

  insert into public.cmi_ai_usage(
    usage_date, action_type, created_by, model, reserved_cost_usd, status
  ) values (
    v_today, p_action_type, p_created_by, p_model, greatest(coalesce(p_reserved_cost_usd,0),0), 'reserved'
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_cmi_ai_budget(text,uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.reserve_cmi_ai_budget(text,uuid,numeric,text) to service_role;

create or replace function public.finish_cmi_ai_usage(
  p_usage_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_web_search_calls integer,
  p_estimated_cost_usd numeric,
  p_success boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cmi_ai_usage
  set input_tokens = greatest(coalesce(p_input_tokens,0),0),
      output_tokens = greatest(coalesce(p_output_tokens,0),0),
      web_search_calls = greatest(coalesce(p_web_search_calls,0),0),
      estimated_cost_usd = greatest(coalesce(p_estimated_cost_usd,0),0),
      reserved_cost_usd = 0,
      status = case when p_success then 'completed' else 'failed' end
  where id = p_usage_id;
end;
$$;

revoke all on function public.finish_cmi_ai_usage(uuid,bigint,bigint,integer,numeric,boolean) from public, anon, authenticated;
grant execute on function public.finish_cmi_ai_usage(uuid,bigint,bigint,integer,numeric,boolean) to service_role;
