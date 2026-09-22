-- TCE Marketing Command Center V1
-- Four-phase foundation: Measurement -> Channels -> Attribution -> AI Optimization.
-- Read-only by default. No provider spend/bid/public mutation is enabled here.

create table if not exists public.marketing_channels (
  id text primary key,
  display_name text not null,
  channel_group text not null check (channel_group in ('owned','google','meta','ota','messaging','email','offline','runtime')),
  channel_type text not null default 'acquisition' check (channel_type in ('acquisition','retention','conversion','reputation','measurement','runtime')),
  business_scope text not null default 'TCE',
  status text not null default 'PLANNED' check (status in ('LIVE','READY','PLANNED','HOLD','NEED_VERIFY','INACTIVE')),
  write_policy text not null default 'READ_ONLY' check (write_policy in ('READ_ONLY','APPROVAL_GATED','DISABLED')),
  canonical_source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_connectors (
  id text primary key,
  channel_id text references public.marketing_channels(id) on delete set null,
  display_name text not null,
  provider text not null,
  source_type text not null check (source_type in ('api','runtime','sheet_plan','manual_evidence')),
  status text not null default 'NOT_CONNECTED' check (status in ('LIVE','READY','NOT_CONNECTED','NEED_VERIFY','ERROR','HOLD','INACTIVE')),
  auth_state text not null default 'NOT_REQUIRED' check (auth_state in ('VERIFIED','NEED_AUTH','NEED_REAUTH','NOT_REQUIRED','UNKNOWN')),
  read_mode text not null default 'READ_ONLY',
  write_mode text not null default 'DISABLED' check (write_mode in ('DISABLED','APPROVAL_GATED')),
  refresh_interval_minutes int not null default 60 check (refresh_interval_minutes >= 5),
  freshness_sla_minutes int not null default 180 check (freshness_sla_minutes >= 5),
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_record_count int not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references public.marketing_channels(id) on delete restrict,
  connector_id text references public.marketing_connectors(id) on delete set null,
  provider_campaign_id text,
  plan_campaign_id text,
  name text not null,
  objective text,
  audience text,
  funnel_stage text,
  status text not null default 'PLANNED' check (status in ('PLANNED','ACTIVE','PAUSED','COMPLETED','HOLD','DEMO_ONLY','ARCHIVED')),
  budget_mode text not null default 'NO_SPEND' check (budget_mode in ('NO_SPEND','PROPOSAL_ONLY','APPROVED_LIMIT','PROVIDER_ACTUAL')),
  budget_amount numeric(16,2),
  currency text not null default 'VND',
  start_date date,
  end_date date,
  utm_campaign text,
  source_authority text,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_campaigns_provider_key_uq
  on public.marketing_campaigns(connector_id, provider_campaign_id)
  where connector_id is not null and provider_campaign_id is not null;
create unique index if not exists marketing_campaigns_plan_key_uq
  on public.marketing_campaigns(plan_campaign_id)
  where plan_campaign_id is not null;

create table if not exists public.marketing_daily_metrics (
  metric_key text primary key,
  metric_date date not null,
  channel_id text not null references public.marketing_channels(id) on delete restrict,
  connector_id text not null references public.marketing_connectors(id) on delete restrict,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  provider_campaign_id text,
  impressions bigint not null default 0 check (impressions >= 0),
  reach bigint not null default 0 check (reach >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  engagements bigint not null default 0 check (engagements >= 0),
  sessions bigint not null default 0 check (sessions >= 0),
  leads_platform bigint not null default 0 check (leads_platform >= 0),
  leads_verified bigint not null default 0 check (leads_verified >= 0),
  bookings_verified bigint not null default 0 check (bookings_verified >= 0),
  conversions bigint not null default 0 check (conversions >= 0),
  spend numeric(16,2) not null default 0 check (spend >= 0),
  attributed_revenue numeric(16,2) not null default 0 check (attributed_revenue >= 0),
  currency text not null default 'VND',
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists marketing_daily_metrics_date_channel_idx
  on public.marketing_daily_metrics(metric_date desc, channel_id);
create index if not exists marketing_daily_metrics_campaign_idx
  on public.marketing_daily_metrics(campaign_id, metric_date desc)
  where campaign_id is not null;

create table if not exists public.marketing_attribution_events (
  id uuid primary key default gen_random_uuid(),
  external_event_key text not null unique,
  occurred_at timestamptz not null,
  customer_id uuid references public.hospitality_customers(id) on delete set null,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  booking_record_id uuid references public.ai_booking_records(id) on delete set null,
  upsell_event_id uuid references public.ai_upsell_events(id) on delete set null,
  channel_id text references public.marketing_channels(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  event_type text not null check (event_type in ('session','engagement','inquiry','lead','booking','upsell','revenue')),
  touch_type text not null default 'DIRECT' check (touch_type in ('FIRST','ASSISTED','LAST','DIRECT','UNKNOWN')),
  source text,
  medium text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  revenue_amount numeric(16,2) not null default 0 check (revenue_amount >= 0),
  currency text not null default 'VND',
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  evidence_source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_attribution_customer_idx
  on public.marketing_attribution_events(customer_id, occurred_at desc)
  where customer_id is not null;
create index if not exists marketing_attribution_campaign_idx
  on public.marketing_attribution_events(campaign_id, occurred_at desc)
  where campaign_id is not null;
create index if not exists marketing_attribution_utm_idx
  on public.marketing_attribution_events(utm_source, utm_campaign, occurred_at desc);

create table if not exists public.marketing_content_items (
  content_id text primary key,
  brand text,
  pillar text,
  objective text,
  format text,
  channel_id text references public.marketing_channels(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  publish_status text not null default 'PLANNED',
  verification_status text not null default 'NEED_VERIFY',
  scheduled_at timestamptz,
  published_at timestamptz,
  provider_post_id text,
  destination_url text,
  utm_campaign text,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connector_id text not null references public.marketing_connectors(id) on delete restrict,
  run_type text not null default 'scheduled' check (run_type in ('scheduled','manual','backfill','runtime')),
  status text not null default 'running' check (status in ('running','success','partial','failed','skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_read int not null default 0,
  records_written int not null default 0,
  records_skipped int not null default 0,
  cursor text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists marketing_sync_runs_connector_started_idx
  on public.marketing_sync_runs(connector_id, started_at desc);

create table if not exists public.marketing_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommendation_key text not null unique,
  category text not null check (category in ('MEASUREMENT','CHANNEL','CAMPAIGN','FUNNEL','ATTRIBUTION','CONTENT','MARKET','BUDGET')),
  severity text not null default 'INFO' check (severity in ('INFO','WATCH','ACTION','STOP')),
  title text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  recommended_action text not null,
  action_class text not null default 'ANALYSIS_ONLY' check (action_class in ('ANALYSIS_ONLY','SAFE_INTERNAL','PUBLIC_MUTATION','FINANCIAL_MUTATION')),
  approval_required boolean not null default false,
  approval_id text,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','APPROVED','REJECTED','COMPLETED','EXPIRED')),
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_report_snapshots (
  report_key text primary key,
  period_type text not null check (period_type in ('DAY','WEEK','MONTH','YEAR','CUSTOM')),
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null default now(),
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','PARTIAL','NEED_VERIFY','HOLD')),
  summary jsonb not null default '{}'::jsonb,
  source_health jsonb not null default '{}'::jsonb,
  notes jsonb not null default '[]'::jsonb
);

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_channels','marketing_connectors','marketing_campaigns',
    'marketing_content_items','marketing_recommendations'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_channels','marketing_connectors','marketing_campaigns','marketing_daily_metrics',
    'marketing_attribution_events','marketing_content_items','marketing_sync_runs',
    'marketing_recommendations','marketing_report_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Marketing MCC authenticated select" on public.%I', t);
    execute format('create policy "Marketing MCC authenticated select" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

insert into public.marketing_channels (id,display_name,channel_group,channel_type,status,write_policy,canonical_source) values
('website','Website / GA4','owned','measurement','READY','READ_ONLY','GA4 + website events'),
('google_search','Google Search Organic','google','acquisition','READY','READ_ONLY','GA4'),
('google_maps','Google Maps / Business Profile','google','acquisition','NEED_VERIFY','APPROVAL_GATED','Google Business Profile API'),
('google_ads','Google Ads','google','acquisition','NEED_VERIFY','APPROVAL_GATED','Google Ads API'),
('facebook','Facebook','meta','acquisition','READY','APPROVAL_GATED','Meta / Metricool'),
('instagram','Instagram','meta','acquisition','NEED_VERIFY','APPROVAL_GATED','Meta / Metricool'),
('booking','Booking.com','ota','acquisition','NEED_VERIFY','APPROVAL_GATED','Booking runtime/extranet'),
('agoda','Agoda','ota','acquisition','NEED_VERIFY','APPROVAL_GATED','Agoda runtime/extranet'),
('airbnb','Airbnb','ota','acquisition','NEED_VERIFY','APPROVAL_GATED','Airbnb runtime'),
('expedia','Expedia','ota','acquisition','NEED_VERIFY','APPROVAL_GATED','Expedia runtime'),
('tripadvisor','Tripadvisor','ota','reputation','NEED_VERIFY','APPROVAL_GATED','Tripadvisor runtime'),
('email','Email','email','retention','PLANNED','APPROVAL_GATED','CRM'),
('whatsapp','WhatsApp','messaging','conversion','READY','APPROVAL_GATED','CRM / AI Receptionist'),
('zalo','Zalo','messaging','conversion','NEED_VERIFY','APPROVAL_GATED','CRM / AI Receptionist'),
('referral','Referral / Offline','offline','acquisition','READY','READ_ONLY','CRM attribution'),
('hospitality_crm','Hospitality CRM','runtime','runtime','LIVE','READ_ONLY','Supabase runtime'),
('ai_receptionist','AI Lễ Tân','runtime','runtime','LIVE','READ_ONLY','Supabase runtime'),
('kiotviet_hotel','KiotViet Hotel','runtime','conversion','LIVE','READ_ONLY','KiotViet Hotel API'),
('kiotviet_fnb','KiotViet F&B','runtime','conversion','LIVE','READ_ONLY','KiotViet F&B API')
on conflict (id) do update set
  display_name=excluded.display_name, channel_group=excluded.channel_group, channel_type=excluded.channel_type,
  status=excluded.status, write_policy=excluded.write_policy, canonical_source=excluded.canonical_source, updated_at=now();

insert into public.marketing_connectors
(id,channel_id,display_name,provider,source_type,status,auth_state,read_mode,write_mode,refresh_interval_minutes,freshness_sla_minutes,metadata) values
('ga4','website','Google Analytics 4','google','api','READY','VERIFIED','READ_ONLY','DISABLED',15,60,'{"phase":1}'::jsonb),
('google_ads','google_ads','Google Ads','google','api','NOT_CONNECTED','NEED_AUTH','READ_ONLY','APPROVAL_GATED',60,180,'{"phase":1}'::jsonb),
('meta_ads','facebook','Meta Ads','meta','api','NOT_CONNECTED','NEED_AUTH','READ_ONLY','APPROVAL_GATED',60,180,'{"phase":1}'::jsonb),
('facebook_organic','facebook','Facebook Organic','meta','api','NEED_VERIFY','UNKNOWN','READ_ONLY','APPROVAL_GATED',60,180,'{"phase":2}'::jsonb),
('instagram_organic','instagram','Instagram Organic','meta','api','NOT_CONNECTED','NEED_AUTH','READ_ONLY','APPROVAL_GATED',60,180,'{"phase":2}'::jsonb),
('google_business_profile','google_maps','Google Business Profile','google','api','NOT_CONNECTED','NEED_AUTH','READ_ONLY','APPROVAL_GATED',360,1440,'{"phase":2}'::jsonb),
('booking_runtime','booking','Booking.com Runtime','booking','api','NOT_CONNECTED','UNKNOWN','READ_ONLY','APPROVAL_GATED',360,1440,'{"phase":2}'::jsonb),
('agoda_runtime','agoda','Agoda Runtime','agoda','api','NOT_CONNECTED','UNKNOWN','READ_ONLY','APPROVAL_GATED',360,1440,'{"phase":2}'::jsonb),
('airbnb_runtime','airbnb','Airbnb Runtime','airbnb','api','NOT_CONNECTED','UNKNOWN','READ_ONLY','APPROVAL_GATED',360,1440,'{"phase":2}'::jsonb),
('expedia_runtime','expedia','Expedia Runtime','expedia','api','NOT_CONNECTED','UNKNOWN','READ_ONLY','APPROVAL_GATED',360,1440,'{"phase":2}'::jsonb),
('tripadvisor_runtime','tripadvisor','Tripadvisor Runtime','tripadvisor','api','NOT_CONNECTED','UNKNOWN','READ_ONLY','APPROVAL_GATED',360,1440,'{"phase":2}'::jsonb),
('hospitality_crm','hospitality_crm','Hospitality CRM','tuan_os','runtime','LIVE','NOT_REQUIRED','READ_ONLY','DISABLED',15,60,'{"phase":1}'::jsonb),
('ai_receptionist','ai_receptionist','AI Receptionist Runtime','tuan_os','runtime','LIVE','NOT_REQUIRED','READ_ONLY','DISABLED',15,60,'{"phase":1}'::jsonb),
('kiotviet_hotel','kiotviet_hotel','KiotViet Hotel Revenue','kiotviet','api','LIVE','VERIFIED','READ_ONLY','DISABLED',60,180,'{"phase":3}'::jsonb),
('kiotviet_fnb','kiotviet_fnb','KiotViet F&B Revenue','kiotviet','api','LIVE','VERIFIED','READ_ONLY','DISABLED',60,180,'{"phase":3}'::jsonb),
('cmo_campaign_plan',null,'CMO Campaign Portfolio Plan','google_sheets','sheet_plan','READY','VERIFIED','READ_ONLY','DISABLED',15,60,'{"phase":"planning"}'::jsonb),
('cmo_content_plan',null,'CMO Content Queue Plan','google_sheets','sheet_plan','READY','VERIFIED','READ_ONLY','DISABLED',15,60,'{"phase":"planning"}'::jsonb)
on conflict (id) do update set
  channel_id=excluded.channel_id, display_name=excluded.display_name, provider=excluded.provider,
  source_type=excluded.source_type, read_mode=excluded.read_mode, write_mode=excluded.write_mode,
  refresh_interval_minutes=excluded.refresh_interval_minutes, freshness_sla_minutes=excluded.freshness_sla_minutes,
  metadata=excluded.metadata, updated_at=now();

insert into public.sync_sources (
  key,name,description,sheet_id,sheet_range,supports_incremental,schedule_enabled,schedule_interval_minutes
) values
('marketing-campaign-plan','TCE Marketing — Campaign Portfolio','CMO plan mirror only; not Actual metrics.','1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw','03_CAMPAIGN_PORTFOLIO!A:N',true,true,15),
('marketing-channel-plan','TCE Marketing — Channel Portfolio','CMO channel plan mirror only.','1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw','01_CHANNEL_PORTFOLIO!A:I',true,true,15),
('marketing-action-plan','TCE Marketing — Action Register','CMO action plan mirror only.','1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw','07_ACTION_REGISTER!A:N',true,true,15),
('marketing-market-intelligence','TCE Marketing — Market Intelligence','CMO market evidence/plan mirror.','1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw','02_MARKET_INTELLIGENCE!A:N',true,true,60),
('marketing-shadow-content','TCE Marketing — Shadow Content Queue','CMO content plan mirror only.','1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw','SHADOW_CONTENT_QUEUE!A:N',true,true,15)
on conflict (key) do update set
  name=excluded.name, description=excluded.description, sheet_id=excluded.sheet_id, sheet_range=excluded.sheet_range,
  supports_incremental=excluded.supports_incremental, schedule_enabled=excluded.schedule_enabled,
  schedule_interval_minutes=excluded.schedule_interval_minutes, updated_at=now();

create or replace view public.marketing_channel_performance_v
with (security_invoker = true) as
select
  m.metric_date,
  m.channel_id,
  c.display_name as channel_name,
  sum(m.impressions)::bigint as impressions,
  sum(m.reach)::bigint as reach,
  sum(m.clicks)::bigint as clicks,
  sum(m.engagements)::bigint as engagements,
  sum(m.sessions)::bigint as sessions,
  sum(m.leads_verified)::bigint as leads_verified,
  sum(m.bookings_verified)::bigint as bookings_verified,
  sum(m.spend)::numeric(16,2) as spend,
  sum(m.attributed_revenue)::numeric(16,2) as attributed_revenue,
  case when sum(m.leads_verified) > 0 then sum(m.spend) / sum(m.leads_verified) else null end as cpa,
  case when sum(m.spend) > 0 then sum(m.attributed_revenue) / sum(m.spend) else null end as roas,
  case
    when bool_and(m.verification_status = 'VERIFIED') then 'VERIFIED'
    when bool_or(m.verification_status in ('VERIFIED','PARTIAL')) then 'PARTIAL'
    else 'NEED_VERIFY'
  end as verification_status
from public.marketing_daily_metrics m
join public.marketing_channels c on c.id=m.channel_id
group by m.metric_date,m.channel_id,c.display_name;

create or replace view public.marketing_campaign_performance_v
with (security_invoker = true) as
select
  c.id as campaign_id,
  c.name,
  c.channel_id,
  c.status,
  c.budget_mode,
  c.budget_amount,
  c.currency,
  coalesce(sum(m.impressions),0)::bigint as impressions,
  coalesce(sum(m.clicks),0)::bigint as clicks,
  coalesce(sum(m.leads_verified),0)::bigint as leads_verified,
  coalesce(sum(m.bookings_verified),0)::bigint as bookings_verified,
  coalesce(sum(m.spend),0)::numeric(16,2) as spend,
  coalesce(sum(m.attributed_revenue),0)::numeric(16,2) as attributed_revenue,
  case when coalesce(sum(m.spend),0) > 0 then sum(m.attributed_revenue)/sum(m.spend) else null end as roas,
  c.verification_status,
  c.last_synced_at
from public.marketing_campaigns c
left join public.marketing_daily_metrics m on m.campaign_id=c.id
group by c.id;

create or replace view public.marketing_data_health_v
with (security_invoker = true) as
select
  c.id as connector_id,
  c.display_name,
  c.provider,
  c.status,
  c.auth_state,
  c.read_mode,
  c.write_mode,
  c.refresh_interval_minutes,
  c.freshness_sla_minutes,
  c.last_sync_at,
  c.last_success_at,
  c.last_record_count,
  c.last_error,
  case
    when c.status in ('NOT_CONNECTED','NEED_VERIFY','HOLD','INACTIVE') then c.status
    when c.status='ERROR' then 'ERROR'
    when c.last_success_at is null then 'NEED_VERIFY'
    when extract(epoch from (now()-c.last_success_at))/60 > c.freshness_sla_minutes then 'STALE'
    else 'FRESH'
  end as health_state
from public.marketing_connectors c;

grant select on public.marketing_channel_performance_v to authenticated;
grant select on public.marketing_campaign_performance_v to authenticated;
grant select on public.marketing_data_health_v to authenticated;
