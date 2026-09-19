-- TCE parallel safe-work kickoff.
-- Adds AI Marketing Manager as the 16th logical role and updates runtime work-state
-- for safe, non-financial, non-public parallel lanes. No customer/pricing/booking writes.

insert into public.agents
  (id, business_unit_id, name, unit, status, current_task, last_active_at)
values
  (
    '21000000-0000-4000-8000-000000000016',
    '00000000-0000-4000-8000-000000000002',
    'AI Marketing Manager',
    'TCE AI',
    'online',
    'ACTIVE · L2_APPROVAL · lead SOC-001 content strategy/content inventory/shadow QA; public publish and paid media remain gated',
    now()
  )
on conflict (id) do update
set name=excluded.name,
    unit=excluded.unit,
    status=excluded.status,
    current_task=excluded.current_task,
    last_active_at=excluded.last_active_at;

update public.agents
set status='online',
    current_task=case name
      when 'Website Agent' then 'ACTIVE · L2_APPROVAL · parallel SEO/local/CRO audit and scoped proposals; public mutation gated'
      when 'Channel Auditor' then 'ACTIVE · L0_READ · parallel L3 vs Website/OTA/Maps/Tripadvisor/Social reconciliation'
      when 'Data Quality Agent' then 'ACTIVE · L1_SAFE · parallel L3 verification backlog reconciliation and stale/conflict detection'
      when 'Reputation Agent' then 'SHADOW · L1_SAFE · parallel review intelligence, response drafts and issue trend detection; no public reply'
      else current_task
    end,
    last_active_at=now()
where unit='TCE AI'
and name in ('Website Agent','Channel Auditor','Data Quality Agent','Reputation Agent');
