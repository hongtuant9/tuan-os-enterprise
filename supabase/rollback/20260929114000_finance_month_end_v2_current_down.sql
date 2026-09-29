drop index if exists public.finance_month_end_current_step_uq;
alter table public.finance_month_end_close_items drop column if exists is_current, drop column if exists workflow_version;
