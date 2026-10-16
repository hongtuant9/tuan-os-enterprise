# 02 — Data dictionary và độ ưu tiên

| Schema | Table | Key / mối liên hệ | UI / mục đích | Ưu tiên |
|---|---|---|---|---|
| public | bv_tenants | id | Tenant registry hiện hữu | P0 EXISTING |
| public | bv_memberships | unique(tenant_id,user_id) | Phân quyền hiện hữu | P0 EXISTING |
| public | bv_business_units, bv_properties | (tenant_id,id) | Đơn vị / cơ sở | P0 EXISTING |
| public | bv_tasks, bv_approvals, bv_audit_events | scoped FK | Workflow hiện hữu | P0 EXISTING |
| bv_config | tenant_profiles | PK tenant_id | Cài đặt thông tin DN / version | P1 |
| bv_config | feature_flags | (tenant_id,flag_key) | Các cổng AUTO_SEND / BOOKING / ADS | P1 |
| bv_config | connector_catalog, connections | (tenant_id,id) | Kết nối ứng dụng: chưa xác minh | P1 |
| bv_crm | customers, customer_consents, interactions | (tenant_id,id), customer composite FK | CRM & AI CSKH | P2 |
| bv_industry | service_catalog | (tenant_id,id) | Danh mục dịch vụ | P1 |
| bv_industry | rooms, reservations | room composite FK | PMS & Booking | P2 |
| bv_industry | orders, order_lines | order + item composite FK | F&B bán hàng | P2 |
| bv_ops | checklists, incidents | property composite FK | Ops | P2 |
| bv_people | staff_profiles, shifts | user and property scoped | HR | P2 |
| bv_fin | accounts, journals, journal_lines | balanced double-entry service gate | Business Finance | P3 |
| bv_mkt | campaigns, campaign_events | scoped campaign FK | Marketing & attribution | P2 |
| bv_ai | agent_templates, template_versions | global, no customer data | Agent Template Library | P1 |
| bv_ai | tenant_agents | tenant+template version | AI Agent registry | P1 |
| bv_ai | tool_catalog, agent_tool_grants | tenant+agent FK | Tool policy deny by default | P1 |
| bv_ai | knowledge_sources, knowledge_chunks | tenant+agent+source FK | RAG provenance | P2 |
| bv_ai | agent_memory | tenant+agent FK; ciphertext | Private memory | P2 |
| bv_ai | agent_runs, run_steps, tool_executions | tenant+run FK | AI execution & audit | P2 |
| bv_ai | agent_approvals, usage_daily | tenant+run FK | Approval + cost | P2 |
| bv_metrics | metric_definitions, metric_daily | metric + tenant FK | Analytics & dashboard | P2 |
| bv_audit | tenant_events | tenant + actor | Immutable security audit | P1 |
| bv_private | owner_finance_envelopes | owner_user_id, ciphertext | Owner PRIVATE; not shared API | P3 |

## Chuẩn trường
- `id uuid` định danh nội bộ; không dùng tên doanh nghiệp/hostname làm khóa.
- `tenant_id uuid NOT NULL` trên tenant tables, `UNIQUE (tenant_id,id)` để tham chiếu composite FK.
- `data_origin`: chỉ nhận `real` hoặc `synthetic`; `synthetic` loại khỏi báo cáo/chỉ số thật.
- `created_at timestamptz`, `updated_at` (nếu bảng mutable), `created_by` khi có actor.
- `status` bắt buộc rõ: `DISABLED`, `DRAFT`, `PENDING_APPROVAL`, `ACTIVE`, `ERROR`, `UNVERIFIED` tùy miền; không giả định một Enum bao quát tất cả.
- `amount_minor bigint` + `currency text` cho tiền; đừng dùng floating point; giao dịch qua ledger cần double-entry.
- PII, policy, giá và thông tin đặt phòng giữ provenance/approved_at/verified_at khi công việc thực tế cần.

## Quy tắc thay đổi schema
- Không đổi tên/drop `public.bv_*` đang hoạt động nếu không có migration compatibility + rollback.
- DDL reference mới là tổng thể đích; chỉ triển khai P1 trước, phần khác sau khi có Use Case và KPI.
- Test migration và rollback trên copy/clone QA gồm Auth và tenant negative, trước khi trình phê duyệt staging.
