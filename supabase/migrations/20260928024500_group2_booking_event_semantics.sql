-- Group 2 semantic cleanup: only confirmed/completed KiotViet bookings are booking conversion events.
delete from public.marketing_attribution_events e
using public.hospitality_bookings b
where e.hospitality_booking_id=b.id
  and e.event_type='booking'
  and e.external_event_key like 'kiotviet-booking:%'
  and b.booking_status not in ('CONFIRMED','COMPLETED');

create or replace view public.group2_attribution_gate_v
with (security_invoker = true)
as
with booking_totals as (
  select
    count(*) filter (where verification_status='VERIFIED' and booking_status in ('CONFIRMED','COMPLETED'))::bigint as verified_bookings,
    count(*) filter (where revenue_verification_status='VERIFIED')::bigint as revenue_linked_bookings,
    coalesce(sum(verified_revenue) filter (where revenue_verification_status='VERIFIED'),0)::numeric as verified_revenue
  from public.hospitality_bookings
),
attribution_totals as (
  select
    count(*) filter (
      where event_type='revenue' and verification_status='VERIFIED'
        and attribution_status in ('DIRECT_VERIFIED','ASSISTED_VERIFIED')
        and hospitality_booking_id is not null
    )::bigint as attributed_revenue_events,
    coalesce(sum(revenue_amount) filter (
      where event_type='revenue' and verification_status='VERIFIED'
        and attribution_status in ('DIRECT_VERIFIED','ASSISTED_VERIFIED')
        and hospitality_booking_id is not null
    ),0)::numeric as attributed_verified_revenue,
    count(*) filter (
      where event_type='revenue' and verification_status='VERIFIED'
        and channel_id in ('google_ads','meta_ads')
        and hospitality_booking_id is not null
        and (nullif(gclid,'') is not null or nullif(gbraid,'') is not null or nullif(wbraid,'') is not null
          or nullif(utm_source,'') is not null or nullif(utm_campaign,'') is not null)
    )::bigint as paid_verified_revenue_events
  from public.marketing_attribution_events
),
connector_state as (
  select
    bool_or(id='ga4' and status='LIVE' and auth_state='VERIFIED') as ga4_live,
    bool_or(id='google_ads' and status='LIVE' and auth_state='VERIFIED') as google_ads_live,
    bool_or(id='kiotviet_hotel' and status='LIVE' and auth_state='VERIFIED') as kiotviet_hotel_live
  from public.marketing_connectors
),
core_reconciliation as (
  select
    bool_and(status='PASS') as all_pass
  from public.group2_reconciliation_v
  where reconciliation_key in (
    'CANONICAL_LEADS_VS_ATTRIBUTION_EVENTS',
    'CANONICAL_BOOKINGS_VS_ATTRIBUTION_EVENTS',
    'VERIFIED_REVENUE_VS_ATTRIBUTION_REVENUE'
  )
)
select
  b.verified_bookings,
  b.revenue_linked_bookings,
  b.verified_revenue,
  a.attributed_revenue_events,
  a.attributed_verified_revenue,
  case when b.verified_revenue>0 then a.attributed_verified_revenue/b.verified_revenue else null end as attribution_coverage,
  a.paid_verified_revenue_events,
  c.ga4_live,
  c.google_ads_live,
  c.kiotviet_hotel_live,
  case
    when not coalesce(c.kiotviet_hotel_live,false) then 'HOLD'
    when not coalesce(r.all_pass,false) then 'HOLD'
    when b.verified_bookings=0 then 'NEED VERIFY'
    when b.verified_revenue<=0 then 'NEED VERIFY'
    else 'VERIFIED'
  end::text as foundation_data_status,
  case
    when a.paid_verified_revenue_events>0 and coalesce(c.google_ads_live,false) then true
    else false
  end as paid_cac_roas_ready
from booking_totals b
cross join attribution_totals a
cross join connector_state c
cross join core_reconciliation r;

grant select on public.group2_attribution_gate_v to authenticated,service_role;
