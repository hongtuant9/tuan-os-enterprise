insert into public.sync_sources (
  key, name, source_type, sheet_id, sheet_range,
  schedule_enabled, schedule_minutes, status, metadata
)
values (
  'tce-checklist-daily',
  'TCE — Checklist hằng ngày',
  'google_sheet',
  '19A9mlrKU5LUMiy24fTroAGlHGXIe3ABCM_jATrtj5Zs',
  '''CHECKLIST HẰNG NGÀY''!A:X',
  false,
  5,
  'idle',
  '{"authority":"TASK-TCE-OPS-001","mode":"read_only_mirror","owner":"AI Tổng quản lý"}'::jsonb
)
on conflict (key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  sheet_id = excluded.sheet_id,
  sheet_range = excluded.sheet_range,
  schedule_enabled = false,
  schedule_minutes = excluded.schedule_minutes,
  metadata = excluded.metadata,
  updated_at = now();
