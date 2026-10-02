-- Marketing Content Review Surface
-- Extends the existing canonical content queue by one column for Tripadvisor owner-content caption.
-- No public publish, Ads, pricing, availability, policy or provider mutation.

update public.sync_sources
set
  sheet_range = 'SHADOW_CONTENT_QUEUE!A:AJ',
  updated_at = now()
where key = 'marketing-shadow-content';
