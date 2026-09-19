-- Master Data Change Approval Control.
alter table public.approvals
  add column if not exists request_type text not null default 'general',
  add column if not exists change_key text,
  add column if not exists entity text,
  add column if not exists target_file text,
  add column if not exists target_sheet text,
  add column if not exists target_cell text,
  add column if not exists current_value text,
  add column if not exists proposed_value text,
  add column if not exists source_channel text,
  add column if not exists evidence_url text,
  add column if not exists severity text not null default 'medium',
  add column if not exists ai_recommendation text,
  add column if not exists execution_status text not null default 'not_applicable',
  add column if not exists execution_note text,
  add column if not exists source_queue_row int,
  add column if not exists decided_at timestamptz,
  add column if not exists applied_at timestamptz;

create unique index if not exists approvals_change_key_uidx
  on public.approvals(change_key) where change_key is not null;
create index if not exists approvals_request_type_status_idx
  on public.approvals(request_type, status, created_at desc);

insert into public.sync_sources (
  key,name,description,sheet_id,sheet_range,supports_incremental,
  schedule_enabled,schedule_interval_minutes,status
) values (
  'l3-ota-change-review',
  'L3 OTA Change Review Queue',
  'AI-detected Master Data and OTA mismatch proposals awaiting CEO decision.',
  '1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4',
  '''14_OTA_CHANGE_REVIEW_QUEUE''!A:S',
  true,true,10,'idle'
)
on conflict (key) do update set
  name=excluded.name,
  description=excluded.description,
  sheet_id=excluded.sheet_id,
  sheet_range=excluded.sheet_range,
  schedule_enabled=true,
  schedule_interval_minutes=10;
