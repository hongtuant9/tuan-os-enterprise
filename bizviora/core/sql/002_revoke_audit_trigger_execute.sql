-- BIZVIORA CORE 002 — chỉ chạy trên staging độc lập.
-- Migration đã áp dụng và đọc lại trên Supabase staging: oxakhhpyvvymujiwuvnm.
-- Mục đích: chặn gọi trực tiếp SECURITY DEFINER trigger từ API công khai.
REVOKE EXECUTE ON FUNCTION public.bv_task_audit_guard()
FROM PUBLIC, anon, authenticated;
