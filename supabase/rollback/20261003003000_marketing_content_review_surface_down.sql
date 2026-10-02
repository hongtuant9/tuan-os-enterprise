-- Rollback Marketing Content Review Surface sync range.
-- The AJ workbook column may remain as harmless source data; runtime sync returns to the prior A:AI range.

update public.sync_sources
set
  sheet_range = 'SHADOW_CONTENT_QUEUE!A:AI',
  updated_at = now()
where key = 'marketing-shadow-content';
