-- CMI V0.6 — hàng đợi thu thập Browser có retry/progress.

create table if not exists public.cmi_collection_queue (
  id uuid primary key default gen_random_uuid(),
  research_job_id uuid not null references public.cmi_research_jobs(id) on delete cascade,
  source_id uuid not null references public.cmi_sources(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','cancelled')),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id)
);

drop trigger if exists set_updated_at on public.cmi_collection_queue;
create trigger set_updated_at
before update on public.cmi_collection_queue
for each row execute procedure public.set_updated_at();

alter table public.cmi_collection_queue enable row level security;

drop policy if exists "CMI queue authenticated select" on public.cmi_collection_queue;
drop policy if exists "CMI queue authenticated insert" on public.cmi_collection_queue;
drop policy if exists "CMI queue authenticated update" on public.cmi_collection_queue;
create policy "CMI queue authenticated select"
on public.cmi_collection_queue for select to authenticated using (true);
create policy "CMI queue authenticated insert"
on public.cmi_collection_queue for insert to authenticated with check (true);
create policy "CMI queue authenticated update"
on public.cmi_collection_queue for update to authenticated using (true) with check (true);

create index if not exists cmi_collection_queue_status_due_idx
  on public.cmi_collection_queue(status, next_attempt_at, created_at);
create index if not exists cmi_collection_queue_research_status_idx
  on public.cmi_collection_queue(research_job_id, status);

create or replace function public.claim_cmi_collection_jobs(p_limit int default 1)
returns setof public.cmi_collection_queue
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 5 then
    raise exception 'CMI_QUEUE_LIMIT_INVALID';
  end if;

  return query
  with picked as (
    select q.id
    from public.cmi_collection_queue q
    where q.status = 'queued'
      and q.next_attempt_at <= now()
      and q.attempts < q.max_attempts
    order by q.next_attempt_at asc, q.created_at asc
    for update skip locked
    limit p_limit
  )
  update public.cmi_collection_queue q
  set status = 'running',
      attempts = q.attempts + 1,
      started_at = now(),
      last_error = null,
      updated_at = now()
  from picked
  where q.id = picked.id
  returning q.*;
end;
$$;

grant execute on function public.claim_cmi_collection_jobs(int) to authenticated, service_role;
