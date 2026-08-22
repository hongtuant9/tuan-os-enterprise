-- CMI V0.5.2 — nhật ký & quota AI theo ngày.
-- Additive only. Không bật AI và không phát sinh chi phí.

create table if not exists public.cmi_ai_usage (
  id uuid primary key default gen_random_uuid(),
  usage_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  action_type text not null check (action_type in ('competitor_discovery','cmi_analysis','marketing_strategy')),
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.cmi_ai_usage enable row level security;

drop policy if exists "CMI AI usage authenticated select" on public.cmi_ai_usage;
drop policy if exists "CMI AI usage authenticated insert" on public.cmi_ai_usage;
create policy "CMI AI usage authenticated select"
on public.cmi_ai_usage for select to authenticated using (true);
create policy "CMI AI usage authenticated insert"
on public.cmi_ai_usage for insert to authenticated with check (true);

create index if not exists cmi_ai_usage_date_idx
  on public.cmi_ai_usage(usage_date, created_at desc);

create or replace function public.consume_cmi_ai_daily_quota(
  p_action_type text,
  p_max_calls int default 10
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := ((now() at time zone 'Asia/Bangkok')::date);
  v_count int;
begin
  if p_action_type not in ('competitor_discovery','cmi_analysis','marketing_strategy') then
    raise exception 'CMI_AI_ACTION_INVALID';
  end if;
  if p_max_calls < 1 or p_max_calls > 100 then
    raise exception 'CMI_AI_QUOTA_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('cmi_ai_quota_' || v_today::text));

  select count(*) into v_count
  from public.cmi_ai_usage
  where usage_date = v_today;

  if v_count >= p_max_calls then
    raise exception 'CMI_AI_DAILY_QUOTA_REACHED';
  end if;

  insert into public.cmi_ai_usage(usage_date, action_type, created_by)
  values (v_today, p_action_type, auth.uid());

  return v_count + 1;
end;
$$;

grant execute on function public.consume_cmi_ai_daily_quota(text, int) to authenticated;
