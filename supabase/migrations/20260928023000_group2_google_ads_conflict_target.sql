-- Group 2 runtime hotfix: allow PostgREST ON CONFLICT on provider campaign identity.
-- Existing partial unique index remains; this full unique index is null-tolerant and
-- exposes a non-partial conflict target for connector_id/provider_campaign_id.
create unique index if not exists marketing_campaigns_provider_key_full_uq
  on public.marketing_campaigns(connector_id, provider_campaign_id);
