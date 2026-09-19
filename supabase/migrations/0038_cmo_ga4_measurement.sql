insert into public.sync_sources (
  key, name, description, sheet_id, sheet_range,
  supports_incremental, schedule_enabled, schedule_interval_minutes
)
values (
  'ga4-traffic',
  'CMO Growth — GA4 Traffic',
  'Read-only GA4 traffic snapshot collected by the always-on TCE Executive Worker.',
  null, null, false, false, 15
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  schedule_interval_minutes = excluded.schedule_interval_minutes,
  updated_at = now();
