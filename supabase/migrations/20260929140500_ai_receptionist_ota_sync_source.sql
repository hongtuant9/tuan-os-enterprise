insert into public.sync_sources(
  key,name,description,supports_incremental,schedule_enabled,schedule_interval_minutes,status
)
values(
  'ai_receptionist_ota_email',
  'AI Lễ Tân — OTA Email Collector',
  'Canonical OTA email collector health. Owner=AI Receptionist / Hospitality AI; expected refresh=2m; stale_after=6m; error_after=15m. Data recency is tracked separately from pipeline freshness.',
  true,true,2,'idle'
)
on conflict(key) do update set
  name=excluded.name,
  description=excluded.description,
  supports_incremental=excluded.supports_incremental,
  schedule_enabled=excluded.schedule_enabled,
  schedule_interval_minutes=excluded.schedule_interval_minutes,
  updated_at=now();
