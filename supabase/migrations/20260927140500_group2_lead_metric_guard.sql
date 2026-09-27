-- Group 2 guard: prevent stale runtime code from treating conversations as leads.
create or replace function public.enforce_hospitality_crm_lead_semantics()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if new.connector_id = 'hospitality_crm'
     and coalesce(new.metadata->>'lead_semantics','') <> 'canonical hospitality_leads only; conversations are inquiries' then
    new.leads_platform := 0;
    new.leads_verified := 0;
    if new.verification_status = 'VERIFIED' then
      new.verification_status := 'PARTIAL';
    end if;
  end if;
  return new;
end;
$guard$;

drop trigger if exists marketing_daily_metrics_lead_semantics_guard on public.marketing_daily_metrics;
create trigger marketing_daily_metrics_lead_semantics_guard
before insert or update on public.marketing_daily_metrics
for each row execute function public.enforce_hospitality_crm_lead_semantics();

update public.marketing_daily_metrics
set leads_platform = 0,
    leads_verified = 0,
    verification_status = case when verification_status = 'VERIFIED' then 'PARTIAL' else verification_status end
where connector_id = 'hospitality_crm'
  and coalesce(metadata->>'lead_semantics','') <> 'canonical hospitality_leads only; conversations are inquiries';

comment on function public.enforce_hospitality_crm_lead_semantics()
is 'Fail-closed guard: Hospitality CRM conversations are inquiries, never verified leads without canonical hospitality_leads semantics.';
