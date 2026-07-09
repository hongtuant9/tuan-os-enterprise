-- TUAN OS Command Center — v0.4 seed data
-- Run after supabase/schema.sql. Safe to re-run (fixed ids, on conflict do nothing).

-- ---------------------------------------------------------------------------
-- hospitality_properties (3)
-- ---------------------------------------------------------------------------
insert into public.hospitality_properties
  (id, name, status, occupancy, check_ins_today, check_outs_today, pending_guest_messages)
values
  ('10000000-0000-4000-8000-000000000001', 'Lavender Homestay', 'online', 92, 2, 1, 3),
  ('10000000-0000-4000-8000-000000000002', 'Ruby Homestay', 'monitoring', 78, 1, 0, 1),
  ('10000000-0000-4000-8000-000000000003', 'Cozy Garden', 'online', 100, 0, 2, 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ai_agents (6)
-- ---------------------------------------------------------------------------
insert into public.ai_agents
  (id, name, unit, status, current_task, last_active_at)
values
  ('20000000-0000-4000-8000-000000000001', 'CEO Chief of Staff', 'CEO Overview', 'online', 'Compiling daily priority brief', now() - interval '1 minute'),
  ('20000000-0000-4000-8000-000000000002', 'Hospitality AI', 'Hospitality AI', 'online', 'Replying to guest messages', now()),
  ('20000000-0000-4000-8000-000000000003', 'Marketing AI', 'Marketing AI', 'online', 'Scheduling social content', now() - interval '2 minutes'),
  ('20000000-0000-4000-8000-000000000004', 'Finance AI', 'Finance AI', 'online', 'Reconciling OTA payouts', now() - interval '5 minutes'),
  ('20000000-0000-4000-8000-000000000005', 'iSTEAM AI', 'iSTEAM AI', 'idle', 'Waiting on enrollment copy approval', now() - interval '24 minutes'),
  ('20000000-0000-4000-8000-000000000006', 'Knowledge AI', 'Knowledge Center', 'offline', 'Google Drive sync (v0.4)', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tasks (5)
-- ---------------------------------------------------------------------------
insert into public.tasks
  (id, title, unit, owner, status, priority, due_date)
values
  ('30000000-0000-4000-8000-000000000001', 'Approve July marketing budget reallocation', 'Finance AI', 'Finance AI', 'in-progress', 'high', current_date),
  ('30000000-0000-4000-8000-000000000002', 'Review guest complaint escalation at Ruby Homestay', 'Hospitality AI', 'Hospitality AI', 'todo', 'high', current_date),
  ('30000000-0000-4000-8000-000000000003', 'Finalize iSTEAM summer program enrollment copy', 'iSTEAM AI', 'iSTEAM AI', 'in-progress', 'medium', current_date + 1),
  ('30000000-0000-4000-8000-000000000004', 'Publish Instagram carousel for Cozy Garden', 'Marketing AI', 'Marketing AI', 'todo', 'medium', current_date),
  ('30000000-0000-4000-8000-000000000005', 'Reconcile OTA payouts for June', 'Finance AI', 'Finance AI', 'blocked', 'high', current_date - 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- approvals (5)
-- ---------------------------------------------------------------------------
insert into public.approvals
  (id, title, summary, unit, requested_by, status, created_at)
values
  ('40000000-0000-4000-8000-000000000001', 'Discount 15% for Lavender Homestay long-stay guest', 'Guest booking 14 nights, requesting loyalty discount before confirming payment.', 'Hospitality AI', 'Hospitality AI', 'pending', now() - interval '50 minutes'),
  ('40000000-0000-4000-8000-000000000002', 'July marketing spend increase (+8,000,000 VND)', 'Boost ad budget for Cozy Garden listing after strong CTR this week.', 'Marketing AI', 'Marketing AI', 'pending', now() - interval '1 hour 20 minutes'),
  ('40000000-0000-4000-8000-000000000003', 'Refund request — Ruby Homestay booking #2291', 'Guest cancelled due to weather; refund policy allows 70% refund.', 'Finance AI', 'Finance AI', 'pending', now() - interval '18 hours'),
  ('40000000-0000-4000-8000-000000000004', 'New iSTEAM partner school onboarding', 'Add Greenfield International School as a new enrollment partner.', 'iSTEAM AI', 'iSTEAM AI', 'approved', now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000005', 'Vendor invoice — cleaning supplies', 'Monthly recurring invoice from Sach Xanh Supplies for all three properties.', 'Finance AI', 'Finance AI', 'rejected', now() - interval '2 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- activity_logs (10)
-- ---------------------------------------------------------------------------
insert into public.activity_logs
  (id, agent, unit, message, type, created_at)
values
  ('50000000-0000-4000-8000-000000000001', 'Hospitality AI', 'Hospitality AI', 'Answered guest inquiry about late check-out at Lavender Homestay.', 'action', now() - interval '10 minutes'),
  ('50000000-0000-4000-8000-000000000002', 'Marketing AI', 'Marketing AI', 'Drafted Instagram caption for Cozy Garden weekend promo.', 'action', now() - interval '25 minutes'),
  ('50000000-0000-4000-8000-000000000003', 'Hospitality AI', 'Hospitality AI', 'Requested CEO approval for a 15% loyalty discount.', 'approval', now() - interval '50 minutes'),
  ('50000000-0000-4000-8000-000000000004', 'Finance AI', 'Finance AI', 'Flagged mismatched payout amount from Booking.com for review.', 'alert', now() - interval '1 hour 5 minutes'),
  ('50000000-0000-4000-8000-000000000005', 'CEO Chief of Staff', 'CEO Overview', 'Compiled daily priority brief for CEO review.', 'info', now() - interval '1 hour 30 minutes'),
  ('50000000-0000-4000-8000-000000000006', 'iSTEAM AI', 'iSTEAM AI', 'Updated enrollment tracker with 3 new leads.', 'info', now() - interval '10 hours'),
  ('50000000-0000-4000-8000-000000000007', 'Finance AI', 'Finance AI', 'Reconciled OTA payouts for the first half of July.', 'action', now() - interval '14 hours'),
  ('50000000-0000-4000-8000-000000000008', 'Knowledge AI', 'Knowledge Center', 'Google Drive sync skipped — integration not yet connected.', 'alert', now() - interval '20 hours'),
  ('50000000-0000-4000-8000-000000000009', 'Hospitality AI', 'Hospitality AI', 'Confirmed housekeeping schedule for weekend check-ins at Cozy Garden.', 'action', now() - interval '1 day'),
  ('50000000-0000-4000-8000-000000000010', 'Marketing AI', 'Marketing AI', 'Requested CEO approval for July ad spend increase.', 'approval', now() - interval '1 day 2 hours')
on conflict (id) do nothing;
