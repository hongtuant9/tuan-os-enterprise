# BIZVIORA 2.0 — Database & AI Agent Reference Pack (V1.0)

**Ngày phát hành bản tham chiếu:** 2026-10-16  
**Trạng thái:** `REFERENCE / QA-ONLY / NOT AN APPROVED MIGRATION`  
**Nguồn điều phối hiện hành:** Google Drive Master Blueprint, Technical Build Guide, TASK-001, APPROVAL-001. Bộ này là tài liệu tham chiếu bổ sung, KHÔNG thay thế SSOT.  
**Khách hàng đầu tiên:** TUAN OS Enterprise tenant 001; tenant thật staging `308e6d09-9410-492e-8468-4c978226da41` (chỉ đọc; KHÔNG seed lên tenant này).

## Mục tiêu
- Thiết kế PostgreSQL/Supabase để BIZVIORA tăng lên 1.000 tenant dựa trên phép đo tải và bảo mật.
- Một Core dùng chung, dữ liệu độc lập theo tenant, Agent Template Library không có dữ liệu khách hàng, Agent Instances riêng theo từng tenant.
- Có cấu trúc nghiệp vụ, CRM, hospitality, F&B, tài chính, marketing, nhân sự, báo cáo, AI, integration, audit, owner PRIVATE.
- Giảm vendor lock-in: SQL thuần PostgreSQL khi phù hợp, schema phiên bản hóa, backup/restore và rollback có điều kiện.

## Phân loại trạng thái (không trộn lẫn)
- **VERIFIED LIVE SCHEMA**: 11 `public.bv_*` và `bv_private.bv_platform_managers` đã quan sát trên Supabase staging 2026-10-16, không ngụ ý các bảng mới tồn tại.
- **DESIGNED**: schema trong `sql/10_reference_additive.sql` và `sql/20_read_policies_draft.sql` — chưa thực thi trên Supabase QA/staging.
- **QA SYNTHETIC**: `sql/90_qa_seed.sql` chỉ dành cho database QA có cờ chặn, không dùng trên tenant thật.
- **RELEASE HOLD**: chủ sở hữu phải phê duyệt riêng trước ALTER trên staging, deploy, secrets, production.

## File sử dụng
1. `docs/01_ARCHITECTURE.md`: ranh giới dữ liệu, Agent, cost, scale.
2. `docs/02_DATA_DICTIONARY.md`: mô tả miền dữ liệu và liên kết.
3. `docs/03_UI_API_CONTRACT.md`: mapping 14 tab UI, API, quyền và fail-closed.
4. `docs/04_SECURITY_TEST_PLAN.md`: threat model, RLS, Agent, negative tests, release gates.
5. `docs/05_RUNBOOK_RELEASE_RESTORE.md`: QA -> staging -> production, backup/restore, rollback.
6. `docs/06_DECISIONS_AND_GAPS.md`: quyết định đề xuất, yếu tố chưa kiểm chứng.
7. `sql/00_readonly_inventory.sql`: inventory read-only, không thay đổi DB.
8. `sql/10_reference_additive.sql`: DDL tham chiếu, bổ sung schema/bảng, tương thích với Core `public.bv_*`; **KHÔNG chạy lên staging**.
9. `sql/20_read_policies_draft.sql`: RLS read-only tối thiểu, từ chối write; **KHÔNG triển khai trước kiểm toán**.
10. `sql/90_qa_seed.sql`: dữ liệu synthetic cho 4 tenant chỉ QA; không sao chép tài khoản, khách hay dữ liệu thật.
11. `qa/negative_test_matrix.csv`, `qa/load_profile.json`, `manifests/*`: checklist nghiệm thu và hash.

**Không có dữ liệu bí mật, mật khẩu, access token, keys, JWT hoặc service_role trong gói.**
