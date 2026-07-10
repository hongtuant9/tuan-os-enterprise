-- Standalone, idempotent seed for public.sync_sources only.
-- Prerequisites: migrations 0002_business_units.sql and 0009_sync_framework.sql
-- (i.e. public.business_units and public.sync_sources) must already exist.
--
-- Safe to run more than once: matches on the unique `key` column and does
-- nothing if a source already exists, so it never overwrites runtime state
-- (status, last_synced_at, last_cursor, last_error, sheet_id, sheet_range)
-- produced by real syncs, and never touches any other table's data.
--
-- business_unit_id values are resolved from public.business_units by slug
-- at insert time rather than hardcoded — if a slug isn't found the
-- subquery simply yields null (matches the column's nullable FK).

insert into public.sync_sources
  (key, name, description, business_unit_id, supports_incremental, schedule_enabled, schedule_interval_minutes)
values
  ('task-001', 'TASK-001', 'Task tracker sheet — imports into public.tasks.',
    null,
    true, false, 60),
  ('approval-001', 'APPROVAL-001', 'Approval requests sheet — imports into public.approvals.',
    null,
    true, false, 60),
  ('fin-001', 'FIN-001', 'Finance line items sheet.',
    (select id from public.business_units where slug = 'finance-ai'),
    true, false, 240),
  ('business-portfolio', 'Business Portfolio', 'Business unit / asset overview sheet.',
    (select id from public.business_units where slug = 'ceo-overview'),
    true, false, 1440),
  ('family', 'Family', 'Family life-admin sheet.',
    null,
    true, false, 1440),
  ('health', 'Health', 'Health tracking sheet.',
    null,
    true, false, 1440)
on conflict (key) do nothing;
