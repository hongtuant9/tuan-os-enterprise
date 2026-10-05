insert into public.finance_opening_positions (
  position_code,cutover_date,financial_domain,business_unit,position_type,amount,currency_code,
  verification_status,source,source_reference,notes,record_status
) values (
  'OTA-RECEIVED-CURRENT-20261005','2026-10-05','BUSINESS','CONSOLIDATED','OTHER',0,'VND',
  'VERIFIED','OWNER_DECISION_20261005_OTA_CURRENT_ZERO','OWNER_CONFIRMED_OTA_RECEIVED_CURRENT_ZERO_20261005',
  'Owner xác nhận tiền OTA đã nhận/đã trả về hiện tại = 0 VND. OTA tháng 10 chưa hạch toán và chỉ chốt cuối tháng. Không dùng OTA receivable outstanding làm số tiền đã nhận hiện tại.',
  'ACTIVE'
)
on conflict (position_code) do update set
  cutover_date=excluded.cutover_date,amount=excluded.amount,verification_status=excluded.verification_status,
  source=excluded.source,source_reference=excluded.source_reference,notes=excluded.notes,record_status='ACTIVE',updated_at=now();
