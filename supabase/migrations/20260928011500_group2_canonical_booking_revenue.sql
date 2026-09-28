-- Group 2 completion: canonical hospitality booking + verified revenue linkage.
-- Additive only. KiotViet remains READ-ONLY; this schema stores authenticated runtime evidence.

create table if not exists public.hospitality_bookings (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('KIOTVIET_HOTEL','AI_DIRECT')),
  source_booking_uuid text not null,
  source_booking_code text,
  source_customer_id text,
  property_id uuid references public.properties(id) on delete set null,
  sale_channel_id text,
  sale_channel_name text,
  booking_status text not null check (booking_status in ('CONFIRMED','COMPLETED','CANCELLED','UNCONFIRMED','UNKNOWN')),
  source_created_at timestamptz,
  source_modified_at timestamptz,
  purchase_at timestamptz,
  check_in date,
  check_out date,
  adults integer not null default 1 check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  room_count integer not null default 1 check (room_count >= 0),
  room_names jsonb not null default '[]'::jsonb,
  customer_id uuid references public.hospitality_customers(id) on delete set null,
  ai_booking_record_id uuid references public.ai_booking_records(id) on delete set null,
  gross_amount numeric(16,2) not null default 0 check (gross_amount >= 0),
  collected_amount numeric(16,2) not null default 0 check (collected_amount >= 0),
  verified_revenue numeric(16,2) not null default 0 check (verified_revenue >= 0),
  currency text not null default 'VND',
  consumed_at timestamptz,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  revenue_verification_status text not null default 'NEED_VERIFY'
    check (revenue_verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_booking_uuid),
  check (check_out is null or check_in is null or check_out >= check_in)
);

alter table public.hospitality_bookings enable row level security;
drop policy if exists "Hospitality bookings viewable by authenticated users" on public.hospitality_bookings;
create policy "Hospitality bookings viewable by authenticated users"
  on public.hospitality_bookings for select to authenticated using (true);
grant select on public.hospitality_bookings to authenticated;
grant select, insert, update, delete on public.hospitality_bookings to service_role;
drop trigger if exists set_updated_at on public.hospitality_bookings;
create trigger set_updated_at before update on public.hospitality_bookings
for each row execute procedure public.set_updated_at();

create index if not exists hospitality_bookings_customer_purchase_idx
  on public.hospitality_bookings(customer_id, purchase_at desc) where customer_id is not null;
create index if not exists hospitality_bookings_status_purchase_idx
  on public.hospitality_bookings(booking_status, purchase_at desc);
create index if not exists hospitality_bookings_source_code_idx
  on public.hospitality_bookings(source_booking_code) where source_booking_code is not null;

alter table public.hospitality_customer_identities
  drop constraint if exists hospitality_customer_identities_identity_type_check;
alter table public.hospitality_customer_identities
  add constraint hospitality_customer_identities_identity_type_check
  check (identity_type in ('phone','email','whatsapp','facebook','instagram','zalo','website','ota','kiotviet_customer_id','other'));

alter table public.ai_conversations
  add column if not exists hospitality_booking_id uuid references public.hospitality_bookings(id) on delete set null;
alter table public.hospitality_leads
  add column if not exists hospitality_booking_id uuid references public.hospitality_bookings(id) on delete set null;
alter table public.marketing_attribution_events
  add column if not exists hospitality_booking_id uuid references public.hospitality_bookings(id) on delete set null;
alter table public.cozy_review_clicks
  add column if not exists hospitality_booking_id uuid references public.hospitality_bookings(id) on delete set null;

create index if not exists marketing_attribution_hospitality_booking_idx
  on public.marketing_attribution_events(hospitality_booking_id, occurred_at desc)
  where hospitality_booking_id is not null;

create or replace function public.refresh_hospitality_customer_booking_rollup(p_customer_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bookings integer;
  v_stays integer;
  v_revenue numeric(16,2);
  v_last timestamptz;
begin
  if p_customer_id is null then return; end if;

  select
    count(*) filter (
      where verification_status='VERIFIED'
        and booking_status in ('CONFIRMED','COMPLETED')
    )::integer,
    count(*) filter (
      where verification_status='VERIFIED'
        and booking_status='COMPLETED'
        and consumed_at is not null
    )::integer,
    coalesce(sum(verified_revenue) filter (
      where revenue_verification_status='VERIFIED'
    ),0),
    max(coalesce(purchase_at,source_created_at))
  into v_bookings,v_stays,v_revenue,v_last
  from public.hospitality_bookings
  where customer_id=p_customer_id;

  update public.hospitality_customers
  set booking_count=v_bookings,
      stay_count=v_stays,
      total_verified_revenue=v_revenue,
      last_booking_at=v_last,
      loyalty_status=case
        when v_stays >= 2 then 'repeat_stay'
        when v_bookings >= 2 then 'repeat_customer'
        when v_bookings >= 1 then 'first_time'
        else 'unknown'
      end,
      updated_at=now()
  where id=p_customer_id;
end;
$$;

create or replace function public.hospitality_booking_rollup_trigger()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op='DELETE' then
    perform public.refresh_hospitality_customer_booking_rollup(old.customer_id);
    return old;
  end if;
  perform public.refresh_hospitality_customer_booking_rollup(new.customer_id);
  if tg_op='UPDATE' and old.customer_id is distinct from new.customer_id then
    perform public.refresh_hospitality_customer_booking_rollup(old.customer_id);
  end if;
  return new;
end;
$$;

drop trigger if exists hospitality_booking_customer_rollup on public.hospitality_bookings;
create trigger hospitality_booking_customer_rollup
after insert or update or delete on public.hospitality_bookings
for each row execute function public.hospitality_booking_rollup_trigger();

-- customer_id on a conversation is linkage evidence, not sufficient identity verification.
create or replace function public.set_ai_conversation_foundation_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.source := coalesce(nullif(new.source,''), nullif(new.metadata->>'acquisition_source',''), new.channel);
  new.primary_intent := coalesce(nullif(new.primary_intent,''), nullif(new.intent,''));
  new.journey_entry := coalesce(nullif(new.journey_entry,''), nullif(new.metadata->>'journey_entry',''));
  new.self_reported_source := coalesce(nullif(new.self_reported_source,''), nullif(new.metadata->>'self_reported_source',''));
  new.routed_agent := coalesce(nullif(new.routed_agent,''), nullif(new.metadata->>'routed_agent',''));
  if (new.requested_dates is null or new.requested_dates='{}'::jsonb)
     and (nullif(new.metadata->>'check_in','') is not null or nullif(new.metadata->>'check_out','') is not null) then
    new.requested_dates := jsonb_strip_nulls(jsonb_build_object(
      'check_in', nullif(new.metadata->>'check_in',''),
      'check_out', nullif(new.metadata->>'check_out','')
    ));
  end if;
  if new.guest_count is null and coalesce(new.metadata->>'guest_count','') ~ '^\\d+$' then
    new.guest_count := (new.metadata->>'guest_count')::integer;
  end if;
  return new;
end;
$$;



create or replace function public.apply_customer_attribution_touch()
returns trigger
language plpgsql
set search_path = public
as $touch$
declare
  effective_source text;
begin
  if new.customer_id is null then
    return new;
  end if;
  if new.attribution_status not in ('DIRECT_VERIFIED','ASSISTED_VERIFIED','SELF_REPORTED') then
    return new;
  end if;

  effective_source := case
    when new.attribution_status='SELF_REPORTED'
      then nullif(new.self_reported_source,'')
    else coalesce(nullif(new.source,''),nullif(new.utm_source,''))
  end;
  if effective_source is null then
    return new;
  end if;

  update public.hospitality_customers c
  set
    first_touch_source = case
      when c.first_touch_at is null or new.occurred_at < c.first_touch_at then effective_source
      else c.first_touch_source
    end,
    first_touch_at = case
      when c.first_touch_at is null or new.occurred_at < c.first_touch_at then new.occurred_at
      else c.first_touch_at
    end,
    last_touch_source = case
      when c.last_touch_at is null or new.occurred_at >= c.last_touch_at then effective_source
      else c.last_touch_source
    end,
    last_touch_at = case
      when c.last_touch_at is null or new.occurred_at >= c.last_touch_at then new.occurred_at
      else c.last_touch_at
    end,
    journey_entry = coalesce(c.journey_entry,nullif(new.journey_entry,'')),
    updated_at=now()
  where c.id=new.customer_id;
  return new;
end;
$touch$;

-- Repair historical overstatement: only preserve VERIFIED when explicit verified identity exists.
update public.ai_conversations c
set verification_status='NEED_VERIFY'
where c.verification_status='VERIFIED'
  and c.customer_id is not null
  and not exists (
    select 1 from public.hospitality_customer_identities i
    where i.customer_id=c.customer_id and i.verified_at is not null
  );

update public.marketing_attribution_events e
set attribution_status=case
      when nullif(e.self_reported_source,'') is not null then 'SELF_REPORTED'
      else 'NEED_VERIFY'
    end,
    verification_status=case
      when e.verification_status='VERIFIED' then 'PARTIAL'
      else e.verification_status
    end
where e.event_type='inquiry'
  and e.attribution_status in ('DIRECT_VERIFIED','ASSISTED_VERIFIED')
  and not (
    nullif(e.gclid,'') is not null or nullif(e.gbraid,'') is not null or nullif(e.wbraid,'') is not null
    or nullif(e.utm_source,'') is not null or nullif(e.utm_campaign,'') is not null
  );

create or replace view public.hospitality_booking_reconciliation_v
with (security_invoker = true)
as
select
  hb.id as hospitality_booking_id,
  hb.source_system,
  hb.source_booking_uuid,
  hb.source_booking_code,
  hb.source_customer_id,
  hb.sale_channel_id,
  hb.sale_channel_name,
  hb.booking_status,
  hb.customer_id,
  hb.purchase_at,
  hb.check_in,
  hb.check_out,
  hb.gross_amount,
  hb.collected_amount,
  hb.verified_revenue,
  hb.verification_status,
  hb.revenue_verification_status,
  (hb.customer_id is not null) as customer_linked,
  (hb.revenue_verification_status='VERIFIED') as revenue_linked,
  hb.evidence,
  hb.updated_at
from public.hospitality_bookings hb;

grant select on public.hospitality_booking_reconciliation_v to authenticated, service_role;


create table if not exists public.hospitality_reviews (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_review_id text,
  customer_id uuid references public.hospitality_customers(id) on delete set null,
  hospitality_booking_id uuid references public.hospitality_bookings(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  entity_name text,
  platform text not null,
  review_date timestamptz,
  rating numeric(3,2),
  review_text text,
  review_reference text,
  response_status text,
  issue_category text,
  sentiment text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_review_id),
  check (rating is null or (rating >= 0 and rating <= 10))
);
alter table public.hospitality_reviews enable row level security;
drop policy if exists "Hospitality reviews viewable by authenticated users" on public.hospitality_reviews;
create policy "Hospitality reviews viewable by authenticated users"
  on public.hospitality_reviews for select to authenticated using (true);
grant select on public.hospitality_reviews to authenticated;
grant select, insert, update, delete on public.hospitality_reviews to service_role;
drop trigger if exists set_updated_at on public.hospitality_reviews;
create trigger set_updated_at before update on public.hospitality_reviews
for each row execute procedure public.set_updated_at();
create index if not exists hospitality_reviews_customer_date_idx
  on public.hospitality_reviews(customer_id,review_date desc) where customer_id is not null;
create index if not exists hospitality_reviews_booking_idx
  on public.hospitality_reviews(hospitality_booking_id) where hospitality_booking_id is not null;

create or replace function public.refresh_hospitality_customer_review_rollup(p_customer_id uuid)
returns void
language plpgsql
security invoker
set search_path=public
as $
begin
  if p_customer_id is null then return; end if;
  update public.hospitality_customers c
  set review_count=(
        select count(*)::integer from public.hospitality_reviews r
        where r.customer_id=p_customer_id and r.verification_status='VERIFIED'
      ),
      updated_at=now()
  where c.id=p_customer_id;
end;
$;

create or replace function public.hospitality_review_rollup_trigger()
returns trigger
language plpgsql
security invoker
set search_path=public
as $
begin
  if tg_op='DELETE' then
    perform public.refresh_hospitality_customer_review_rollup(old.customer_id);
    return old;
  end if;
  perform public.refresh_hospitality_customer_review_rollup(new.customer_id);
  if tg_op='UPDATE' and old.customer_id is distinct from new.customer_id then
    perform public.refresh_hospitality_customer_review_rollup(old.customer_id);
  end if;
  return new;
end;
$;
drop trigger if exists hospitality_review_customer_rollup on public.hospitality_reviews;
create trigger hospitality_review_customer_rollup
after insert or update or delete on public.hospitality_reviews
for each row execute function public.hospitality_review_rollup_trigger();

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
    else mc.channel_id
  end as metric_scope,
  case
    when mc.id in ('kiotviet_hotel','kiotviet_fnb') then 'AUTHENTICATED_RUNTIME_SSOT'
    when mc.id in ('ga4','google_ads') then 'AUTHENTICATED_PLATFORM_EVIDENCE'
    when mc.id in ('hospitality_crm','ai_receptionist') then 'TUAN_OS_CANONICAL_RUNTIME'
    else 'CHANNEL_EVIDENCE'
  end as authority_class,
  mc.read_mode,
  mc.write_mode,
  mc.last_success_at as freshness_at,
  case
    when mc.status='LIVE' and mc.auth_state in ('VERIFIED','NOT_REQUIRED') then 'VERIFIED'
    when mc.status='ERROR' then 'HOLD'
    else 'NEED_VERIFY'
  end as verification_status,
  mc.metadata
from public.marketing_connectors mc;
grant select on public.marketing_source_map_v to authenticated,service_role;

create or replace view public.marketing_attribution_quality_v
with (security_invoker = true)
as
select
  occurred_at::date as event_date,
  event_type,
  count(*) as total_events,
  count(*) filter (where verification_status='VERIFIED') as verified_events,
  count(*) filter (where customer_id is not null) as customer_linked,
  count(*) filter (where lead_id is not null) as lead_linked,
  count(*) filter (where booking_record_id is not null or hospitality_booking_id is not null) as booking_linked,
  count(*) filter (where revenue_amount>0 and verification_status='VERIFIED') as verified_revenue_events,
  count(*) filter (where attribution_status in ('UNATTRIBUTED','NEED_VERIFY')) as unattributed_or_unverified
from public.marketing_attribution_events
group by occurred_at::date,event_type;
grant select on public.marketing_attribution_quality_v to authenticated,service_role;

create or replace view public.group2_data_quality_v
with (security_invoker = true)
as
select 'customer_without_verified_identity'::text as issue_type, count(*)::bigint as issue_count
from public.hospitality_customers c
where not exists (
  select 1 from public.hospitality_customer_identities i
  where i.customer_id=c.id and i.verified_at is not null
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


create or replace view public.group2_reconciliation_v
with (security_invoker = true)
as
with
canonical_leads as (
  select count(*)::numeric as value
  from public.hospitality_leads
  where verification_status='VERIFIED'
),
event_leads as (
  select count(*)::numeric as value
  from public.marketing_attribution_events
  where event_type='lead' and verification_status='VERIFIED'
),
canonical_bookings as (
  select count(*)::numeric as value
  from public.hospitality_bookings
  where verification_status='VERIFIED'
    and booking_status in ('CONFIRMED','COMPLETED')
),
event_bookings as (
  select count(*)::numeric as value
  from public.marketing_attribution_events
  where event_type='booking' and verification_status='VERIFIED'
    and hospitality_booking_id is not null
),
canonical_revenue as (
  select coalesce(sum(verified_revenue),0)::numeric as value
  from public.hospitality_bookings
  where revenue_verification_status='VERIFIED'
),
event_revenue as (
  select coalesce(sum(revenue_amount),0)::numeric as value
  from public.marketing_attribution_events
  where event_type='revenue' and verification_status='VERIFIED'
    and hospitality_booking_id is not null
),
ads_clicks as (
  select coalesce(sum(clicks),0)::numeric as value
  from public.marketing_daily_metrics
  where connector_id='google_ads' and verification_status='VERIFIED'
),
ga4_sessions as (
  select coalesce(sum(sessions),0)::numeric as value
  from public.marketing_daily_metrics
  where connector_id='ga4' and verification_status='VERIFIED'
)
select
  'CANONICAL_LEADS_VS_ATTRIBUTION_EVENTS'::text as reconciliation_key,
  'hospitality_leads VERIFIED'::text as source_a,
  'marketing_attribution_events lead VERIFIED'::text as source_b,
  a.value as value_a,
  b.value as value_b,
  (b.value-a.value) as variance,
  case when a.value=b.value then 'PASS' else 'NEED VERIFY' end::text as status,
  'Expected 1:1 after Marketing Command Center cycle materializes canonical lead events.'::text as reason
from canonical_leads a cross join event_leads b
union all
select
  'CANONICAL_BOOKINGS_VS_ATTRIBUTION_EVENTS',
  'hospitality_bookings VERIFIED confirmed/completed',
  'marketing_attribution_events booking VERIFIED',
  a.value,b.value,(b.value-a.value),
  case when a.value=b.value then 'PASS' else 'NEED VERIFY' end,
  'Expected 1:1 for canonical booking events; cancelled/unconfirmed bookings are excluded.'
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
  'GOOGLE_ADS_CLICKS_VS_GA4_SESSIONS',
  'Google Ads clicks',
  'GA4 sessions',
  a.value,b.value,(b.value-a.value),
  'NEED VERIFY',
  'Diagnostic reconciliation only: clicks and sessions are different metrics and are not expected to be equal; investigate large discontinuities by date/campaign.'
from ads_clicks a cross join ga4_sessions b;

grant select on public.group2_reconciliation_v to authenticated,service_role;

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
    when b.verified_bookings=0 then 'NEED VERIFY'
    when b.verified_revenue<=0 then 'NEED VERIFY'
    when exists(select 1 from public.group2_reconciliation_v where status='FAIL') then 'HOLD'
    else 'VERIFIED'
  end::text as foundation_data_status,
  case
    when a.paid_verified_revenue_events>0 and coalesce(c.google_ads_live,false) then true
    else false
  end as paid_cac_roas_ready
from booking_totals b cross join attribution_totals a cross join connector_state c;

grant select on public.group2_attribution_gate_v to authenticated,service_role;

comment on table public.hospitality_reviews is
'Canonical review/loyalty evidence across TCE entities. Review-to-customer/booking linkage remains nullable until evidence exists.';

comment on table public.hospitality_bookings is
'Canonical hospitality booking runtime entity. KiotViet/OTA bookings must not be inserted into ai_booking_records unless actually created by AI_DIRECT.';
comment on column public.hospitality_bookings.verified_revenue is
'Revenue proven by authenticated invoice evidence linked through source booking UUID; never quoted booking value.';
