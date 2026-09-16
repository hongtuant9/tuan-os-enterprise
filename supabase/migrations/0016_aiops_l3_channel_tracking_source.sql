-- AI Operations L3 read-only authority mirror. Google Drive remains canonical.
insert into public.sync_sources (key, name, description, sheet_id, sheet_range, supports_incremental, schedule_enabled, schedule_interval_minutes)
values ('l3-channel-tracking', 'L3 — Channel Tracking', 'Read-only mirror of Tam_Coc_Experience_Master_Information_Sheet_V1 / 12_CHANNEL_TRACKING for AI Operations authority checks.', '1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4', 'A:T', true, false, 60)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  sheet_id = excluded.sheet_id,
  sheet_range = excluded.sheet_range,
  supports_incremental = true,
  schedule_enabled = false,
  schedule_interval_minutes = 60;
