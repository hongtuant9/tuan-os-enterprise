-- Group 2: Customer & Revenue Attribution Foundation
-- Additive, fail-closed schema hardening. No destructive changes.

create table if not exists public.hospitality_leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.hospitality_customers(id) on delete set null,
  conversation_id uuid unique references public.ai_conversations(id) on delete set null,
  booking_record_id uuid references public.ai_booking_records(id) on delete set null,
  channel text,
  source text,
  primary_intent text,
  lead_status text not null default 'INQUIRY'
    check (lead_status in ('INQUIRY','LEAD','QUALIFIED_LEAD','BOOKING_INTENT','BOOKED','LOST','SUPPORT','COMPLAINT')),
  verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lead_status <> 'BOOKED' or booking_record_id is not null)
);

alter table public.hospitality_leads enable row level security;
drop policy if exists "Hospitality leads viewable by authenticated users" on public.hospitality_leads;
create policy "Hospitality leads viewable by authenticated users"
  on public.hospitality_leads for select to authenticated using (true);
grant select on public.hospitality_leads to authenticated;
grant select, insert, update, delete on public.hospitality_leads to service_role;
create index if not exists hospitality_leads_customer_created_idx
  on public.hospitality_leads(customer_id, created_at desc) where customer_id is not null;
create index if not exists hospitality_leads_status_created_idx
  on public.hospitality_leads(lead_status, created_at desc);
drop trigger if exists set_updated_at on public.hospitality_leads;
create trigger set_updated_at before update on public.hospitality_leads
for each row execute procedure public.set_updated_at();

alter table public.hospitality_customers
  add column if not exists first_touch_source text,
  add column if not exists first_touch_at timestamptz,
  add column if not exists last_touch_source text,
  add column if not exists last_touch_at timestamptz,
  add column if not exists journey_entry text,
  add column if not exists booking_count integer not null default 0,
  add column if not exists stay_count integer not null default 0,
  add column if not exists total_verified_revenue numeric(16,2) not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists last_booking_at timestamptz,
  add column if not exists loyalty_status text not null default 'unknown'
    check (loyalty_status in ('unknown','first_time','repeat_customer','repeat_stay')),
  add column if not exists verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD'));

alter table public.ai_conversations
  add column if not exists source text,
  add column if not exists primary_intent text,
  add column if not exists secondary_intents text[] not null default '{}'::text[],
  add column if not exists journey_entry text,
  add column if not exists requested_dates jsonb not null default '{}'::jsonb,
  add column if not exists guest_count integer,
  add column if not exists lead_status text not null default 'INQUIRY'
    check (lead_status in ('INQUIRY','LEAD','QUALIFIED_LEAD','BOOKING_INTENT','BOOKED','LOST','SUPPORT','COMPLAINT')),
  add column if not exists routed_agent text,
  add column if not exists human_handoff boolean not null default false,
  add column if not exists escalation_reason text,
  add column if not exists outcome text,
  add column if not exists booking_record_id uuid references public.ai_booking_records(id) on delete set null,
  add column if not exists self_reported_source text,
  add column if not exists verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD'));

alter table public.ai_booking_records
  add column if not exists lead_id uuid references public.hospitality_leads(id) on delete set null,
  add column if not exists consumed_at timestamptz,
  add column if not exists verified_revenue numeric(16,2),
  add column if not exists revenue_verified_at timestamptz;

alter table public.marketing_attribution_events
  add column if not exists lead_id uuid references public.hospitality_leads(id) on delete set null,
  add column if not exists attribution_status text not null default 'NEED_VERIFY'
    check (attribution_status in ('DIRECT_VERIFIED','ASSISTED_VERIFIED','SELF_REPORTED','INFERRED','UNATTRIBUTED','NEED_VERIFY')),
  add column if not exists journey_entry text,
  add column if not exists landing_page text,
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists utm_term text,
  add column if not exists ad_group text,
  add column if not exists ad text,
  add column if not exists self_reported_source text;

alter table public.cozy_review_clicks
  add column if not exists customer_id uuid references public.hospitality_customers(id) on delete set null,
  add column if not exists booking_record_id uuid references public.ai_booking_records(id) on delete set null,
  add column if not exists property_id uuid references public.properties(id) on delete set null,
  add column if not exists response_status text,
  add column if not exists issue_category text,
  add column if not exists verification_status text not null default 'NEED_VERIFY'
    check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD'));

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
  if new.guest_count is null and coalesce(new.metadata->>'guest_count','') ~ '^\d+$' then
    new.guest_count := (new.metadata->>'guest_count')::integer;
  end if;
  if new.customer_id is not null and new.verification_status = 'NEED_VERIFY' then
    new.verification_status := 'VERIFIED';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_conversations_foundation_fields on public.ai_conversations;
create trigger ai_conversations_foundation_fields
before insert or update on public.ai_conversations
for each row execute function public.set_ai_conversation_foundation_fields();

update public.ai_conversations
set
  source = coalesce(nullif(source,''), nullif(metadata->>'acquisition_source',''), channel),
  primary_intent = coalesce(nullif(primary_intent,''), nullif(intent,'')),
  journey_entry = coalesce(nullif(journey_entry,''), nullif(metadata->>'journey_entry','')),
  self_reported_source = coalesce(nullif(self_reported_source,''), nullif(metadata->>'self_reported_source','')),
  guest_count = case
    when guest_count is not null then guest_count
    when coalesce(metadata->>'guest_count','') ~ '^\d+$' then (metadata->>'guest_count')::integer
    else null
  end,
  verification_status = case when customer_id is not null then 'VERIFIED' else 'NEED_VERIFY' end;

update public.marketing_attribution_events
set attribution_status = case
  when verification_status = 'VERIFIED' and (
    nullif(utm_source,'') is not null or nullif(utm_campaign,'') is not null
    or nullif(source,'') is not null
  ) then 'DIRECT_VERIFIED'
  when verification_status in ('PARTIAL','NEED_VERIFY','HOLD') then 'NEED_VERIFY'
  else 'UNATTRIBUTED'
end
where attribution_status = 'NEED_VERIFY';

-- Existing CRM metrics incorrectly treated every conversation as a verified lead.
-- Reset lead metrics until canonical lead records exist.
update public.marketing_daily_metrics
set leads_platform = 0,
    leads_verified = 0,
    verification_status = case when verification_status = 'VERIFIED' then 'PARTIAL' else verification_status end,
    metadata = coalesce(metadata,'{}'::jsonb) || '{"lead_semantics":"canonical hospitality_leads only; conversations are inquiries"}'::jsonb
where connector_id = 'hospitality_crm';

create or replace view public.hospitality_customer_profile_v
with (security_invoker = true)
as
select
  c.id as customer_id,
  c.display_name,
  c.preferred_language,
  c.country_code,
  c.lifecycle_status,
  c.first_seen_at,
  c.last_seen_at,
  c.first_touch_source,
  c.first_touch_at,
  c.last_touch_source,
  c.last_touch_at,
  c.journey_entry,
  c.booking_count,
  c.stay_count,
  c.total_verified_revenue,
  c.review_count,
  c.last_booking_at,
  c.loyalty_status,
  c.verification_status,
  (select i.identity_value from public.hospitality_customer_identities i
    where i.customer_id=c.id and i.identity_type='phone'
    order by i.is_primary desc,i.verified_at desc nulls last,i.created_at asc limit 1) as phone,
  (select i.identity_value from public.hospitality_customer_identities i
    where i.customer_id=c.id and i.identity_type='email'
    order by i.is_primary desc,i.verified_at desc nulls last,i.created_at asc limit 1) as email
from public.hospitality_customers c;

grant select on public.hospitality_customer_profile_v to authenticated, service_role;

create or replace view public.marketing_attribution_quality_v
with (security_invoker = true)
as
select
  occurred_at::date as event_date,
  event_type,
  count(*)::bigint as total_events,
  count(*) filter (where verification_status='VERIFIED')::bigint as verified_events,
  count(*) filter (where customer_id is not null)::bigint as customer_linked,
  count(*) filter (where lead_id is not null)::bigint as lead_linked,
  count(*) filter (where booking_record_id is not null)::bigint as booking_linked,
  count(*) filter (where revenue_amount > 0 and verification_status='VERIFIED')::bigint as verified_revenue_events,
  count(*) filter (where attribution_status in ('UNATTRIBUTED','NEED_VERIFY'))::bigint as unattributed_or_unverified
from public.marketing_attribution_events
group by occurred_at::date,event_type;

grant select on public.marketing_attribution_quality_v to authenticated, service_role;

comment on table public.hospitality_leads is 'Canonical evidence-based lead entity. Inquiry/conversation is not a lead unless a lead record exists.';
comment on column public.marketing_attribution_events.attribution_status is 'Source attribution certainty; INFERRED/SELF_REPORTED are never equivalent to VERIFIED.';
comment on view public.marketing_attribution_quality_v is 'Data-quality reconciliation surface for attribution linkage and verification.';
