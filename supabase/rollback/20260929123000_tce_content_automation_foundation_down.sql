-- Rollback: TCE Marketing Content Automation Foundation
-- Safe only before dependent production data/processes rely on these tables.

drop view if exists public.marketing_content_readiness_v;
drop table if exists public.marketing_content_gate_results;
drop table if exists public.marketing_publish_attempts;
drop table if exists public.marketing_content_variants;
drop table if exists public.marketing_channel_capabilities;
