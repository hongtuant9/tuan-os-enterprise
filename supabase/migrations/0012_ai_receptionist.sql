-- AI Booking, Concierge & Experience Agent — Private Pilot schema.
-- The operational database stores conversations, decisions and audit references.
-- KiotViet Hotel remains the system of record for live room inventory and bookings.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  channel text not null check (channel in ('website', 'facebook', 'zalo', 'whatsapp', 'instagram', 'pilot')),
  external_conversation_id text not null,
  customer_name text,
  customer_contact text,
  language text not null default 'vi',
  intent text not null default 'booking',
  status text not null default 'new' check (
    status in ('new', 'active', 'waiting_guest', 'needs_manager', 'booking_created', 'closed')
  ),
  mode text not null default 'simulation' check (
    mode in ('off', 'simulation', 'shadow', 'limited_auto', 'live')
  ),
  last_message_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_conversation_id)
);

alter table public.ai_conversations enable row level security;

drop policy if exists "AI conversations are viewable by authenticated users" on public.ai_conversations;
create policy "AI conversations are viewable by authenticated users"
  on public.ai_conversations for select
  to authenticated
  using (true);

drop trigger if exists set_updated_at on public.ai_conversations;
create trigger set_updated_at before update on public.ai_conversations
  for each row execute procedure public.set_updated_at();

create index if not exists ai_conversations_status_last_message_idx
  on public.ai_conversations (status, last_message_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  sender_type text not null check (sender_type in ('guest', 'ai', 'manager', 'system')),
  content text not null,
  status text not null default 'received' check (
    status in ('received', 'draft', 'simulated', 'sent', 'failed')
  ),
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_messages enable row level security;

drop policy if exists "AI messages are viewable by authenticated users" on public.ai_messages;
create policy "AI messages are viewable by authenticated users"
  on public.ai_messages for select
  to authenticated
  using (true);

create unique index if not exists ai_messages_external_message_id_unique
  on public.ai_messages (external_message_id)
  where external_message_id is not null;

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at);

create table if not exists public.ai_booking_records (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete restrict,
  property_id uuid references public.properties (id) on delete set null,
  booking_source text not null default 'AI_DIRECT' check (booking_source = 'AI_DIRECT'),
  created_by text not null default 'AI_RECEPTIONIST',
  guest_name text not null,
  guest_contact text,
  check_in date not null,
  check_out date not null,
  adults int not null default 1 check (adults > 0),
  children int not null default 0 check (children >= 0),
  room_count int not null default 1 check (room_count > 0),
  room_class_id text,
  room_class_name text,
  quoted_price numeric(14,2),
  currency text not null default 'VND',
  booking_note text not null,
  policy_version text,
  safety_evidence jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  kiotviet_booking_uuid text,
  kiotviet_booking_code text,
  status text not null default 'draft' check (
    status in ('draft', 'checking', 'creating', 'created', 'verified', 'failed_safe', 'cancelled')
  ),
  verification_status text not null default 'pending' check (
    verification_status in ('pending', 'verified', 'failed', 'not_applicable')
  ),
  verification_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

alter table public.ai_booking_records enable row level security;

drop policy if exists "AI booking records are viewable by authenticated users" on public.ai_booking_records;
create policy "AI booking records are viewable by authenticated users"
  on public.ai_booking_records for select
  to authenticated
  using (true);

drop trigger if exists set_updated_at on public.ai_booking_records;
create trigger set_updated_at before update on public.ai_booking_records
  for each row execute procedure public.set_updated_at();

create index if not exists ai_booking_records_status_created_idx
  on public.ai_booking_records (status, created_at desc);

create table if not exists public.ai_manager_reviews (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  booking_record_id uuid references public.ai_booking_records (id) on delete set null,
  review_type text not null default 'missing_data' check (
    review_type in ('missing_data', 'policy_exception', 'service_request', 'booking_exception')
  ),
  title text not null,
  guest_request text not null,
  reason text not null,
  missing_fields text[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb,
  recommendation text not null,
  proposed_reply text,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'needs_info')
  ),
  manager_note text,
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'pending' or length(trim(coalesce(manager_note, ''))) > 0)
);

alter table public.ai_manager_reviews enable row level security;

drop policy if exists "AI manager reviews are viewable by authenticated users" on public.ai_manager_reviews;
create policy "AI manager reviews are viewable by authenticated users"
  on public.ai_manager_reviews for select
  to authenticated
  using (true);

drop trigger if exists set_updated_at on public.ai_manager_reviews;
create trigger set_updated_at before update on public.ai_manager_reviews
  for each row execute procedure public.set_updated_at();

create index if not exists ai_manager_reviews_status_created_idx
  on public.ai_manager_reviews (status, created_at desc);

create table if not exists public.ai_knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  manager_review_id uuid references public.ai_manager_reviews (id) on delete set null,
  field_key text not null,
  title text not null,
  current_value jsonb,
  proposed_value jsonb not null,
  source_evidence jsonb not null default '{}'::jsonb,
  scope text not null default 'reusable' check (scope in ('one_time', 'reusable')),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'published')
  ),
  reviewer_note text,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_knowledge_candidates enable row level security;

drop policy if exists "AI knowledge candidates are viewable by authenticated users" on public.ai_knowledge_candidates;
create policy "AI knowledge candidates are viewable by authenticated users"
  on public.ai_knowledge_candidates for select
  to authenticated
  using (true);

drop trigger if exists set_updated_at on public.ai_knowledge_candidates;
create trigger set_updated_at before update on public.ai_knowledge_candidates
  for each row execute procedure public.set_updated_at();

create index if not exists ai_knowledge_candidates_status_created_idx
  on public.ai_knowledge_candidates (status, created_at desc);

create table if not exists public.ai_pilot_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  tester_user_id uuid references public.users (id) on delete set null,
  scenario_tag text,
  status text not null default 'active' check (status in ('active', 'completed', 'failed')),
  result text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.ai_pilot_sessions enable row level security;

drop policy if exists "AI pilot sessions are viewable by authenticated users" on public.ai_pilot_sessions;
create policy "AI pilot sessions are viewable by authenticated users"
  on public.ai_pilot_sessions for select
  to authenticated
  using (true);

create index if not exists ai_pilot_sessions_started_idx
  on public.ai_pilot_sessions (started_at desc);

-- Align the existing Hospitality business unit and seeded agent with the approved role.
update public.business_units
set
  name = 'AI Lễ tân & Trải nghiệm',
  description = 'AI Booking, Concierge & Experience Agent cho Tam Coc Experience',
  updated_at = now()
where slug = 'hospitality-ai';

update public.agents
set
  name = 'AI Booking, Concierge & Experience Agent',
  unit = 'AI Lễ tân',
  current_task = 'Private Pilot — xử lý khách nhắn trực tiếp',
  updated_at = now()
where business_unit_id = (select id from public.business_units where slug = 'hospitality-ai')
  and name in ('Hospitality AI', 'AI Booking, Concierge & Experience Agent');
