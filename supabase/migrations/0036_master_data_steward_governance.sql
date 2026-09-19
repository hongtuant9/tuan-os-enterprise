alter table public.approvals
  add column if not exists change_class text,
  add column if not exists confidence text,
  add column if not exists impact_summary text,
  add column if not exists rollback_plan text;
