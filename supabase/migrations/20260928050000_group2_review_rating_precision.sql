-- Group 2 review source import hardening.
-- Booking.com ratings legitimately include 10.00; numeric(3,2) cannot represent 10.00.
alter table public.hospitality_reviews
  alter column rating type numeric(4,2) using rating::numeric(4,2);

alter table public.hospitality_reviews
  drop constraint if exists hospitality_reviews_rating_check;

alter table public.hospitality_reviews
  add constraint hospitality_reviews_rating_check
  check (rating is null or (rating >= 0 and rating <= 10));

comment on column public.hospitality_reviews.rating is
'Canonical review score on a 0..10 scale. numeric(4,2) is required to represent 10.00 exactly.';
