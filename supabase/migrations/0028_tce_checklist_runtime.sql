-- TCE Checklist Runtime V1: register the daily checklist as a read-only sync source.
-- Google Drive remains canonical; Supabase sync_records is only an operational mirror.
insert into public.sync_sources (
  key,
  name,
  description,
  sheet_id,
  sheet_range,
  supports_incremental,
  schedule_enabled,
  schedule_interval_minutes,
  status
)
values (
  'tce-checklist-daily',
  'TCE — Checklist hằng ngày',
  'Read-only operational mirror of TASK-TCE-OPS-001 / CHECKLIST HẰNG NGÀY.',
  '19A9mlrKU5LUMiy24fTroAGlHGXIe3ABCM_jATrtj5Zs',
  '''CHECKLIST HẰNG NGÀY''!A:X',
  true,
  false,
  5,
  'idle'
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  sheet_id = excluded.sheet_id,
  sheet_range = excluded.sheet_range,
  supports_incremental = excluded.supports_incremental,
  schedule_enabled = false,
  schedule_interval_minutes = excluded.schedule_interval_minutes,
  updated_at = now();