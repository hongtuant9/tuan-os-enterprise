-- Owner-confirmed physical cash on hand as of 2026-10-05.
update public.finance_accounts
set current_balance=0,
    bank_balance=0,
    book_balance=0,
    balance_as_of='2026-10-05',
    verification_status='VERIFIED',
    reconciliation_status='MATCHED',
    source='OWNER_DECISION_20261005_CASH_ACTUAL_ZERO',
    source_reference='OWNER_CONFIRMED_CASH_ON_HAND_ZERO_20261005',
    evidence=jsonb_build_object('owner_confirmed',true,'cash_on_hand_total_vnd',0,'as_of','2026-10-05'),
    purpose_note=case account_code
      when 'CASH-COZY' then 'Doanh thu tiền mặt Cozy Garden đang giữ trong tháng. Owner xác nhận tiền mặt thực tế đang giữ tại 05/10/2026 = 0 VND. Cuối tháng nộp vào ROLE-TPBANK-COZY-888; không ghi doanh thu lần hai.'
      when 'CASH-LAVENDER' then 'Doanh thu tiền mặt Lavender đang giữ trong tháng. Owner xác nhận tiền mặt thực tế đang giữ tại 05/10/2026 = 0 VND. Cuối tháng nộp vào OPEN-HKD-TUAN.'
      when 'CASH-RUBY' then 'Doanh thu tiền mặt Ruby đang giữ trong tháng. Owner xác nhận tiền mặt thực tế đang giữ tại 05/10/2026 = 0 VND. Cuối tháng nộp vào OPEN-HKD-TUAN.'
      else purpose_note end,
    updated_at=now()
where account_code in ('CASH-COZY','CASH-LAVENDER','CASH-RUBY');
