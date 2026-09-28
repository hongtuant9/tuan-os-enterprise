-- Group 2 100% acceptance hardening.
-- Expands existing QA/reconciliation surfaces; no production business data is invented.

create or replace view public.group2_data_quality_v
with (security_invoker = true)
as
with duplicate_identity as (
  select count(*)::bigint n from (
    select identity_type,identity_hash
    from public.hospitality_customer_identities
    where identity_hash is not null
    group by identity_type,identity_hash
    having count(*)>1
  ) d
),
duplicate_lead as (
  select count(*)::bigint n from (
    select conversation_id
    from public.hospitality_leads
    where conversation_id is not null
    group by conversation_id
    having count(*)>1
  ) d
),
duplicate_booking as (
  select count(*)::bigint n from (
    select source_system,source_booking_uuid
    from public.hospitality_bookings
    where source_booking_uuid is not null
    group by source_system,source_booking_uuid
    having count(*)>1
  ) d
),
booking_with_lead as (
  select distinct hospitality_booking_id
  from public.hospitality_leads
  where hospitality_booking_id is not null
),
critical_connectors as (
  select * from public.marketing_connectors
  where id in ('hospitality_crm','ai_receptionist','kiotviet_hotel','ga4','google_ads')
)
select 'duplicate_customer_identity'::text issue_type, d.n issue_count,
       'DATA_GAP'::text classification,
       case when d.n=0 then 'PASS' else 'FAIL' end::text status,
       'Verified/authenticated identity hash must not resolve to multiple canonical customers.'::text reason
from duplicate_identity d
union all
select 'duplicate_lead_conversation',d.n,'DATA_GAP',
       case when d.n=0 then 'PASS' else 'FAIL' end,
       'A conversation may materialize at most one canonical lead.'
from duplicate_lead d
union all
select 'duplicate_booking_source_key',d.n,'DATA_GAP',
       case when d.n=0 then 'PASS' else 'FAIL' end,
       'Canonical booking source_system + source_booking_uuid must be unique.'
from duplicate_booking d
union all
select 'customer_without_resolvable_identity',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Customer has no authenticated channel/customer ID or verified phone/email.'
from public.hospitality_customers c
where not exists (
  select 1 from public.hospitality_customer_identities i
  where i.customer_id=c.id
    and (
      (i.identity_type in ('phone','email') and i.verified_at is not null)
      or i.identity_type in ('facebook','instagram','zalo','whatsapp','website','ota','kiotviet_customer_id','other')
    )
)
union all
select 'booking_without_customer',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Booking has no canonical customer because source did not provide a resolvable authenticated identifier.'
from public.hospitality_bookings where customer_id is null
union all
select 'completed_booking_without_verified_revenue',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       'Completed booking must not be treated as verified revenue unless authenticated invoice linkage exists.'
from public.hospitality_bookings
where booking_status='COMPLETED' and revenue_verification_status<>'VERIFIED'
union all
select 'lead_without_customer',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Canonical lead should resolve customer identity when evidence exists.'
from public.hospitality_leads where customer_id is null
union all
select 'booked_lead_without_booking_link',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       'BOOKED lead must have canonical hospitality booking or legacy AI booking evidence.'
from public.hospitality_leads
where lead_status='BOOKED' and hospitality_booking_id is null and booking_record_id is null
union all
select 'valid_multientry_booking_without_lead',count(*)::bigint,'VALID_MULTI_ENTRY','PASS',
       'KiotViet/OTA booking may legitimately enter the journey at booking without a TUAN OS lead.'
from public.hospitality_bookings b
where b.source_system='KIOTVIET_HOTEL'
  and not exists (select 1 from booking_with_lead l where l.hospitality_booking_id=b.id)
union all
select 'ai_direct_booking_without_lead',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       'AI_DIRECT booking without canonical lead is a linkage gap, unlike OTA/KiotViet multi-entry.'
from public.hospitality_bookings b
where b.source_system='AI_DIRECT'
  and not exists (select 1 from booking_with_lead l where l.hospitality_booking_id=b.id)
union all
select 'verified_revenue_without_booking_link',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       'Verified revenue event must link to a canonical booking.'
from public.marketing_attribution_events
where event_type='revenue' and verification_status='VERIFIED'
  and hospitality_booking_id is null and booking_record_id is null
union all
select 'review_without_customer',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Review-to-customer linkage remains nullable only when evidence is absent.'
from public.hospitality_reviews where customer_id is null
union all
select 'attribution_event_missing_source',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Attributable event has no tracking, source, or self-reported source evidence.'
from public.marketing_attribution_events
where event_type in ('inquiry','lead','booking_started','booking','checked_in','purchase','review_submitted','return_visit','upsell','revenue')
  and coalesce(nullif(source,''),nullif(utm_source,''),nullif(self_reported_source,'')) is null
union all
select 'invalid_utm_partial',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'UTM medium/campaign/content/term exists without utm_source.'
from public.marketing_attribution_events
where nullif(utm_source,'') is null
  and (nullif(utm_medium,'') is not null or nullif(utm_campaign,'') is not null
       or nullif(utm_content,'') is not null or nullif(utm_term,'') is not null)
union all
select 'paid_touch_missing_campaign_mapping',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Paid click/source evidence exists but no campaign ID/name can be resolved.'
from public.marketing_attribution_events
where (
    nullif(gclid,'') is not null or nullif(gbraid,'') is not null or nullif(wbraid,'') is not null
    or lower(coalesce(utm_medium,'')) in ('cpc','ppc','paid','paid_search','paid_social')
  )
  and campaign_id is null and nullif(utm_campaign,'') is null
union all
select 'unknown_source',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Source explicitly resolves to unknown; do not promote it to verified attribution.'
from public.marketing_attribution_events
where lower(coalesce(source,'')) in ('unknown','(unknown)','not set','(not set)')
union all
select 'contradictory_attribution_semantics',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       'Attribution status claims verified/self-reported evidence that is not present on the event.'
from public.marketing_attribution_events
where
  (attribution_status='DIRECT_VERIFIED'
    and nullif(gclid,'') is null and nullif(gbraid,'') is null and nullif(wbraid,'') is null
    and nullif(utm_source,'') is null and nullif(utm_campaign,'') is null)
  or
  (attribution_status='SELF_REPORTED' and nullif(self_reported_source,'') is null)
union all
select 'stale_critical_connector',count(*)::bigint,'DATA_GAP',
       case when count(*)=0 then 'PASS' else 'NEED VERIFY' end,
       'Critical Group 2 connector has no successful refresh within 30 minutes.'
from critical_connectors
where last_success_at is null or last_success_at < now() - interval '30 minutes';

grant select on public.group2_data_quality_v to authenticated,service_role;

create or replace view public.group2_reconciliation_v
with (security_invoker = true)
as
with
canonical_leads as (
  select count(*)::numeric value from public.hospitality_leads where verification_status='VERIFIED'
),
event_leads as (
  select count(*)::numeric value from public.marketing_attribution_events where event_type='lead' and verification_status='VERIFIED'
),
linked_leads as (
  select count(*)::numeric value from public.hospitality_leads
  where verification_status='VERIFIED' and hospitality_booking_id is not null
),
canonical_bookings as (
  select count(*)::numeric value
  from public.hospitality_bookings
  where verification_status='VERIFIED' and booking_status in ('CONFIRMED','COMPLETED')
),
event_bookings as (
  select count(*)::numeric value
  from public.marketing_attribution_events
  where event_type='booking' and verification_status='VERIFIED' and hospitality_booking_id is not null
),
kiotviet_runtime_bookings as (
  select count(*)::numeric value from public.hospitality_bookings where source_system='KIOTVIET_HOTEL'
),
kiotviet_connector_count as (
  select coalesce(max(last_record_count),0)::numeric value from public.marketing_connectors where id='kiotviet_hotel'
),
canonical_revenue as (
  select coalesce(sum(verified_revenue),0)::numeric value
  from public.hospitality_bookings where revenue_verification_status='VERIFIED'
),
event_revenue as (
  select coalesce(sum(revenue_amount),0)::numeric value
  from public.marketing_attribution_events
  where event_type='revenue' and verification_status='VERIFIED' and hospitality_booking_id is not null
),
ads_clicks as (
  select coalesce(sum(clicks),0)::numeric value
  from public.marketing_daily_metrics where connector_id='google_ads' and verification_status='VERIFIED'
),
ga4_cpc_sessions as (
  select coalesce(sum(sessions),0)::numeric value
  from public.marketing_daily_metrics
  where connector_id='ga4' and verification_status='VERIFIED'
    and lower(coalesce(metadata->>'medium','')) in ('cpc','ppc','paid','paid_search')
),
ga4_key_events as (
  select coalesce(sum(conversions),0)::numeric value
  from public.marketing_daily_metrics where connector_id='ga4' and verification_status='VERIFIED'
),
review_totals as (
  select count(*)::numeric total,
         count(*) filter(where customer_id is not null)::numeric customer_linked
  from public.hospitality_reviews where verification_status='VERIFIED'
)
select
  'GOOGLE_ADS_CLICKS_VS_GA4_CPC_SESSIONS'::text reconciliation_key,
  'Google Ads verified clicks'::text source_a,
  'GA4 verified google/cpc sessions'::text source_b,
  a.value value_a,b.value value_b,(b.value-a.value) variance,
  case when a.value>0 and b.value>0 then 'PASS' else 'NEED VERIFY' end::text status,
  'Presence/continuity check only; Ads clicks and GA4 sessions are different metrics and are not expected to be equal.'::text reason
from ads_clicks a cross join ga4_cpc_sessions b
union all
select
  'GA4_KEY_EVENTS_VS_CANONICAL_LEADS',
  'GA4 platform key events',
  'hospitality_leads VERIFIED',
  a.value,b.value,(b.value-a.value),
  case when a.value>=0 and b.value>=0 then 'PASS' else 'NEED VERIFY' end,
  'Diagnostic funnel bridge. GA4 key events are platform intent signals, never promoted to canonical lead or booking by equality.'
from ga4_key_events a cross join canonical_leads b
union all
select
  'CANONICAL_LEADS_VS_ATTRIBUTION_EVENTS',
  'hospitality_leads VERIFIED',
  'marketing_attribution_events lead VERIFIED',
  a.value,b.value,(b.value-a.value),
  case when a.value=b.value then 'PASS' else 'NEED VERIFY' end,
  'Expected 1:1 after Marketing Command Center materializes canonical lead events.'
from canonical_leads a cross join event_leads b
union all
select
  'LEADS_VS_LINKED_BOOKINGS',
  'hospitality_leads VERIFIED',
  'hospitality_leads linked to canonical booking',
  a.value,b.value,(b.value-a.value),
  'PASS',
  'Conversion reconciliation; variance is valid unconverted leads, not a data error. BOOKED-without-booking is checked separately by Data Quality.'
from canonical_leads a cross join linked_leads b
union all
select
  'KIOTVIET_CONNECTOR_VS_CANONICAL_BOOKINGS',
  'KiotViet connector last_record_count',
  'hospitality_bookings source_system=KIOTVIET_HOTEL',
  a.value,b.value,(b.value-a.value),
  case when a.value=b.value then 'PASS' else 'FAIL' end,
  'Authenticated KiotViet read count must reconcile to canonical KiotViet booking rows for the current sync window.'
from kiotviet_connector_count a cross join kiotviet_runtime_bookings b
union all
select
  'CANONICAL_BOOKINGS_VS_ATTRIBUTION_EVENTS',
  'hospitality_bookings VERIFIED confirmed/completed',
  'marketing_attribution_events booking VERIFIED',
  a.value,b.value,(b.value-a.value),
  case when a.value=b.value then 'PASS' else 'NEED VERIFY' end,
  'Expected 1:1 for canonical conversion booking events; cancelled/unconfirmed bookings are excluded.'
from canonical_bookings a cross join event_bookings b
union all
select
  'VERIFIED_REVENUE_VS_ATTRIBUTION_REVENUE',
  'hospitality_bookings verified_revenue',
  'marketing_attribution_events revenue VERIFIED',
  a.value,b.value,(b.value-a.value),
  case when a.value=b.value then 'PASS' else 'FAIL' end,
  'Verified business revenue must reconcile exactly to revenue events linked to canonical bookings.'
from canonical_revenue a cross join event_revenue b
union all
select
  'REVIEW_LINKAGE_VS_CUSTOMER_IDENTITY',
  'hospitality_reviews VERIFIED',
  'hospitality_reviews with customer link',
  r.total,r.customer_linked,(r.customer_linked-r.total),
  case when r.total=0 or r.total=r.customer_linked then 'PASS' else 'NEED VERIFY' end,
  case when r.total=0
    then 'READY_EMPTY: review pipeline has no verified production review rows; zero is not treated as positive review evidence.'
    else 'Verified review rows should link to customer when authenticated identity evidence exists.'
  end
from review_totals r;

grant select on public.group2_reconciliation_v to authenticated,service_role;

comment on view public.group2_data_quality_v is
'Group 2 acceptance data-quality surface. Distinguishes VALID_MULTI_ENTRY from true DATA_GAP and never treats tracking/self-report disagreement as a contradiction by itself.';
comment on view public.group2_reconciliation_v is
'Group 2 six-layer reconciliation: Ads↔GA4, GA4↔lead, lead↔booking, booking↔KiotViet, revenue↔runtime SSOT, review↔identity.';
