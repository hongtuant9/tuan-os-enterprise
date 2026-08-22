-- CMI V0.3 — Phân tách nghiên cứu theo mảng kinh doanh
-- Không tạo bảng mới: mọi Source/Evidence/Insight/Opportunity đã nối về Research Job.

alter table public.cmi_research_jobs
  add column if not exists business_line text not null default 'cross_business';

alter table public.cmi_research_jobs
  drop constraint if exists cmi_research_jobs_business_line_check;

alter table public.cmi_research_jobs
  add constraint cmi_research_jobs_business_line_check
  check (business_line in ('cozy_garden','homestay','tpt_isteam','cross_business'));

create index if not exists cmi_research_jobs_business_line_created_idx
  on public.cmi_research_jobs(business_line, created_at desc);

comment on column public.cmi_research_jobs.business_line is
  'Mảng kinh doanh CMI: cozy_garden, homestay, tpt_isteam, cross_business.';
