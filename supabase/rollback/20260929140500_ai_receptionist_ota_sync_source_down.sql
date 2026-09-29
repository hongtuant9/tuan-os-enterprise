update public.sync_sources
set schedule_enabled=false, status='idle', updated_at=now()
where key='ai_receptionist_ota_email';
