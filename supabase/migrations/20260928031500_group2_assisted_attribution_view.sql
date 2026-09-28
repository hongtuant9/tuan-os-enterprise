-- Group 2: evidence-based assisted attribution without duplicating revenue.
create or replace view public.marketing_assisted_attribution_v
with (security_invoker = true)
as
select
  touch.id as touch_event_id,
  revenue.id as revenue_event_id,
  touch.customer_id,
  touch.channel_id as assisted_channel_id,
  touch.source as assisted_source,
  touch.medium as assisted_medium,
  touch.utm_source,
  touch.utm_medium,
  touch.utm_campaign,
  touch.utm_content,
  touch.utm_term,
  touch.gclid,
  touch.gbraid,
  touch.wbraid,
  touch.landing_page,
  touch.ad_group,
  touch.ad,
  touch.occurred_at as assisted_touch_at,
  revenue.hospitality_booking_id,
  revenue.channel_id as conversion_channel_id,
  revenue.source as conversion_source,
  revenue.occurred_at as conversion_at,
  revenue.revenue_amount as verified_revenue,
  'ASSISTED_VERIFIED'::text as attribution_status
from public.marketing_attribution_events touch
join public.marketing_attribution_events revenue
  on revenue.customer_id=touch.customer_id
 and revenue.event_type='revenue'
 and revenue.verification_status='VERIFIED'
 and revenue.hospitality_booking_id is not null
 and revenue.occurred_at >= touch.occurred_at
where touch.customer_id is not null
  and touch.event_type in ('inquiry','lead')
  and touch.verification_status='VERIFIED'
  and (
    nullif(touch.gclid,'') is not null
    or nullif(touch.gbraid,'') is not null
    or nullif(touch.wbraid,'') is not null
    or nullif(touch.utm_source,'') is not null
    or nullif(touch.utm_campaign,'') is not null
  )
  and (
    touch.channel_id is distinct from revenue.channel_id
    or touch.source is distinct from revenue.source
  );

grant select on public.marketing_assisted_attribution_v to authenticated,service_role;

comment on view public.marketing_assisted_attribution_v is
'Evidence-based assisted touches preceding verified revenue for the same canonical customer. Revenue is referenced, not duplicated.';
