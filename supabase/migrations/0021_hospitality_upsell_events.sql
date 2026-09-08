-- Hospitality cross-sell attribution foundation.
-- Records internal eligibility/conversion evidence; does not send customer messages.

create table if not exists public.ai_upsell_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations (id) on delete cascade,
  booking_record_id uuid references public.ai_booking_records (id) on delete set null,
  rule_id text not null,
  offer_code text not null,
  journey_entry text not null check (journey_entry in ('HOMESTAY','COZY','EXPERIENCE','EXPLORE','GENERAL')),
  source_agent text not null,
  acquisition_source text,
  event_type text not null check (
    event_type in ('eligible','shown','accepted','booked','rejected','suppressed')
  ),
  amount numeric(14,2),
  currency text not null default 'VND',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_upsell_events enable row level security;

drop policy if exists "AI upsell events are viewable by authenticated users" on public.ai_upsell_events;
create policy "AI upsell events are viewable by authenticated users"
  on public.ai_upsell_events for select to authenticated using (true);
create index if not exists ai_upsell_events_conversation_created_idx
  on public.ai_upsell_events (conversation_id, created_at desc);

create index if not exists ai_upsell_events_offer_type_created_idx
  on public.ai_upsell_events (offer_code, event_type, created_at desc);

create index if not exists ai_upsell_events_journey_created_idx
  on public.ai_upsell_events (journey_entry, created_at desc);

comment on table public.ai_upsell_events is
  'Tam Coc Experience cross-sell attribution events. No outbound side effects.';
