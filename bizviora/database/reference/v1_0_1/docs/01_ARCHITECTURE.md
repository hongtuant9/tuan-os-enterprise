# 01 — Kiến trúc Supabase/PostgreSQL BIZVIORA 2.0

## Cơ sở của thiết kế
- Shared Core + Tenant Isolation là phương án mặc định đã được ghi nhận trong TASK-001; Dedicated VPS/runtime chỉ là lựa chọn riêng nếu chi phí/bảo mật được chứng minh.
- TUAN OS là pilot/customer tenant 001, không có đặc quyền đọc các tenant khác.
- Auth là Supabase Auth, principal = `auth.users.id` / `auth.uid()`, mọi yêu cầu resolve membership và tenant phía server.
- Staging quan sát được `public.bv_tenants`, `bv_memberships`, `bv_business_units`, `bv_properties`, `bv_tasks`, `bv_approvals`, `bv_audit_events`, `bv_registration_requests`, `bv_registration_reviews`, `bv_service_plans`, `bv_private.bv_platform_managers`. Không sửa/định nghĩa lại các bảng đã có.

## Data domain / schema
- `public.bv_*`: hệ Core sẵn có, tên cũ được giữ nguyên cho backward compatibility.
- `bv_config`: hồ sơ doanh nghiệp, thiết lập, trạng thái các tích hợp, flag (các thứ chỉ doanh nghiệp được phép cấu hình).
- `bv_crm`: khách hàng, consent, tương tác (PII riêng tenant; consent không được suy diễn).
- `bv_industry`: catalog dịch vụ, phòng/lưu trú, đơn hàng F&B. Các nguồn giá/availability từ nhà cung cấp cần xác minh freshness.
- `bv_ops`: checklist và incident; tasks/approvals hiện có tái sử dụng từ Core.
- `bv_fin`: sổ kế toán doanh nghiệp với entry/line cân bằng tại service transaction, tránh chi phí/khoản chuyển bị đếm trùng.
- `bv_mkt`: campaign + attribution, nguồn và độ tin cậy rõ ràng.
- `bv_people`: nhân sự, phân công theo cơ sở, ca làm.
- `bv_ai`: global agent templates/version + tenant agent instances, memory, knowledge, run, tools, approvals, usage.
- `bv_metrics`: định nghĩa KPI và snapshot; chỉ tính dữ liệu thật nếu `data_origin=real`.
- `bv_audit`: event bất biến ở mức ứng dụng và database; không lưu secret/payload đầy đủ.
- `bv_private`: tài chính cá nhân; không expose Data API / agent query chung.

## Ràng buộc đa doanh nghiệp
- Quan hệ `tenant_id + entity_id` phải dùng composite unique key + composite foreign key, ngăn tham chiếu chéo tenant ngay ở DB.
- Mọi bảng nghiệp vụ có `tenant_id`, `data_origin ('real','synthetic')`, `created_at`, khóa chính UUID.
- User có thể có nhiều membership nhưng mọi request phải kiểm tra tenant context (không tin `tenantId` client gửi).
- RLS `ENABLE` + `FORCE` cho bảng private tenant. Không cấp SELECT nhạy cảm cho `anon`/`authenticated`; dùng backend endpoint scope nhỏ + audit.
- Agent instance tham chiếu template version nhưng template global tuyệt đối không chứa prompt cá nhân, khách hàng, secret.
- Memory/knowledge/vector truy xuất bằng điều kiện tenant+agent+source approved; hậu lọc tại UI không đủ.
- Tool grant chặn mặc định. Runtime giới hạn phạm vi tenant, property, channel và `approval` trước mỗi tool execution, không sử dụng service_role trong agent worker.
- Secrets được giữ ngoài bảng business config, chỉ tham chiếu alias tới Vault/KMS, không chứa credential dạng plaintext.
- Owner personal finance trong private schema và điều kiện ủy quyền riêng, Founder không mặc định được xem.

## 1.000 tenant — chiến lược scale (giả định, chưa benchmark)
- Tổ chức 1 project PostgreSQL dùng chung ban đầu, cache & background jobs có quota/queue per tenant.
- Index dẫn đầu `tenant_id`, truy vấn always scoped; đo `pg_stat_statements` khi có quyền và dùng EXPLAIN ANALYZE trên QA.
- Connection pooling, backpressure và concurrency limits cho Agent; mỗi tenant có token/cost quota theo billing và scheduler kiểm chứng.
- Event/audit/log có thể partition theo tháng nếu vượt ngưỡng đo được; không partition ồ ạt khi chưa có dữ liệu thực.
- Phân tách dedicated runtime/DB cho khách hàng enterprise chỉ theo yêu cầu luật/bảo mật/SLA, không làm mặc định.
- Benchmark theo 10/100/1.000 tenant và tải tương tác; chưa có số throughput/SLA đã chứng minh.

## Data quality & UI
- Mỗi số KPI có `definition_key`, time zone (`Asia/Ho_Chi_Minh` cho TUAN OS), filters, `data_origin`, provenance, freshness.
- UI không hiển thị DEMO như thật và không fallback DEMO khi 401/403/5xx.
- Danh sách service provider không đồng nghĩa đã kết nối; default `NOT_CONFIGURED`, kết nối `CONNECTED` khi có xác minh thật.
