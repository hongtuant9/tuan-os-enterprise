-- TCE Marketing Content Automation Foundation
-- Scope: Cozy Garden -> Facebook + Instagram MVP.
-- Safety: read-only/approval-gated by default; no auto-publish is enabled here.

alter table public.marketing_content_items
  add column if not exists journey_stage text,
  add column if not exists hook text,
  add column if not exists language text,
  add column if not exists asset_ids text[] not null default '{}',
  add column if not exists tracking_url text,
  add column if not exists approval_status text not null default 'PENDING',
  add column if not exists reviewed_by text,
  add column if not exists last_qa_at timestamptz;

insert into public.sync_sources (
  key,name,description,sheet_id,sheet_range,supports_incremental,schedule_enabled,schedule_interval_minutes
) values
('marketing-asset-index','TCE Marketing — Asset Index','Canonical media asset index for Marketing Content Automation.','1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw','ASSET_INDEX!A:N',true,true,15)
on conflict (key) do update set
  name=excluded.name,
  description=excluded.description,
  sheet_id=excluded.sheet_id,
  sheet_range=excluded.sheet_range,
  supports_incremental=excluded.supports_incremental,
  schedule_enabled=excluded.schedule_enabled,
  schedule_interval_minutes=excluded.schedule_interval_minutes,
  updated_at=now();

update public.sync_sources
set sheet_range='SHADOW_CONTENT_QUEUE!A:AI', updated_at=now()
where key='marketing-shadow-content';

create table if not exists public.marketing_channel_capabilities (
  channel_id text not null references public.marketing_channels(id) on delete cascade,
  capability text not null check (capability in (
    'READ_API','WRITE_API','MEDIA_UPLOAD','VIDEO_UPLOAD','SCHEDULING',
    'ANALYTICS','REVIEW_READ','REVIEW_REPLY','AUTH','RATE_LIMIT'
  )),
  status text not null default 'NEED_VERIFY' check (status in (
    'VERIFIED','READ_ONLY','WRITE_APPROVAL_REQUIRED','UNSUPPORTED','NEED_VERIFY','HOLD'
  )),
  provider text,
  evidence_source text,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (channel_id, capability)
);

create table if not exists public.marketing_content_variants (
  id uuid primary key default gen_random_uuid(),
  content_id text not null references public.marketing_content_items(content_id) on delete cascade,
  channel_id text not null references public.marketing_channels(id) on delete restrict,
  variant_key text not null,
  text_content text,
  cta text,
  destination_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  media_asset_ids text[] not null default '{}',
  qa_status text not null default 'PENDING' check (qa_status in ('PENDING','PASS','FAIL','HOLD')),
  approval_status text not null default 'PENDING' check (approval_status in ('PENDING','APPROVED','REJECTED','NOT_REQUIRED')),
  publish_status text not null default 'DRAFT' check (publish_status in ('DRAFT','READY','SCHEDULED','PUBLISHED','FAILED','HOLD')),
  scheduled_at timestamptz,
  published_at timestamptz,
  provider_post_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, channel_id, variant_key)
);

create table if not exists public.marketing_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  content_variant_id uuid not null references public.marketing_content_variants(id) on delete cascade,
  channel_id text not null references public.marketing_channels(id) on delete restrict,
  provider text not null,
  request_mode text not null default 'APPROVAL_REQUIRED' check (request_mode in ('APPROVAL_REQUIRED','MANUAL_NOTIFY','AUTO_APPROVED_LOW_RISK')),
  status text not null default 'PREPARED' check (status in ('PREPARED','APPROVAL_PENDING','SENT','READ_BACK_VERIFIED','FAILED','CANCELLED','HOLD')),
  approval_id text,
  provider_post_id text,
  provider_uuid text,
  attempted_at timestamptz,
  read_back_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_content_gate_results (
  id uuid primary key default gen_random_uuid(),
  content_variant_id uuid not null references public.marketing_content_variants(id) on delete cascade,
  gate text not null check (gate in ('FACT','BRAND','MEDIA','COPYRIGHT','PRIVACY','CTA','TRACKING','PLATFORM')),
  status text not null check (status in ('PASS','FAIL','HOLD','NEED_VERIFY')),
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  checked_by text,
  unique (content_variant_id, gate)
);

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_channel_capabilities','marketing_content_variants','marketing_publish_attempts'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_channel_capabilities','marketing_content_variants',
    'marketing_publish_attempts','marketing_content_gate_results'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('drop policy if exists "Marketing content authenticated select" on public.%I', t);
    execute format(
      'create policy "Marketing content authenticated select" on public.%I for select to authenticated using (true)',
      t
    );
  end loop;
end $$;

create index if not exists marketing_content_variants_channel_status_idx
  on public.marketing_content_variants(channel_id, publish_status, scheduled_at);

create index if not exists marketing_publish_attempts_variant_created_idx
  on public.marketing_publish_attempts(content_variant_id, created_at desc);

create index if not exists marketing_content_gate_results_variant_idx
  on public.marketing_content_gate_results(content_variant_id, gate);

-- Current verified provider evidence from Metricool brand connection.
-- Write remains approval-gated; these rows do not authorize publishing by themselves.
insert into public.marketing_channel_capabilities
(channel_id, capability, status, provider, evidence_source, verified_at, metadata) values
('facebook','AUTH','VERIFIED','metricool','Metricool brand settings connection',now(),'{"container_label":"Cozy Garden","business_scope":"TCE_MASTER"}'::jsonb),
('facebook','ANALYTICS','VERIFIED','metricool','Metricool analytics metric catalog',now(),'{"container_label":"Cozy Garden","business_scope":"TCE_MASTER"}'::jsonb),
('facebook','WRITE_API','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('facebook','MEDIA_UPLOAD','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('facebook','VIDEO_UPLOAD','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('facebook','SCHEDULING','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('instagram','AUTH','VERIFIED','metricool','Metricool brand settings connection',now(),'{"container_label":"Cozy Garden","business_scope":"TCE_MASTER"}'::jsonb),
('instagram','ANALYTICS','VERIFIED','metricool','Metricool analytics metric catalog',now(),'{"container_label":"Cozy Garden","business_scope":"TCE_MASTER"}'::jsonb),
('instagram','WRITE_API','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('instagram','MEDIA_UPLOAD','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('instagram','VIDEO_UPLOAD','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('instagram','SCHEDULING','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('google_maps','AUTH','VERIFIED','metricool','Metricool brand settings connection',now(),'{"container_label":"Cozy Garden","business_scope":"TCE_MASTER"}'::jsonb),
('google_maps','ANALYTICS','VERIFIED','metricool','Metricool analytics metric catalog',now(),'{"container_label":"Cozy Garden","business_scope":"TCE_MASTER"}'::jsonb),
('google_maps','WRITE_API','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler supports gmb provider',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('google_maps','MEDIA_UPLOAD','WRITE_APPROVAL_REQUIRED','metricool','Metricool gmb photo capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('google_maps','VIDEO_UPLOAD','WRITE_APPROVAL_REQUIRED','metricool','Metricool gmb photo/video capability',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb),
('google_maps','SCHEDULING','WRITE_APPROVAL_REQUIRED','metricool','Metricool scheduler supports gmb provider',now(),'{"publish_mode":"APPROVAL_REQUIRED"}'::jsonb)
on conflict (channel_id, capability) do update set
  status=excluded.status,
  provider=excluded.provider,
  evidence_source=excluded.evidence_source,
  verified_at=excluded.verified_at,
  metadata=excluded.metadata,
  updated_at=now();

create or replace view public.marketing_content_readiness_v
with (security_invoker = true) as
select
  v.id as content_variant_id,
  v.content_id,
  v.channel_id,
  v.variant_key,
  v.qa_status,
  v.approval_status,
  v.publish_status,
  count(g.*) filter (where g.status='PASS') as gates_passed,
  count(g.*) filter (where g.status in ('FAIL','HOLD','NEED_VERIFY')) as gates_blocking,
  bool_and(g.status='PASS') filter (where g.gate is not null) as all_recorded_gates_pass,
  (
    v.qa_status='PASS'
    and v.approval_status='APPROVED'
    and count(g.*) filter (where g.status='PASS') = 8
    and count(g.*) filter (where g.status in ('FAIL','HOLD','NEED_VERIFY')) = 0
  ) as ready_for_approval_gated_publish
from public.marketing_content_variants v
left join public.marketing_content_gate_results g on g.content_variant_id=v.id
group by v.id;

grant select on public.marketing_content_readiness_v to authenticated;
