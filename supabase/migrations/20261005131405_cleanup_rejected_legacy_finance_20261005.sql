-- Remove rejected legacy finance rows from live operational state without disabling canonical hard-delete guard.
update public.personal_finance_transactions
set record_status='VOIDED',
    verification_status='NEED_VERIFY',
    status_reason='Owner rejected legacy transaction during FIN-MASTER-001 cleanup 05/10/2026',
    status_changed_at=coalesce(status_changed_at,now()),
    updated_at=now()
where source_reference='04_GiaoDich!A7:P7'
  and amount=20000000
  and record_status='ACTIVE';

update public.owner_business_transfers
set record_status='VOIDED',
    verification_status='NEED_VERIFY',
    status_reason='Owner rejected legacy transfer during FIN-MASTER-001 cleanup 05/10/2026',
    status_changed_at=coalesce(status_changed_at,now()),
    updated_at=now()
where source_reference='04_GiaoDich!A5:P5'
  and amount=30000000
  and record_status='ACTIVE';
