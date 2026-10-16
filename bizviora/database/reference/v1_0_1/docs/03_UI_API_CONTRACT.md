# 03 — UI / API contract: không bao giờ dùng DEMO làm dữ liệu thật

Tất cả endpoint thiết kế dự kiến thuộc `/v1/...`, yêu cầu Supabase session JWT hợp lệ, tenant được server xác minh. PR #596 hiện có `/v1/tenant-settings` read-only source-run, chưa deploy live. Giao diện PR #597 chưa bật live.

| Tab | API tham chiếu | Source | Chính sách khi trống/lỗi |
|---|---|---|---|
| Tổng quan | GET /v1/dashboard/summary | metrics, task, approval | Empty state `NOT_CONFIGURED`, 401/403 fail closed |
| Trợ lý AI | GET /v1/ai/agents, /v1/ai/runs | tenant_agents, agent_runs | Không gọi model nếu thiếu scope |
| Công việc | GET /v1/tasks | public.bv_tasks | Xác minh tenant RLS |
| Phê duyệt | GET /v1/approvals | public.bv_approvals | Quyết định ghi cần RBAC+audit |
| Khách hàng | GET /v1/customers | bv_crm.customers | Mask PII đúng quyền |
| AI Customer | GET /v1/ai/customer/overview | agent_runs/templates/consent | Outbound OFF |
| AI Marketing | GET /v1/marketing/campaigns | bv_mkt.campaigns | ADS_SPEND_OFF |
| AI Operations | GET /v1/ops/incidents | bv_ops.incidents | Không tạo work order giả |
| AI Finance | GET /v1/finance/summary | bv_fin journals | Không trộn personal finance |
| AI HR | GET /v1/hr/shifts | bv_people.shifts | Mask employee PII |
| AI Analytics | GET /v1/metrics/daily | bv_metrics.metric_daily | Chỉ `data_origin=real` cho LIVE |
| Dữ liệu & Tích hợp | GET /v1/integrations | bv_config.connections | `NOT_CONFIGURED` mặc định |
| Báo cáo | GET /v1/reports | metric_definitions | Bắt buộc period+source |
| Cài đặt | GET /v1/tenant-settings | public Core hiện hữu | Source-verified read-only; lỗi không fallback DEMO |

**Owner Google → API thực:** Pending HTTP E2E; không được coi `session visible` là xác minh Bearer HTTP. Không xuất JWT sang chat/log.

**Payload tối thiểu UI:** `{tenantId, status, source, data_origin, verifiedAt, data, errorCode}`. Mỗi trường `status` phân biệt `DEMO`, `NOT_CONFIGURED`, `VERIFIED_READ_ONLY`, `LIVE` và `ERROR`. Không tự đặt `verifiedAt`.

**API ownership:** Backend resolve `tenantId` từ JWT membership; nếu dùng query tenantId client gửi chỉ để xác định tenant mong muốn và bắt buộc recheck. Cấm client tự giả vai trò qua property/tenant switch.

**Agent API:** tenant registry list-only giai đoạn đầu; thực thi tool cần `run_id, agent_id, tenant_id, capability, approval_id` được cross-check trong worker, mọi secret ở KMS, không client-issued grants.
