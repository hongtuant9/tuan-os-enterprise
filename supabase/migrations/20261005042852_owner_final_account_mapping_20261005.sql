-- Owner-final account mapping effective 2026-10-01.
-- Preserve historical records by SUPERSEDED; do not delete financial history.

update public.finance_opening_positions
set record_status='SUPERSEDED',
    notes=case when notes like '%SUPERSEDED 05/10/2026 by owner final account mapping:%' then notes else coalesce(notes,'') || ' SUPERSEDED 05/10/2026 by owner final account mapping: 31,473,816 VND is BIDV 888 business expense account closing balance as of 30/09/2026, not personal net cash.' end,
    updated_at=now()
where position_code='PERSONAL-NET-CASH-20261001';

update public.finance_accounts
set display_name='BIDV 888 – Tuấn · Tài khoản chi phí kinh doanh', institution='BIDV',
    financial_domain='BUSINESS', business_unit='HOSPITALITY_SHARED',
    opening_balance=31473816, current_balance=31473816, bank_balance=31473816, book_balance=31473816,
    balance_as_of='2026-09-30', verification_status='VERIFIED', source='OWNER_DECISION_20261005_FINAL',
    source_reference='OWNER_FINAL_ACCOUNT_MAPPING_20261005', reconciliation_status='MATCHED',
    account_roles=ARRAY['BUSINESS_OPERATING_ACCOUNT','BUSINESS_EXPENSE_ACCOUNT']::text[], is_restricted_cash=false,
    purpose_note='Tài khoản chi phí cho toàn bộ hệ thống kinh doanh. Mỗi khoản chi phải đánh dấu/ghi chú cơ sở La, Ru hoặc Cozy. Số dư chốt 30/09/2026: 31.473.816 VND.', updated_at=now()
where account_code='OPEN-BIDV-TUAN';

update public.finance_accounts
set display_name='TK KINH DOANH · Doanh thu Homestay', financial_domain='BUSINESS', business_unit='LAVENDER',
    opening_balance=0, current_balance=0, bank_balance=0, book_balance=0, balance_as_of='2026-09-30',
    verification_status='VERIFIED', source='OWNER_DECISION_20261005_FINAL', source_reference='OWNER_FINAL_ACCOUNT_MAPPING_20261005',
    reconciliation_status='MATCHED', account_roles=ARRAY['BUSINESS_REVENUE_COLLECTION_ACCOUNT','OTA_SETTLEMENT_ACCOUNT']::text[],
    is_restricted_cash=false, purpose_note='Nhận doanh thu Homestay: chuyển khoản, thanh toán thẻ và OTA thực nhận. OTA tháng 10 chưa hạch toán; cuối tháng mới chốt.', updated_at=now()
where account_code='OPEN-HKD-TUAN';

insert into public.finance_accounts (account_code,display_name,institution,account_ref_last4,financial_domain,business_unit,opening_balance,current_balance,balance_as_of,currency_code,ownership_status,verification_status,source,source_reference,evidence,record_status,account_roles,bank_balance,book_balance,reconciliation_status,is_restricted_cash,purpose_note)
values ('ROLE-TPBANK-COZY-888','TPBank 888 – Tuấn · Tài khoản doanh thu Cozy Garden','TPBank','888','BUSINESS','COZY_GARDEN',0,0,'2026-09-30','VND','VERIFIED','VERIFIED','OWNER_DECISION_20261005_FINAL','OWNER_FINAL_ACCOUNT_MAPPING_20261005','{"owner_approved":true}'::jsonb,'ACTIVE',ARRAY['BUSINESS_REVENUE_COLLECTION_ACCOUNT']::text[],0,0,'MATCHED',false,'Chỉ nhận doanh thu từ Cozy Garden.')
on conflict (account_code) do update set display_name=excluded.display_name,institution=excluded.institution,account_ref_last4=excluded.account_ref_last4,financial_domain=excluded.financial_domain,business_unit=excluded.business_unit,opening_balance=excluded.opening_balance,current_balance=excluded.current_balance,balance_as_of=excluded.balance_as_of,ownership_status=excluded.ownership_status,verification_status=excluded.verification_status,source=excluded.source,source_reference=excluded.source_reference,evidence=excluded.evidence,record_status='ACTIVE',account_roles=excluded.account_roles,bank_balance=excluded.bank_balance,book_balance=excluded.book_balance,reconciliation_status=excluded.reconciliation_status,is_restricted_cash=excluded.is_restricted_cash,purpose_note=excluded.purpose_note,updated_at=now();

update public.personal_finance_accounts
set current_balance=40000000,balance_as_of='2026-09-30',verification_status='VERIFIED',source='OWNER_DECISION_20261005_FINAL',source_reference='OWNER_FINAL_ACCOUNT_MAPPING_20261005',source_updated_at=now(),verification_evidence='Owner final account mapping: TPBank 501 closing balance 40,000,000 VND as of 30/09/2026; personal/family operating account from 01/10/2026.',verified_at=now(),record_status='ACTIVE',status_reason='Owner final account mapping effective 01/10/2026',status_changed_at=now(),updated_at=now()
where external_key='TPBANK-501';

update public.personal_finance_accounts set record_status='SUPERSEDED',status_reason='SUPERSEDED by owner final mapping: TPBank 888 is Cozy Garden revenue account; personal safety fund is TPBank TKTK_A01.',status_changed_at=now(),updated_at=now() where external_key='CUTOVER-TPBANK-888-SAFETY-20260930';
update public.personal_finance_accounts set record_status='SUPERSEDED',status_reason='SUPERSEDED by owner final mapping: BIDV 888 is business expense account with 31.473.816 VND closing balance as of 30/09/2026.',status_changed_at=now(),updated_at=now() where external_key='CUTOVER-BIDV-888-PERSONAL-20260930';

update public.personal_finance_accounts
set name='TPBank TKTK_A01 – Tuấn · Quỹ an toàn/dự phòng',account_type='BANK',institution='TPBank',currency='VND',current_balance=0,balance_as_of='2026-09-30',is_liquid=true,is_emergency_fund=true,source='OWNER_DECISION_20261005_FINAL',source_reference='OWNER_FINAL_ACCOUNT_MAPPING_20261005',source_updated_at=now(),verification_status='VERIFIED',verification_evidence='Owner final account mapping: personal emergency/safety reserve; closing balance 0 VND as of 30/09/2026; not for daily spending.',verified_at=now(),account_type_code='BANK',institution_code='TPBANK',status_reason='Owner final account mapping effective 01/10/2026',record_status='ACTIVE',status_changed_at=now(),updated_at=now()
where external_key='TPBANK-TKTK-A01';

insert into public.personal_finance_accounts (name,account_type,institution,currency,current_balance,balance_as_of,is_liquid,is_emergency_fund,source,source_reference,verification_status,source_updated_at,verification_evidence,verified_at,external_key,account_type_code,institution_code,status_reason,record_status,status_changed_at)
select 'TPBank TKTK_A01 – Tuấn · Quỹ an toàn/dự phòng','BANK','TPBank','VND',0,'2026-09-30',true,true,'OWNER_DECISION_20261005_FINAL','OWNER_FINAL_ACCOUNT_MAPPING_20261005','VERIFIED',now(),'Owner final account mapping: personal emergency/safety reserve; closing balance 0 VND as of 30/09/2026; not for daily spending.',now(),'TPBANK-TKTK-A01','BANK','TPBANK','Owner final account mapping effective 01/10/2026','ACTIVE',now()
where not exists (select 1 from public.personal_finance_accounts where external_key='TPBANK-TKTK-A01');

update public.finance_accounts set display_name='TPBank 501 – Tuấn · Tài khoản cá nhân/gia đình',financial_domain='PERSONAL',business_unit='PERSONAL',balance_as_of='2026-09-30',verification_status='VERIFIED',source='OWNER_DECISION_20261005_FINAL',source_reference='OWNER_FINAL_ACCOUNT_MAPPING_20261005',account_roles=ARRAY['PERSONAL_OPERATING_ACCOUNT']::text[],purpose_note='Chỉ nhận tiền được phân phối từ kinh doanh; dùng chi sinh hoạt gia đình. Số dư canonical tại personal_finance_accounts: 40.000.000 VND chốt 30/09/2026.',updated_at=now() where account_code='ROLE-TPBANK-PERSONAL-501';
update public.finance_accounts set display_name='TPBank TKTK_A01 – Tuấn · Quỹ an toàn/dự phòng',institution='TPBank',account_ref_last4='A01',financial_domain='PERSONAL',business_unit='PERSONAL',opening_balance=0,current_balance=0,bank_balance=0,book_balance=0,balance_as_of='2026-09-30',verification_status='VERIFIED',source='OWNER_DECISION_20261005_FINAL',source_reference='OWNER_FINAL_ACCOUNT_MAPPING_20261005',reconciliation_status='MATCHED',account_roles=ARRAY['PERSONAL_SAFETY_ACCOUNT']::text[],is_restricted_cash=true,purpose_note='Quỹ an toàn/dự phòng cá nhân. Không dùng chi tiêu hàng ngày. Số dư chốt 30/09/2026: 0 VND.',updated_at=now() where account_code='ROLE-TPBANK-SAFETY';
update public.finance_accounts set display_name='TPBank TTKTK_A02 – Tuấn · Thuế kinh doanh & dự phòng',institution='TPBank',account_ref_last4='A02',financial_domain='BUSINESS',business_unit='HOSPITALITY_SHARED',opening_balance=0,current_balance=0,bank_balance=0,book_balance=0,balance_as_of='2026-09-30',verification_status='VERIFIED',source='OWNER_DECISION_20261005_FINAL',source_reference='OWNER_FINAL_ACCOUNT_MAPPING_20261005',reconciliation_status='MATCHED',account_roles=ARRAY['BUSINESS_TAX_RESERVE_ACCOUNT','BUSINESS_BONUS_RESERVE_ACCOUNT','BUSINESS_RESERVE_ACCOUNT']::text[],is_restricted_cash=true,purpose_note='Sử dụng để trích thuế kinh doanh, thưởng nhân viên cuối năm và dự phòng phát sinh; có thể rút/gửi linh hoạt. Số dư chốt 30/09/2026: 0 VND. Technical account_code retained for backward compatibility.',updated_at=now() where account_code='ROLE-TPBANK-TCE-RESERVE-1984';
