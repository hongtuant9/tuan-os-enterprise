# 04 — Security acceptance test matrix

## Threat model
- IDOR: Tenant A yêu cầu `tenant_id` của B -> 403; sai tenant composite FK -> SQL FK ERROR.
- Truy cập hạ tầng: exposed public schema/view hay RPC SECURITY DEFINER bypass RLS -> DENY; cấu hình PostgREST expose phải kiểm toán.
- Truy vấn AI: prompt injection hay vector retrieval bỏ tenant filter -> DENY; tool call chéo tenant -> DENY.
- Gia tăng quyền: nhân viên chuyển role qua request parameter, Founder đọc customer data -> DENY trừ ủy quyền/chế độ hỗ trợ đã phê duyệt.
- Lộ secrets: config/audit/log không được chứa token, passwords, API keys.
- Dữ liệu DEMO bị tính vào báo cáo hoặc trở thành booking thật -> DENY.

## Kiểm thử bắt buộc trước mở staging
1. Baseline Auth/Core backup, restore độc lập, verify tenant/membership/task/audit counts, version, issuer/audience.
2. Migration DDL on disposable database with full compatible Supabase roles and signed JWTs A/B, không chỉ stubs.
3. Positive A->A read and negative A->B, B->A, anon, expired/malformed JWT for từng bảng, API, file, agent.
4. Cross-tenant INSERT/UPDATE FK block; tenant_id immutable; role grant/revocation immediate effect; update with audit same transaction.
5. Agent template catalog global read-only, tenant data never in template; memory, chunks, embedding filters enforce tenant/agent/source approved.
6. Tool risk classification and approval-before-execution, rate limit, retry/idempotency, quota, redaction of tool logs.
7. Finance owner-private negative checks, no tenant admin or Founder default read.
8. Load benchmarks at 10/100/1,000 synthetic tenants incl. p95 latency, CPU/RAM/IO, connection pressure, indexing, queue.
9. Retention/deletion, export, right-to-access and disaster recovery test (RPO/RTO agreed by owner, not fabricated).
10. Validate UI: real data only when verified, 401/403/5xx -> error screen, no DEMO fallback. Negative acceptance screenshots and source SHA.

`qa/negative_test_matrix.csv` là bộ kịch bản chi tiết. Test run chưa thực hiện đối với SQL reference trong gói này. Không báo PASS giả.
