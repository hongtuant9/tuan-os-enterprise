-- Align TCE Marketing workbook sync ranges and clean stale derived plan cache.
-- Additive/idempotent data fix; no business/master data mutation.

update public.sync_sources
set sheet_range = case key
  when 'marketing-campaign-plan' then '03_CAMPAIGN_PORTFOLIO!A:R'
  when 'marketing-shadow-content' then 'SHADOW_CONTENT_QUEUE!A:O'
  when 'marketing-action-plan' then '07_ACTION_REGISTER!A:O'
  else sheet_range
end
where key in ('marketing-campaign-plan','marketing-shadow-content','marketing-action-plan');

delete from public.sync_records
where source_key='marketing-campaign-plan'
  and data->>'CAMPAIGN_ID'='DEMO-FB-90D';

delete from public.marketing_campaigns
where plan_campaign_id='DEMO-FB-90D'
  and coalesce(metadata->>'plan_only','false')='true';

update public.marketing_content_items m
set brand = nullif(s.data->>'MASTER_BRAND','')
from public.sync_records s
where s.source_key='marketing-shadow-content'
  and s.data->>'CONTENT_ID'=m.content_id
  and nullif(s.data->>'MASTER_BRAND','') is not null;

update public.marketing_campaigns
set verification_status = case plan_campaign_id
  when 'CMP-GREEN-FB-001' then 'VERIFIED'
  when 'CMP-RETENTION-001' then 'HOLD'
  else 'NEED_VERIFY'
end
where coalesce(metadata->>'plan_only','false')='true'
  and plan_campaign_id in (
    'CMP-GREEN-FB-001','CMP-WEB-CONV-001','CMP-LOCAL-001','CMP-OTA-001','CMP-RETENTION-001'
  );
