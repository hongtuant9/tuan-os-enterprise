-- CMI V0.5 — ứng viên đối thủ cho quy trình One-Click Research.
-- Additive only: không xóa dữ liệu hiện có.

create table if not exists public.cmi_competitors (
  id uuid primary key default gen_random_uuid(),
  research_job_id uuid not null references public.cmi_research_jobs(id) on delete cascade,
  name text not null,
  rank int not null check (rank between 1 and 100),
  score numeric(5,2) not null default 0 check (score between 0 and 100),
  primary_url text,
  platform text,
  rationale text,
  source_urls jsonb not null default '[]'::jsonb,
  discovery_evidence jsonb not null default '{}'::jsonb,
  selection_status text not null default 'candidate'
    check (selection_status in ('candidate','selected','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (research_job_id, name)
);

drop trigger if exists set_updated_at on public.cmi_competitors;
create trigger set_updated_at
before update on public.cmi_competitors
for each row execute procedure public.set_updated_at();

alter table public.cmi_competitors enable row level security;

drop policy if exists "CMI authenticated select" on public.cmi_competitors;
drop policy if exists "CMI authenticated insert" on public.cmi_competitors;
drop policy if exists "CMI authenticated update" on public.cmi_competitors;

create policy "CMI authenticated select"
on public.cmi_competitors for select to authenticated using (true);
create policy "CMI authenticated insert"
on public.cmi_competitors for insert to authenticated with check (true);
create policy "CMI authenticated update"
on public.cmi_competitors for update to authenticated using (true) with check (true);

create index if not exists cmi_competitors_job_rank_idx
  on public.cmi_competitors(research_job_id, rank);
create index if not exists cmi_competitors_job_selection_idx
  on public.cmi_competitors(research_job_id, selection_status);
