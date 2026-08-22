-- CMI + AI Marketing V0.1 — bổ sung index cho các khóa ngoại thường dùng.
-- Mục tiêu: tránh cảnh báo unindexed foreign keys và giữ schema production đồng bộ với Git.

create index if not exists cmi_research_jobs_business_unit_idx
  on public.cmi_research_jobs(business_unit_id);

create index if not exists cmi_research_jobs_created_by_idx
  on public.cmi_research_jobs(created_by);

create index if not exists cmi_research_runs_job_idx
  on public.cmi_research_runs(research_job_id);

create index if not exists cmi_opportunities_business_unit_idx
  on public.cmi_opportunities(business_unit_id);

create index if not exists cmi_opportunities_approved_by_idx
  on public.cmi_opportunities(approved_by);

create index if not exists marketing_strategies_business_unit_idx
  on public.marketing_strategies(business_unit_id);

create index if not exists marketing_tests_strategy_idx
  on public.marketing_tests(marketing_strategy_id);
