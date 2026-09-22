-- TCE Marketing Data-Ready V2
-- Additive only: prepares measurement contracts, channel entities, attribution joins,
-- authoritative revenue links, phase readiness and AI optimization guardrails.

create table if not exists public.marketing_event_contracts (
  event_key text primary key,
  phase smallint not null check (phase between 1 and 4),
  funnel_stage text not null,
  display_name text not null,
  source_authority text not null,
  verification_rule text not null,
  required_identity jsonb not null default '[]'::jsonb,
  revenue_semantics text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_channel_entities (
  entity_key text primary key,
  channel_id text not null references public.marketing_channels(id) on delete cascade,
  connector_id text references public.marketing_connectors(id) on delete set null,
  business_scope text not null,
  external_account_id text,
  external_entity_id text,
  canonical_url text,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_channel_entities_channel_idx
  on public.marketing_channel_entities(channel_id);
create index if not exists marketing_channel_entities_connector_idx
  on public.marketing_channel_entities(connector_id)
  where connector_id is not null;

create table if not exists public.marketing_journeys (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text,
  session_id text,
  customer_id uuid references public.hospitality_customers(id) on delete set null,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  booking_record_id uuid references public.ai_booking_records(id) on delete set null,
  journey_state text not null default 'TRAFFIC'
    check (journey_state in ('TRAFFIC','INTENT','LEAD','BOOKING','REVENUE','CLOSED')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_journeys_session_uniq
  on public.marketing_journeys(session_id)
  where session_id is not null;
create index if not exists marketing_journeys_customer_idx
  on public.marketing_journeys(customer_id, last_seen_at desc)
  where customer_id is not null;
create index if not exists marketing_journeys_conversation_idx
  on public.marketing_journeys(conversation_id)
  where conversation_id is not null;
create index if not exists marketing_journeys_booking_idx
  on public.marketing_journeys(booking_record_id)
  where booking_record_id is not null;

create table if not exists public.marketing_revenue_links (
  id uuid primary key default gen_random_uuid(),
  external_revenue_key text not null unique,
  source_connector_id text not null references public.marketing_connectors(id) on delete restrict,
  booking_record_id uuid references public.ai_booking_records(id) on delete set null,
  customer_id uuid references public.hospitality_customers(id) on delete set null,
  channel_id text references public.marketing_channels(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  occurred_at timestamptz not null,
  revenue_amount numeric(16,2) not null default 0 check (revenue_amount >= 0),
  collected_amount numeric(16,2) not null default 0 check (collected_amount >= 0),
  currency text not null default 'VND',
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  source_reference text,
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_revenue_links_booking_idx
  on public.marketing_revenue_links(booking_record_id, occurred_at desc)
  where booking_record_id is not null;
create index if not exists marketing_revenue_links_channel_idx
  on public.marketing_revenue_links(channel_id, occurred_at desc)
  where channel_id is not null;

alter table public.marketing_attribution_events
  add column if not exists journey_id uuid references public.marketing_journeys(id) on delete set null,
  add column if not exists session_id text,
  add column if not exists anonymous_id text,
  add column if not exists landing_url text,
  add column if not exists referrer text,
  add column if not exists gclid text,
  add column if not exists fbclid text,
  add column if not exists provider_event_id text,
  add column if not exists revenue_link_id uuid references public.marketing_revenue_links(id) on delete set null,
  add column if not exists value_semantics text;

create index if not exists marketing_attribution_journey_idx
  on public.marketing_attribution_events(journey_id, occurred_at desc)
  where journey_id is not null;
create index if not exists marketing_attribution_session_idx
  on public.marketing_attribution_events(session_id, occurred_at desc)
  where session_id is not null;
create index if not exists marketing_attribution_revenue_link_idx
  on public.marketing_attribution_events(revenue_link_id)
  where revenue_link_id is not null;

create table if not exists public.marketing_optimization_rules (
  rule_key text primary key,
  category text not null
    check (category in ('MEASUREMENT','CHANNEL','CAMPAIGN','FUNNEL','ATTRIBUTION','CONTENT','MARKET','BUDGET')),
  enabled boolean not null default true,
  recent_days integer not null default 7 check (recent_days between 1 and 90),
  baseline_days integer not null default 28 check (baseline_days between 1 and 365),
  minimum_sample integer not null default 1 check (minimum_sample >= 0),
  threshold jsonb not null default '{}'::jsonb,
  default_severity text not null default 'WATCH'
    check (default_severity in ('INFO','WATCH','ACTION','STOP')),
  recommended_action text not null,
  action_class text not null default 'ANALYSIS_ONLY'
    check (action_class in ('ANALYSIS_ONLY','SAFE_INTERNAL','PUBLIC_MUTATION','FINANCIAL_MUTATION')),
  approval_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_anomalies (
  fingerprint text primary key,
  rule_key text not null references public.marketing_optimization_rules(rule_key) on delete restrict,
  dimension_type text not null
    check (dimension_type in ('SYSTEM','CONNECTOR','CHANNEL','CAMPAIGN','FUNNEL','ATTRIBUTION')),
  dimension_id text,
  metric_key text not null,
  window_start date not null,
  window_end date not null,
  observed_value numeric,
  baseline_value numeric,
  deviation_ratio numeric,
  sample_size bigint not null default 0 check (sample_size >= 0),
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  severity text not null default 'WATCH'
    check (severity in ('INFO','WATCH','ACTION','STOP')),
  evidence jsonb not null default '{}'::jsonb,
  recommended_action text not null,
  action_class text not null default 'ANALYSIS_ONLY'
    check (action_class in ('ANALYSIS_ONLY','SAFE_INTERNAL','PUBLIC_MUTATION','FINANCIAL_MUTATION')),
  approval_required boolean not null default false,
  status text not null default 'OPEN'
    check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','EXPIRED')),
  first_detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_anomalies_status_seen_idx
  on public.marketing_anomalies(status, last_seen_at desc);
create index if not exists marketing_anomalies_dimension_idx
  on public.marketing_anomalies(dimension_type, dimension_id, last_seen_at desc);

create table if not exists public.marketing_phase_readiness (
  phase smallint primary key check (phase between 1 and 4),
  phase_key text not null unique,
  system_state text not null default 'PREPARED'
    check (system_state in ('PREPARED','READY','BLOCKED')),
  data_state text not null default 'WAITING_DATA'
    check (data_state in ('WAITING_DATA','READY','BLOCKED')),
  required_connectors jsonb not null default '[]'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_event_contracts','marketing_channel_entities','marketing_journeys',
    'marketing_revenue_links','marketing_optimization_rules','marketing_anomalies'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_event_contracts','marketing_channel_entities','marketing_journeys',
    'marketing_revenue_links','marketing_optimization_rules','marketing_anomalies',
    'marketing_phase_readiness'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Marketing Data Ready authenticated select" on public.%I', t);
    execute format('create policy "Marketing Data Ready authenticated select" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

insert into public.marketing_event_contracts
(event_key,phase,funnel_stage,display_name,source_authority,verification_rule,required_identity,revenue_semantics,metadata)
values
('website_page_view',1,'TRAFFIC','Website page view','GA4 / Website runtime','Accept only source-tagged runtime/GA4 event; never synthesize counts.','["session_id"]'::jsonb,null,'{"data_class":"actual"}'::jsonb),
('website_book_click',1,'INTENT','Website booking CTA click','GA4 + Website runtime','Requires real CTA event with timestamp and landing context.','["session_id"]'::jsonb,null,'{"canonical_event":"website_book_click"}'::jsonb),
('website_whatsapp_click',1,'INTENT','Website WhatsApp click','GA4 + Website runtime','Requires real CTA event with timestamp and landing context.','["session_id"]'::jsonb,null,'{"canonical_event":"website_whatsapp_click"}'::jsonb),
('website_directions_click',1,'INTENT','Website directions click','GA4 + Website runtime','Requires real CTA event with timestamp and landing context.','["session_id"]'::jsonb,null,'{"canonical_event":"website_directions_click"}'::jsonb),
('lead_created',1,'LEAD','Lead / inquiry created','Hospitality CRM + AI Receptionist','VERIFIED only when customer or conversation identity exists in runtime.','["customer_id","conversation_id"]'::jsonb,null,'{"dedupe":"external_event_key"}'::jsonb),
('booking_verified',3,'BOOKING','Verified booking','AI booking runtime + authoritative booking evidence','VERIFIED only when booking_record verification_status is verified.','["booking_record_id"]'::jsonb,'Booking value is not collected revenue.','{"fail_closed":true}'::jsonb),
('revenue_verified',3,'REVENUE','Verified revenue','KiotViet Hotel/F&B Actual','VERIFIED only through marketing_revenue_links with authoritative connector evidence.','["revenue_link_id"]'::jsonb,'Revenue and collected cash remain separate fields.','{"fail_closed":true}'::jsonb)
on conflict (event_key) do update set
  phase=excluded.phase, funnel_stage=excluded.funnel_stage, display_name=excluded.display_name,
  source_authority=excluded.source_authority, verification_rule=excluded.verification_rule,
  required_identity=excluded.required_identity, revenue_semantics=excluded.revenue_semantics,
  metadata=excluded.metadata, updated_at=now();

insert into public.marketing_optimization_rules
(rule_key,category,enabled,recent_days,baseline_days,minimum_sample,threshold,default_severity,recommended_action,action_class,approval_required,metadata)
values
('ATTRIBUTION_COVERAGE_LOW','ATTRIBUTION',true,7,28,10,'{"min_coverage":0.80}'::jsonb,'ACTION','Audit UTM/source capture and journey linkage before comparing channel efficiency.','SAFE_INTERNAL',false,'{"guardrail":"control heuristic, not KPI target"}'::jsonb),
('CAMPAIGN_CTR_DROP','CAMPAIGN',true,7,28,500,'{"max_negative_deviation":-0.35}'::jsonb,'WATCH','Inspect creative, audience, placement and tracking; propose a controlled test. Do not auto-pause or change spend.','ANALYSIS_ONLY',false,'{"sample_metric":"impressions","guardrail":"relative baseline only"}'::jsonb),
('CAMPAIGN_BOOKING_RATE_DROP','CAMPAIGN',true,7,28,15,'{"max_negative_deviation":-0.35}'::jsonb,'ACTION','Inspect lead quality, offer and booking handoff; propose a controlled funnel test.','SAFE_INTERNAL',false,'{"sample_metric":"leads_verified","guardrail":"relative baseline only"}'::jsonb),
('FUNNEL_CLICK_TO_LEAD_DROP','FUNNEL',true,7,28,50,'{"max_negative_deviation":-0.30}'::jsonb,'ACTION','Audit landing page, CTA, form/chat handoff and source capture.','SAFE_INTERNAL',false,'{"sample_metric":"clicks","guardrail":"relative baseline only"}'::jsonb),
('FUNNEL_LEAD_TO_BOOKING_DROP','FUNNEL',true,7,28,15,'{"max_negative_deviation":-0.30}'::jsonb,'ACTION','Audit qualification, response time, availability, price/offer handoff and booking verification.','SAFE_INTERNAL',false,'{"sample_metric":"leads_verified","guardrail":"relative baseline only"}'::jsonb),
('CHANNEL_SESSION_ANOMALY','CHANNEL',true,7,28,30,'{"absolute_deviation":0.50}'::jsonb,'WATCH','Check connector freshness, campaign changes, website availability and source mix before acting.','ANALYSIS_ONLY',false,'{"sample_metric":"sessions","guardrail":"relative baseline only"}'::jsonb),
('CONNECTOR_STALE_OR_ERROR','MEASUREMENT',true,1,1,0,'{"freshness_required":true}'::jsonb,'ACTION','Repair connector/auth/sync and restore read-back before using affected KPI.','SAFE_INTERNAL',false,'{"fail_closed":true}'::jsonb)
on conflict (rule_key) do update set
  category=excluded.category, enabled=excluded.enabled, recent_days=excluded.recent_days,
  baseline_days=excluded.baseline_days, minimum_sample=excluded.minimum_sample,
  threshold=excluded.threshold, default_severity=excluded.default_severity,
  recommended_action=excluded.recommended_action, action_class=excluded.action_class,
  approval_required=excluded.approval_required, metadata=excluded.metadata, updated_at=now();

insert into public.marketing_phase_readiness
(phase,phase_key,system_state,data_state,required_connectors,checks,blockers,metadata)
values
(1,'MEASUREMENT_FOUNDATION','PREPARED','WAITING_DATA',
 '["ga4","hospitality_crm","ai_receptionist","kiotviet_hotel","kiotviet_fnb","google_ads","meta_ads"]'::jsonb,
 '{"event_contracts":true,"idempotency":true,"data_health":true}'::jsonb,'[]'::jsonb,
 '{"scope":"GA4 + Website + CRM + AI Receptionist + KiotViet + Google Ads/Meta Actual"}'::jsonb),
(2,'CHANNEL','PREPARED','WAITING_DATA',
 '["facebook_organic","instagram_organic","google_business_profile","booking_runtime","agoda_runtime","airbnb_runtime","expedia_runtime","tripadvisor_runtime"]'::jsonb,
 '{"channel_entity_registry":true,"read_only_default":true,"write_approval_gate":true}'::jsonb,'[]'::jsonb,
 '{"scope":"Facebook/Instagram Organic + GBP + OTA + Tripadvisor"}'::jsonb),
(3,'ATTRIBUTION','PREPARED','WAITING_DATA',
 '["hospitality_crm","ai_receptionist","kiotviet_hotel","kiotviet_fnb"]'::jsonb,
 '{"journey_table":true,"attribution_events":true,"revenue_link_authority":true,"dedupe_key":true}'::jsonb,'[]'::jsonb,
 '{"scope":"Traffic → Lead → Booking → Revenue"}'::jsonb),
(4,'AI_OPTIMIZATION','PREPARED','WAITING_DATA',
 '[]'::jsonb,
 '{"rule_registry":true,"minimum_sample_guard":true,"anomaly_log":true,"approval_gate":true}'::jsonb,'[]'::jsonb,
 '{"scope":"campaign weakness + funnel leak + channel anomaly → recommendation only"}'::jsonb)
on conflict (phase) do update set
  phase_key=excluded.phase_key, required_connectors=excluded.required_connectors,
  checks=excluded.checks, metadata=excluded.metadata, checked_at=now();

create or replace view public.marketing_verified_revenue_v
with (security_invoker = true) as
select
  r.id,
  r.external_revenue_key,
  r.source_connector_id,
  r.booking_record_id,
  r.customer_id,
  r.channel_id,
  r.campaign_id,
  r.occurred_at,
  r.revenue_amount,
  r.collected_amount,
  r.currency,
  r.source_reference,
  r.evidence
from public.marketing_revenue_links r
where r.verification_status = 'VERIFIED';

create or replace view public.marketing_funnel_daily_v
with (security_invoker = true) as
select
  (e.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date as metric_date,
  coalesce(e.channel_id,'unknown') as channel_id,
  count(*) filter (where e.event_type='session' and e.verification_status in ('VERIFIED','PARTIAL'))::bigint as traffic_events,
  count(*) filter (where e.event_type in ('inquiry','lead') and e.verification_status='VERIFIED')::bigint as leads_verified,
  count(*) filter (where e.event_type='booking' and e.verification_status='VERIFIED')::bigint as bookings_verified,
  coalesce(sum(e.revenue_amount) filter (
    where e.event_type='revenue' and e.verification_status='VERIFIED' and e.revenue_link_id is not null
  ),0)::numeric(16,2) as revenue_verified
from public.marketing_attribution_events e
group by 1,2;

create or replace view public.marketing_attribution_coverage_v
with (security_invoker = true) as
select
  (e.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date as metric_date,
  count(*) filter (where e.event_type in ('inquiry','lead','booking','upsell','revenue'))::bigint as attributable_events,
  count(*) filter (
    where e.event_type in ('inquiry','lead','booking','upsell','revenue')
      and (
        nullif(e.utm_source,'') is not null
        or nullif(e.utm_campaign,'') is not null
        or nullif(e.source,'') is not null
        or e.journey_id is not null
      )
  )::bigint as tagged_events,
  case
    when count(*) filter (where e.event_type in ('inquiry','lead','booking','upsell','revenue')) = 0 then null
    else (
      count(*) filter (
        where e.event_type in ('inquiry','lead','booking','upsell','revenue')
          and (
            nullif(e.utm_source,'') is not null
            or nullif(e.utm_campaign,'') is not null
            or nullif(e.source,'') is not null
            or e.journey_id is not null
          )
      )::numeric
      /
      count(*) filter (where e.event_type in ('inquiry','lead','booking','upsell','revenue'))::numeric
    )
  end as coverage
from public.marketing_attribution_events e
group by 1;

grant select on public.marketing_verified_revenue_v to authenticated;
grant select on public.marketing_funnel_daily_v to authenticated;
grant select on public.marketing_attribution_coverage_v to authenticated;
