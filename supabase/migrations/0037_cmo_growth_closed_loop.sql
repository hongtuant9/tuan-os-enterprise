-- CMO Growth Closed Loop runtime source.
-- Google Sheet remains canonical; Supabase sync_records is an always-on VPS mirror.
insert into public.sync_sources (
  key, name, description, sheet_id, sheet_range,
  supports_incremental, schedule_enabled, schedule_interval_minutes
)
values (
  'marketing-shadow-content',
  'TCE Marketing — Shadow Content Queue',
  'Runtime mirror for CMO Growth Closed Loop. Source: MEDIA_ASSET_INDEX_TCE / SHADOW_CONTENT_QUEUE.',
  '1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw',
  'SHADOW_CONTENT_QUEUE!A:N',
  true, true, 15
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  sheet_id = excluded.sheet_id,
  sheet_range = excluded.sheet_range,
  supports_incremental = excluded.supports_incremental,
  schedule_enabled = excluded.schedule_enabled,
  schedule_interval_minutes = excluded.schedule_interval_minutes,
  updated_at = now();
