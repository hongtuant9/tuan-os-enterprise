-- CMI + AI Marketing V0.1
-- CMI: Nghiên cứu -> Nguồn -> Bằng chứng -> Insight -> Cơ hội.
-- AI Marketing: chỉ tạo ý tưởng/chiến lược cần test và kiểm chứng.

create table if not exists public.cmi_research_jobs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units(id) on delete set null,
  title text not null,
  objective text not null,
  research_type text not null default 'customer_market'
    check (research_type in ('customer_market','competitor','reviews','product','mixed')),
  status text not null default 'draft'
    check (status in ('draft','ready','running','needs_review','completed','failed','archived')),
  scope jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cmi_sources (
  id uuid primary key default gen_random_uuid(),
  research_job_id uuid not null references public.cmi_research_jobs(id) on delete cascade,
  platform text not null default 'website',
  source_type text not null default 'web_page'
    check (source_type in ('web_page','review_page','product_page','social_comment','manual','file')),
  url text,
  title text,
  competitor_name text,
  capture_method text not null default 'manual'
    check (capture_method in ('manual','html','browser','screenshot','api','file')),
  captured_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','captured','failed','ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cmi_evidence (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.cmi_sources(id) on delete cascade,
  evidence_type text not null default 'text'
    check (evidence_type in ('text','review','comment','screenshot','structured_data','observation')),
  raw_text text,
  structured_data jsonb not null default '{}'::jsonb,
  screenshot_path text,
  source_url text,
  language text,
  captured_at timestamptz not null default now(),
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.cmi_insights (
  id uuid primary key default gen_random_uuid(),
  research_job_id uuid not null references public.cmi_research_jobs(id) on delete cascade,
  insight_type text not null
    check (insight_type in ('customer_segment','pain_point','need','want','competitor_strength','competitor_weakness','market_gap','trend','other')),
  title text not null,
  summary text not null,
  customer_segment text,
  topic text,
  sentiment text check (sentiment is null or sentiment in ('positive','neutral','negative','mixed')),
  frequency_count int not null default 0 check (frequency_count >= 0),
  confidence numeric(5,2) check (confidence is null or (confidence >= 0 and confidence <= 100)),
  evidence_ids uuid[] not null default '{}',
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','partially_verified','verified','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cmi_opportunities (
  id uuid primary key default gen_random_uuid(),
  research_job_id uuid not null references public.cmi_research_jobs(id) on delete cascade,
  business_unit_id uuid references public.business_units(id) on delete set null,
  title text not null,
  customer_segment text,
  problem text not null,
  proposed_solution text not null,
  evidence_summary text,
  current_capability text,
  capability_gap text,
  desirability_score int check (desirability_score is null or desirability_score between 1 and 5),
  feasibility_score int check (feasibility_score is null or feasibility_score between 1 and 5),
  viability_score int check (viability_score is null or viability_score between 1 and 5),
  priority_score numeric(6,2),
  status text not null default 'proposed'
    check (status in ('proposed','needs_validation','approved_for_marketing','rejected','testing','validated','archived')),
  validation_note text,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cmi_research_runs (
  id uuid primary key default gen_random_uuid(),
  research_job_id uuid not null references public.cmi_research_jobs(id) on delete cascade,
  run_type text not null default 'manual'
    check (run_type in ('manual','browser','ai_analysis','scheduled')),
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','cancelled')),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_strategies (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.cmi_opportunities(id) on delete cascade,
  business_unit_id uuid references public.business_units(id) on delete set null,
  version int not null default 1,
  target_customer text not null,
  positioning text not null,
  value_proposition text not null,
  marketing_ideas jsonb not null default '[]'::jsonb,
  channel_strategy jsonb not null default '[]'::jsonb,
  test_hypotheses jsonb not null default '[]'::jsonb,
  kpis jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  evidence_ids uuid[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','needs_review','approved_for_test','testing','validated','rejected','archived')),
  created_by_agent text not null default 'AI_MARKETING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, version)
);

create table if not exists public.marketing_tests (
  id uuid primary key default gen_random_uuid(),
  marketing_strategy_id uuid not null references public.marketing_strategies(id) on delete cascade,
  title text not null,
  hypothesis text not null,
  method text,
  channel text,
  start_date date,
  end_date date,
  budget numeric(14,2),
  status text not null default 'planned'
    check (status in ('planned','approved','running','completed','cancelled')),
  result_data jsonb not null default '{}'::jsonb,
  conclusion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'cmi_research_jobs','cmi_insights','cmi_opportunities','marketing_strategies','marketing_tests'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()',
      t
    );
  end loop;
end $$;

alter table public.cmi_research_jobs enable row level security;
alter table public.cmi_sources enable row level security;
alter table public.cmi_evidence enable row level security;
alter table public.cmi_insights enable row level security;
alter table public.cmi_opportunities enable row level security;
alter table public.cmi_research_runs enable row level security;
alter table public.marketing_strategies enable row level security;
alter table public.marketing_tests enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cmi_research_jobs','cmi_sources','cmi_evidence','cmi_insights',
    'cmi_opportunities','cmi_research_runs','marketing_strategies','marketing_tests'
  ]
  loop
    execute format('drop policy if exists "CMI authenticated select" on public.%I', t);
    execute format('drop policy if exists "CMI authenticated insert" on public.%I', t);
    execute format('drop policy if exists "CMI authenticated update" on public.%I', t);
    execute format('create policy "CMI authenticated select" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "CMI authenticated insert" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "CMI authenticated update" on public.%I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;

create index if not exists cmi_research_jobs_status_created_idx on public.cmi_research_jobs(status, created_at desc);
create index if not exists cmi_sources_job_created_idx on public.cmi_sources(research_job_id, created_at desc);
create index if not exists cmi_evidence_source_created_idx on public.cmi_evidence(source_id, created_at desc);
create index if not exists cmi_insights_job_type_idx on public.cmi_insights(research_job_id, insight_type);
create index if not exists cmi_opportunities_job_status_idx on public.cmi_opportunities(research_job_id, status);
create index if not exists marketing_strategies_opportunity_idx on public.marketing_strategies(opportunity_id, version desc);

insert into public.agents (business_unit_id, name, unit, status, current_task)
select null, 'AI Nghiên cứu Khách hàng & Thị trường (CMI)', 'Nghiên cứu & Cơ hội', 'offline',
       'V0.1 — Thu thập bằng chứng, tạo insight và cơ hội'
where not exists (
  select 1 from public.agents where name = 'AI Nghiên cứu Khách hàng & Thị trường (CMI)'
);

insert into public.agents (business_unit_id, name, unit, status, current_task)
select null, 'AI Marketing', 'Chiến lược Marketing', 'offline',
       'V0.1 — Đề xuất ý tưởng và chiến lược cần test/kiểm chứng'
where not exists (
  select 1 from public.agents where name = 'AI Marketing'
);
