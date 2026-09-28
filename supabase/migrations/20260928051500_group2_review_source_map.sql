-- Group 2 review source-map completion.
-- Canonicalizes the existing Booking.com raw review export as static Drive evidence.
insert into public.marketing_connectors
  (id,channel_id,display_name,provider,source_type,status,auth_state,read_mode,write_mode,
   refresh_interval_minutes,freshness_sla_minutes,last_sync_at,last_success_at,last_record_count,last_error,metadata)
values
  ('booking_reviews_export',null,'Booking.com Review Export Snapshot','booking.com','manual_evidence','READY','NOT_REQUIRED','READ_ONLY','DISABLED',
   10080,10080,'2026-08-26T02:19:53.758Z','2026-08-26T02:19:53.758Z',318,null,
   jsonb_build_object(
     'authority','Google Drive raw Booking.com review exports',
     'snapshot_date','2026-08-26',
     'static_snapshot',true,
     'lavender_file_id','1PAi20ZbORmmnGlSRhIw-CfvVfUxTPWfR',
     'ruby_file_id','1y9IOpvMR9SdG1B5SjiXgokhEA4FJy9nT',
     'review_semantics','Review existence/content VERIFIED from raw export; customer/booking linkage remains NEED_VERIFY unless authenticated identifier exists.'
   ))
on conflict(id) do update set
  display_name=excluded.display_name,
  provider=excluded.provider,
  source_type=excluded.source_type,
  status=excluded.status,
  auth_state=excluded.auth_state,
  read_mode=excluded.read_mode,
  write_mode=excluded.write_mode,
  last_sync_at=excluded.last_sync_at,
  last_success_at=excluded.last_success_at,
  last_record_count=excluded.last_record_count,
  last_error=null,
  metadata=excluded.metadata,
  updated_at=now();

create or replace view public.marketing_source_map_v
with (security_invoker = true)
as
select
  mc.id as source_id,
  mc.display_name as source_name,
  mc.provider,
  case mc.id
    when 'kiotviet_hotel' then 'booking, stay, verified revenue'
    when 'kiotviet_fnb' then 'F&B transaction and revenue'
    when 'ga4' then 'website session and tracked events'
    when 'google_ads' then 'campaign, impression, click, spend, platform conversion'
    when 'hospitality_crm' then 'customer, conversation, canonical lead'
    when 'ai_receptionist' then 'conversation and AI handling evidence'
    when 'booking_reviews_export' then 'Booking.com review snapshot and review evidence'
    else mc.channel_id
  end as metric_scope,
  case
    when mc.id in ('kiotviet_hotel','kiotviet_fnb') then 'AUTHENTICATED_RUNTIME_SSOT'
    when mc.id in ('ga4','google_ads') then 'AUTHENTICATED_PLATFORM_EVIDENCE'
    when mc.id in ('hospitality_crm','ai_receptionist') then 'TUAN_OS_CANONICAL_RUNTIME'
    when mc.id='booking_reviews_export' then 'DRIVE_EXPORT_EVIDENCE'
    else 'CHANNEL_EVIDENCE'
  end as authority_class,
  mc.read_mode,
  mc.write_mode,
  mc.last_success_at as freshness_at,
  case
    when mc.id='booking_reviews_export' and coalesce((mc.metadata->>'static_snapshot')::boolean,false) and mc.last_record_count>0 then 'VERIFIED'
    when mc.status='LIVE' and mc.auth_state in ('VERIFIED','NOT_REQUIRED') then 'VERIFIED'
    when mc.status='ERROR' then 'HOLD'
    else 'NEED_VERIFY'
  end as verification_status,
  mc.metadata
from public.marketing_connectors mc;

grant select on public.marketing_source_map_v to authenticated,service_role;

comment on view public.marketing_source_map_v is
'Marketing source authority map. Static review exports may be VERIFIED as snapshot evidence while freshness_at preserves their non-live age.';
