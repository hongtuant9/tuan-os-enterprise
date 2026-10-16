# 06 — Decision Register đề xuất & khoảng trống (KHÔNG PHẢI QUYẾT ĐỊNH ĐÃ DUYỆT)

**REFERENCE ID:** `REF-BV20-DB-AI-20261016-V1` · 16/10/2026 · Author: TUANbiz drafting support · Status: DRAFT / NOT RECORDED in Master Blueprint.

### Kiến trúc tham chiếu
- Shared Core + per-tenant data RLS; optional dedicated Enterprise runtime; existing Core in `public` preserved.
- Four domain principles: CORE, INDUSTRY, CUSTOMER, PRIVATE.
- Global templates versioned without customer data; per-tenant agent instance, memory, knowledge, channel scope, grants, audits and usage.
- QA fixture tenant 001 not identical to real staging tenant; synthetic data never seeded into real TUAN OS tenant.

### Kiểm chứng hiện có vs chưa có
- Đã quan sát live schema hiện hữu `public.bv_*` và `bv_private.bv_platform_managers` ngày 16/10/2026.
- PR #596 QA HTTP JWT A/B 5/5 PASS theo checkpoint; riêng SQL reference này chưa được thực thi và không kế thừa PASS đó.
- PR #597 settings UI 8/8 synthetic tests PASS theo checkpoint, UI vẫn DEMO.
- Owner Google Auth -> PR #596 HTTP E2E staging endpoint: CHƯA PASS.
- Full Core/Auth backup/restore: CHƯA PASS.
- 1.000 doanh nghiệp load test: CHƯA CHẠY, không cam kết số TPS.
- Risk: SECURITY_GATE_HOLD, STAGING_DEPLOY_HOLD, PRODUCTION_HOLD.

### Rà soát trước quyết định chính thức
Cần CTO rà hợp đồng API, legal/privacy, RPO/RTO, data retention, storage region, Supabase pricing, pgvector embedding size/model, tenant sub-unit role scopes, audit owner approvals, explicit change requests. Không tự chuyển bản này thành kiến trúc được duyệt.

### Nguồn tham chiếu chính thức
- Google Drive `TUAN OS Enterprise — Master Blueprint 2026–2030`.
- `TASK-001_Trung tâm giao việc TUAN OS` và `APPROVAL-001`.
- `TUAN OS Enterprise — Technical Build Guide`.
- BIZVIORA root Index: Google Drive `00_CHI_MUC`.
- PR #596, #597 trong repository `hongtuant9/tuan-os-enterprise`.
