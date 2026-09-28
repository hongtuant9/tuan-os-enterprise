-- Group 2 production hardening: enforce one active MCC cycle and clear stale rows.
update public.marketing_sync_runs
set status='failed',
    completed_at=coalesce(completed_at,now()),
    error_code=coalesce(error_code,'STALE_RUNTIME_RUN'),
    error_message=coalesce(error_message,'Auto-closed before enabling single active runtime cycle.')
where connector_id='hospitality_crm'
  and status='running';

create unique index if not exists marketing_sync_runs_one_running_per_connector_idx
  on public.marketing_sync_runs(connector_id)
  where status='running';


create or replace view public.group2_data_quality_v
with (security_invoker = true)
as
select 'customer_without_resolvable_identity'::text as issue_type, count(*)::bigint as issue_count
from public.hospitality_customers c
where not exists (
  select 1
  from public.hospitality_customer_identities i
  where i.customer_id=c.id
    and (
      (i.identity_type in ('phone','email') and i.verified_at is not null)
      or i.identity_type in ('facebook','instagram','zalo','whatsapp','website','ota','kiotviet_customer_id','other')
    )
)
union all
select 'booking_without_customer', count(*)::bigint
from public.hospitality_bookings where customer_id is null
union all
select 'completed_booking_without_verified_revenue', count(*)::bigint
from public.hospitality_bookings
where booking_status='COMPLETED' and revenue_verification_status<>'VERIFIED'
union all
select 'lead_without_customer', count(*)::bigint
from public.hospitality_leads where customer_id is null
union all
select 'review_without_customer', count(*)::bigint
from public.hospitality_reviews where customer_id is null
union all
select 'verified_revenue_without_booking_link', count(*)::bigint
from public.marketing_attribution_events
where event_type='revenue' and verification_status='VERIFIED'
  and hospitality_booking_id is null and booking_record_id is null;

grant select on public.group2_data_quality_v to authenticated,service_role;
