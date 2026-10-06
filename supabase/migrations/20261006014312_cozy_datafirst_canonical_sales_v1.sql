-- TUAN OS Enterprise — DATAFIRST-001
-- Cozy Garden canonical daily sales read layer
-- Authority: VERIFIED ACTIVE KiotViet F&B invoice API rows in public.business_finance_transactions
-- Scope: additive/read-only. No KiotViet write. No permission change.

create or replace view private.cozy_sales_daily_canonical_v
with (security_invoker = true)
as
select
  transaction_date as business_date,
  count(*)::bigint as invoice_count,
  count(distinct external_key)::bigint as unique_invoice_count,
  sum(amount)::numeric(18,2) as revenue_actual,
  min(updated_at) as first_record_updated_at,
  max(updated_at) as last_record_updated_at,
  'KIOTVIET_FNB_INVOICE_API'::text as authority_source,
  'VERIFIED'::text as verification_status
from public.business_finance_transactions
where business_unit = 'COZY_GARDEN'
  and source = 'KIOTVIET_FNB_INVOICE_API'
  and verification_status = 'VERIFIED'
  and record_status = 'ACTIVE'
group by transaction_date;

comment on view private.cozy_sales_daily_canonical_v is
'Canonical read-only daily Cozy Garden sales layer. Authority: VERIFIED ACTIVE KiotViet F&B invoice API rows in public.business_finance_transactions. No financial write; no KiotViet write.';
