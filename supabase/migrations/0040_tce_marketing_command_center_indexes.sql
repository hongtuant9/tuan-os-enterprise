-- TCE Marketing Command Center V1 - performance indexes for foreign-key access paths.
create index if not exists marketing_connectors_channel_idx
  on public.marketing_connectors(channel_id)
  where channel_id is not null;

create index if not exists marketing_campaigns_channel_idx
  on public.marketing_campaigns(channel_id);

create index if not exists marketing_content_items_channel_idx
  on public.marketing_content_items(channel_id)
  where channel_id is not null;

create index if not exists marketing_content_items_campaign_idx
  on public.marketing_content_items(campaign_id)
  where campaign_id is not null;

create index if not exists marketing_daily_metrics_channel_idx
  on public.marketing_daily_metrics(channel_id);

create index if not exists marketing_daily_metrics_connector_idx
  on public.marketing_daily_metrics(connector_id);

create index if not exists marketing_attribution_channel_idx
  on public.marketing_attribution_events(channel_id, occurred_at desc)
  where channel_id is not null;

create index if not exists marketing_attribution_conversation_idx
  on public.marketing_attribution_events(conversation_id, occurred_at desc)
  where conversation_id is not null;

create index if not exists marketing_attribution_booking_idx
  on public.marketing_attribution_events(booking_record_id, occurred_at desc)
  where booking_record_id is not null;

create index if not exists marketing_attribution_upsell_idx
  on public.marketing_attribution_events(upsell_event_id, occurred_at desc)
  where upsell_event_id is not null;
