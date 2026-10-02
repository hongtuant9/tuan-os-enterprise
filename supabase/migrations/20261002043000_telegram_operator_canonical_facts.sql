-- Owner-approved 2026-10-02: Telegram Operator Human-in-the-loop canonical fact layer.
-- FIN-HOSPITALITY-001 remains initial-input/reference/summary only; runtime Actual never falls back to the workbook.

create table if not exists public.telegram_operator_questions (
  id uuid primary key default gen_random_uuid(),
  question_code text not null unique,
  domain text not null,
  business_unit text not null check (business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED','TCE')),
  field_code text not null,
  question_text text not null,
  expected_type text not null check (expected_type in ('MONEY_MONTHLY','MONEY','NUMBER','TEXT','DATE','BOOLEAN')),
  unit text,
  effective_from date,
  allowed_confirmer text not null default 'OWNER' check (allowed_confirmer in ('OWNER','MANAGER','OWNER_OR_MANAGER')),
  status text not null default 'OPEN' check (status in ('OPEN','ANSWERED','CANCELLED','EXPIRED')),
  telegram_chat_id text,
  telegram_message_id bigint,
  asked_at timestamptz,
  answered_at timestamptz,
  answered_by_telegram_id text,
  answer_raw_text text,
  answer_value_text text,
  answer_value_numeric numeric,
  answer_value_date date,
  verification_status text not null default 'NEED_VERIFY' check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  source text not null default 'TUAN_OS_TELEGRAM_OPERATOR',
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_operator_questions_message_uq
  on public.telegram_operator_questions (telegram_chat_id, telegram_message_id)
  where telegram_chat_id is not null and telegram_message_id is not null;

create index if not exists telegram_operator_questions_open_idx
  on public.telegram_operator_questions (status, domain, business_unit, field_code);

create table if not exists public.operator_confirmed_facts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.telegram_operator_questions(id) on delete set null,
  domain text not null,
  business_unit text not null check (business_unit in ('LAVENDER','RUBY','COZY_GARDEN','HOSPITALITY_SHARED','TCE')),
  field_code text not null,
  effective_from date,
  unit text,
  value_text text,
  value_numeric numeric,
  value_date date,
  verification_status text not null check (verification_status in ('VERIFIED','NEED_VERIFY','HOLD')),
  authority text not null default 'OWNER_TELEGRAM',
  source text not null default 'TELEGRAM_OPERATOR',
  source_reference text not null,
  confirmed_by_telegram_id text,
  confirmed_at timestamptz not null default now(),
  superseded_at timestamptz,
  record_status text not null default 'ACTIVE' check (record_status in ('ACTIVE','SUPERSEDED','INACTIVE')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists operator_confirmed_facts_active_uq
  on public.operator_confirmed_facts (domain,business_unit,field_code,effective_from)
  where record_status='ACTIVE';

create index if not exists operator_confirmed_facts_lookup_idx
  on public.operator_confirmed_facts (domain,business_unit,field_code,record_status,effective_from desc);

alter table public.telegram_operator_questions enable row level security;
alter table public.operator_confirmed_facts enable row level security;

insert into public.sync_sources(key,name,description,supports_incremental,schedule_enabled,status,last_synced_at,last_cursor,last_error)
values (
  'telegram-ai-agent-operator-group',
  'Tuấn & Quản Lý Vận Hành_ AI Agent Opreator',
  'Kênh Human-in-the-loop chính thức: TUAN OS hỏi dữ liệu thiếu; Owner reply được ingest vào canonical runtime với provenance.',
  false,false,'idle',now(),null,null
)
on conflict (key) do update set
  name=excluded.name,
  description=excluded.description,
  updated_at=now();
