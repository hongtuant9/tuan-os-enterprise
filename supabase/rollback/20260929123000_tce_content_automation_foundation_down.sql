-- Rollback: TCE Marketing Content Automation Foundation
-- Safe only before dependent production data/processes rely on these tables.

drop view if exists public.marketing_content_outcomes_v;
drop view if exists public.marketing_content_readiness_v;
drop table if exists public.marketing_content_gate_results;
drop table if exists public.marketing_publish_attempts;
drop table if exists public.marketing_content_variants;
drop table if exists public.marketing_channel_capabilities;

delete from public.sync_sources where key='marketing-asset-index';
update public.sync_sources
set sheet_range='SHADOW_CONTENT_QUEUE!A:O', updated_at=now()
where key='marketing-shadow-content';

alter table public.marketing_content_items
  drop column if exists journey_stage,
  drop column if exists hook,
  drop column if exists language,
  drop column if exists asset_ids,
  drop column if exists tracking_url,
  drop column if exists approval_status,
  drop column if exists reviewed_by,
  drop column if exists last_qa_at;
