-- Group 2 production hardening: enforce one active MCC cycle and clear stale rows.
update public.marketing_sync_runs
set status='failed',
    completed_at=coalesce(completed_at,now()),
    error_code=coalesce(error_code,'STALE_RUNTIME_RUN'),
    error_message=coalesce(error_message,'Auto-closed before enabling single active runtime cycle.')
where connector_id='hospitality_crm'
  and status='running';

create unique index if not exists marketing_sync_runs_one_running_per_connector_idx
  on public.marketing_sync_runs(connector_id)
  where status='running';
