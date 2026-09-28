-- Group 2 follow-up: cover new foreign keys reported by Supabase advisor.
create index if not exists ai_conversations_hospitality_booking_idx
  on public.ai_conversations(hospitality_booking_id)
  where hospitality_booking_id is not null;

create index if not exists cozy_review_clicks_hospitality_booking_idx
  on public.cozy_review_clicks(hospitality_booking_id)
  where hospitality_booking_id is not null;

create index if not exists hospitality_bookings_ai_booking_record_idx
  on public.hospitality_bookings(ai_booking_record_id)
  where ai_booking_record_id is not null;

create index if not exists hospitality_bookings_property_idx
  on public.hospitality_bookings(property_id)
  where property_id is not null;

create index if not exists hospitality_leads_hospitality_booking_idx
  on public.hospitality_leads(hospitality_booking_id)
  where hospitality_booking_id is not null;

create index if not exists hospitality_reviews_property_idx
  on public.hospitality_reviews(property_id)
  where property_id is not null;
