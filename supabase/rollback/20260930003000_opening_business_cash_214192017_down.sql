update public.finance_opening_positions
set record_status='SUPERSEDED',updated_at=now()
where position_code='OPEN-BUSINESS-CASH-CONSOLIDATED-20260930-V2';

update public.finance_opening_positions
set record_status='ACTIVE',updated_at=now()
where position_code='OPEN-BUSINESS-CASH-CONSOLIDATED-20260930';
