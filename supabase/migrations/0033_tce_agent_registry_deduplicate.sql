-- Corrective migration for TCE logical agent registry.
-- Migration 0032 may be applied on systems where AI Marketing Manager already exists
-- with a generated UUID. Keep one canonical logical row by name and remove only the
-- known fallback fixed-ID duplicate when another Marketing Manager row exists.

delete from public.agents a
where a.id='21000000-0000-4000-8000-000000000016'
  and a.name='AI Marketing Manager'
  and exists (
    select 1
    from public.agents other
    where other.unit='TCE AI'
      and other.name='AI Marketing Manager'
      and other.id<>a.id
  );

update public.agents
set status='online',
    current_task='ACTIVE · L2_APPROVAL · lead SOC-001 content strategy, 2–4 week content inventory, shadow batch + QA, funnel/growth planning; public publish and paid media remain gated',
    last_active_at=now()
where unit='TCE AI'
  and name='AI Marketing Manager';
