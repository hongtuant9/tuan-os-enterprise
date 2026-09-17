-- TCE AI General Manager V1: register the operational staff task sheet as a read-only sync source.
-- Google Drive remains canonical; Supabase sync_records is only an operational mirror.
insert into public.sync_sources (
  key,
  name,
  description,
  sheet_id,
  sheet_range,
  supports_incremental,
  schedule_enabled,
  status
)
values (
  'task-tce-ops-001',
  'TASK-TCE-OPS-001 — Điều hành nhân sự Tam Coc Experience',
  'Read-only operational mirror for the always-on AI General Manager runtime.',
  '19A9mlrKU5LUMiy24fTroAGlHGXIe3ABCM_jATrtj5Zs',
  '''CÔNG VIỆC NHÂN VIÊN''!A:W',
  true,
  false,
  'idle'
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  sheet_id = excluded.sheet_id,
  sheet_range = excluded.sheet_range,
  supports_incremental = excluded.supports_incremental,
  schedule_enabled = false,
  updated_at = now();