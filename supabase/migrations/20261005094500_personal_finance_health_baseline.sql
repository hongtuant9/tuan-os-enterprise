-- Personal Finance health baseline and owner-confirmed October 2026 data.
-- Scope: data correction only; no bank execution, no financial transaction.

-- 1) Personal operating account TPBank 501: owner-confirmed opening available cash 40,000,000 VND.
update public.personal_finance_accounts
set name = 'TPBank 501 – Tuấn · Tài khoản cá nhân/gia đình',
    account_type = 'BANK',
    institution = 'TPBank',
    current_balance = 40000000,
    balance_as_of = date '2026-10-01',
    is_liquid = true,
    is_emergency_fund = false,
    source = 'OWNER_DECISION_20261005',
    source_reference = 'Owner confirmation 05/10/2026 · Personal Finance',
    verification_status = 'VERIFIED',
    source_updated_at = now(),
    verification_evidence = 'Owner-confirmed opening available cash: 40,000,000 VND for family spending via TPBank 501.',
    verified_at = now(),
    external_key = 'TPBANK-501',
    account_type_code = 'BANK',
    record_status = 'ACTIVE',
    updated_at = now()
where external_key = 'TPBANK-501';

insert into public.personal_finance_accounts (
  name, account_type, institution, currency, current_balance, balance_as_of,
  is_liquid, is_emergency_fund, source, source_reference, verification_status,
  source_updated_at, verification_evidence, verified_at, external_key,
  account_type_code, record_status
)
select
  'TPBank 501 – Tuấn · Tài khoản cá nhân/gia đình', 'BANK', 'TPBank', 'VND',
  40000000, date '2026-10-01', true, false,
  'OWNER_DECISION_20261005', 'Owner confirmation 05/10/2026 · Personal Finance',
  'VERIFIED', now(),
  'Owner-confirmed opening available cash: 40,000,000 VND for family spending via TPBank 501.',
  now(), 'TPBANK-501', 'BANK', 'ACTIVE'
where not exists (
  select 1 from public.personal_finance_accounts where external_key = 'TPBANK-501'
);

-- 2) Emergency fund is explicitly zero, not NO DATA.
update public.personal_finance_accounts
set current_balance = 0,
    balance_as_of = date '2026-10-01',
    source = 'OWNER_DECISION_20261005',
    source_reference = 'Owner confirmation 05/10/2026 · Emergency fund = 0',
    verification_status = 'VERIFIED',
    source_updated_at = now(),
    verification_evidence = 'Owner explicitly confirmed no personal emergency fund as of October 2026.',
    verified_at = now(),
    record_status = 'ACTIVE',
    updated_at = now()
where is_emergency_fund = true and record_status = 'ACTIVE';

-- 3) Bank overdraft currently used: 2,850,413,761 VND.
update public.personal_finance_debts
set current_principal = 2850413761,
    as_of_date = date '2026-10-01',
    source = 'OWNER_DECISION_20261005',
    source_reference = 'Owner confirmation 05/10/2026 · BIDV overdraft currently used',
    verification_status = 'VERIFIED',
    source_updated_at = now(),
    verification_evidence = 'Owner-confirmed active overdraft used principal: 2,850,413,761 VND.',
    verified_at = now(),
    updated_at = now()
where external_key = 'CUTOVER-BIDV-OD-401' and status = 'ACTIVE';

update public.finance_credit_facilities
set used_principal = 2850413761,
    verification_status = 'VERIFIED',
    source = 'OWNER_DECISION_20261005',
    source_reference = 'Owner confirmation 05/10/2026 · active overdraft used principal',
    updated_at = now()
where facility_code = 'BIDV-OD-401' and record_status = 'ACTIVE';

-- 4) Owner-confirmed opening net cash for October; separate from monthly net cash flow.
insert into public.finance_opening_positions (
  position_code, cutover_date, financial_domain, business_unit, position_type,
  amount, currency_code, verification_status, source, source_reference, notes, record_status
)
values (
  'PERSONAL-NET-CASH-20261001', date '2026-10-01', 'PERSONAL', 'PERSONAL', 'OTHER',
  31473816, 'VND', 'VERIFIED', 'OWNER_DECISION_20261005',
  'Owner confirmation 05/10/2026 · opening net cash October',
  'Opening baseline only. Do not treat as monthly net cash flow and do not auto-add to distributable cash.', 'ACTIVE'
)
on conflict (position_code) do update
set amount = excluded.amount,
    verification_status = excluded.verification_status,
    source = excluded.source,
    source_reference = excluded.source_reference,
    notes = excluded.notes,
    record_status = 'ACTIVE',
    updated_at = now();

-- 5) Correct account identity/purpose metadata. Stable technical account_code is retained for compatibility.
update public.finance_accounts
set display_name = 'TPBank 1985 – Tuấn · Quỹ nghĩa vụ & dự phòng',
    institution = 'TPBank',
    account_ref_last4 = '1985',
    current_balance = null,
    bank_balance = null,
    book_balance = null,
    verification_status = 'NEED_VERIFY',
    reconciliation_status = 'NEED_VERIFY',
    source = 'OWNER_DECISION_20261005',
    source_reference = 'Owner correction 05/10/2026 · account is TPBank 1985',
    purpose_note = 'Tài khoản giữ Thuế, thưởng nhân viên và các khoản nghĩa vụ/chi định kỳ năm. Không tính vào tiền có thể phân phối cho tới khi đối soát số dư.',
    updated_at = now()
where account_code = 'ROLE-TPBANK-TCE-RESERVE-1984' and record_status = 'ACTIVE';

update public.finance_accounts
set institution = 'BIDV',
    display_name = 'BIDV Hộ kinh doanh · Tài khoản nhận doanh thu & OTA',
    source = 'OWNER_DECISION_20261005',
    source_reference = 'Owner confirmation 05/10/2026 · OTA settlement destination',
    purpose_note = 'Tài khoản nhận doanh thu kinh doanh và tiền OTA. OTA chờ về vẫn là Accounts Receivable cho tới khi payout thực nhận.',
    updated_at = now()
where account_code = 'OPEN-HKD-TUAN' and record_status = 'ACTIVE';

-- 6) Keep consolidated account metadata aligned without duplicating Personal Finance as the balance authority.
update public.finance_accounts
set display_name = 'TPBank 501 – Tuấn · Tài khoản cá nhân/gia đình',
    source = 'OWNER_DECISION_20261005',
    source_reference = 'Personal balance authority = personal_finance_accounts',
    purpose_note = 'Tài khoản cá nhân/gia đình. Số dư canonical được quản lý tại personal_finance_accounts; finance_accounts chỉ giữ mapping vận hành hợp nhất.',
    updated_at = now()
where account_code = 'ROLE-TPBANK-PERSONAL-501' and record_status = 'ACTIVE';
