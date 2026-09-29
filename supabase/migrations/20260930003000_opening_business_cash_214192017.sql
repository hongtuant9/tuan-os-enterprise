-- Owner-approved correction from RECOVER BROKEN APP TABS + COMPLETE VERIFIED BUSINESS DATA.
-- 30/09/2026 opening business cash becomes 214,192,017 VND.
-- The prior 165,292,017 VND record is preserved as SUPERSEDED.
-- No revenue/profit/distribution transaction is created here; this is opening-position correction only.

update public.finance_opening_positions
set record_status='SUPERSEDED',
    notes=coalesce(notes,'') || ' SUPERSEDED 30/09/2026: owner-approved recovery specification adds 48,900,000 VND September Homestay cash revenue already deposited to Business Account.',
    updated_at=now()
where position_code='OPEN-BUSINESS-CASH-CONSOLIDATED-20260930'
  and record_status='ACTIVE';

insert into public.finance_opening_positions(
  position_code,cutover_date,financial_domain,business_unit,position_type,amount,currency_code,
  verification_status,source,source_reference,notes,record_status
)
values(
  'OPEN-BUSINESS-CASH-CONSOLIDATED-20260930-V2','2026-09-30','BUSINESS','HOSPITALITY_SHARED',
  'BUSINESS_CASH_CONSOLIDATED',214192017,'VND','VERIFIED','OWNER_APPROVED_INPUT',
  'RECOVER-BROKEN-TABS-20260929#CURRENT_OPENING_CASH',
  'Current canonical Opening Business Cash. Includes 48,900,000 VND September Homestay Cash Revenue previously omitted and already fully deposited to Business Account. This opening position is not Personal Cash, Profit, Taxable Profit, or Owner Distributable Cash.',
  'ACTIVE'
)
on conflict(position_code) do update set
  amount=excluded.amount,verification_status='VERIFIED',source=excluded.source,source_reference=excluded.source_reference,
  notes=excluded.notes,record_status='ACTIVE',updated_at=now();

insert into public.activity_logs(agent,unit,message,type)
values('TUAN OS','Finance','Opening Business Cash corrected from 165,292,017 to 214,192,017 VND per Owner-approved recovery specification. Prior record SUPERSEDED; +48,900,000 is September Homestay cash revenue already deposited. No revenue/profit/distribution transaction created.','action');
