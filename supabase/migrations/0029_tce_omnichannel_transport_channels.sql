-- TCE Omnichannel transport gateway.
-- Prepare additional customer conversation transports while runtime policy keeps them CLOSED.

alter table public.ai_conversations
  drop constraint if exists ai_conversations_channel_check;

alter table public.ai_conversations
  add constraint ai_conversations_channel_check
  check (channel in (
    'website','facebook','instagram','booking','agoda','airbnb','expedia',
    'tripadvisor','email','whatsapp','zalo','other','pilot'
  ));

comment on constraint ai_conversations_channel_check on public.ai_conversations is
  'Allowed TCE customer conversation transports. Runtime channel policy controls which transports may actually ingest traffic.';
