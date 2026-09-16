-- Align TCE Agent registry with Owner directive 2026-09-16.
-- Only financial/cost/budget/payment mutations require Owner approval.

update public.agents
set status = 'online',
    current_task = 'ACTIVE · L2_APPROVAL · safety-gated booking write; financial exception requires Owner approval',
    last_active_at = now()
where id = '21000000-0000-4000-8000-000000000006';

update public.agents
set status = 'online',
    current_task = 'ACTIVE · L2_APPROVAL · non-financial website remediation with evidence + rollback',
    last_active_at = now()
where id = '21000000-0000-4000-8000-000000000008';

update public.agents
set status = 'online',
    current_task = 'ACTIVE · L2_APPROVAL · API→Terminal→DOM→GUI; financial actions require Owner approval',
    last_active_at = now()
where id = '21000000-0000-4000-8000-000000000015';
