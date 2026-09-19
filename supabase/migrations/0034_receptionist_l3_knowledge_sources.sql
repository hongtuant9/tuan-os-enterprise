-- AI Receptionist V2: read-only L3 knowledge sync sources.
-- Google Sheet remains authoritative; sync_records is only an operational cache.
-- No customer-facing write permissions are opened by this migration.

insert into public.sync_sources (
  key, name, description, sheet_id, sheet_range,
  supports_incremental, schedule_enabled, schedule_interval_minutes
)
values
  (
    'l3-property-info',
    'TCE L3 — Property Info',
    'Read-only canonical property identity/contact/reference data for AI customer responses.',
    '1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4',
    '01_THONG_TIN_CO_SO!A:Z',
    true, true, 15
  ),
  (
    'l3-pricing',
    'TCE L3 — Pricing',
    'Read-only canonical price/rate/service records. Resolver still requires VERIFIED + allowed customer use.',
    '1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4',
    '03_GIA_VA_GOI_BAN!A:Z',
    true, true, 15
  ),
  (
    'l3-policy',
    'TCE L3 — Policies',
    'Read-only canonical policy records for customer-safe AI responses.',
    '1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4',
    '04_CHINH_SACH!A:Z',
    true, true, 15
  ),
  (
    'l3-services',
    'TCE L3 — Amenities & Services',
    'Read-only verified amenities/service information.',
    '1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4',
    '05_TIEN_NGHI_DICH_VU!A:Z',
    true, true, 15
  ),
  (
    'l3-products',
    'TCE L3 — Experience Products',
    'Read-only productized service/experience records.',
    '1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4',
    '10_DICH_VU_SAN_PHAM!A:Z',
    true, true, 15
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  sheet_id = excluded.sheet_id,
  sheet_range = excluded.sheet_range,
  supports_incremental = excluded.supports_incremental,
  schedule_enabled = excluded.schedule_enabled,
  schedule_interval_minutes = excluded.schedule_interval_minutes,
  updated_at = now();
