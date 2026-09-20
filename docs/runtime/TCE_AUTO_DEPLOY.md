# TCE — OVH-only VPS Autopilot

**Authority:** DEC-TCE-OVH-ONLY-20260920-001  
**Production host:** OVH 57.128.186.45  
**DNS authority:** Tenten  
**Hostinger:** HẾT HIỆU LỰC (SUPERSEDED)  
**Desktop dependency:** none

## Chuỗi triển khai

1. GitHub `main` là source chính thức.
2. OVH systemd timer kiểm tra GitHub mỗi 5 phút.
3. Khi SHA thay đổi, VPS tự build candidate.
4. Candidate phải PASS `/health`, runtime và company autopilot.
5. PASS mới switch primary container; nếu fail thì giữ bản cũ.
6. Caddy trên OVH phục vụ HTTP/HTTPS cho `app.tamcocexperience.com`.
7. GitHub Actions watchdog kiểm tra OVH trực tiếp và sau đó kiểm tra DNS/HTTPS public.

## Secret

Secret production chỉ đặt tại:

`/opt/tuan-ai/secrets/tce-app.env`

Không lưu giá trị secret trong Git, Google Drive, chat hoặc log.

## Worker always-on

- TUAN-OS / Executive Worker: 5 phút.
- Sync Worker: 5 phút.
- Staff Ops Worker: 5 phút.
- CMI Browser/Queue Worker: chạy theo company autopilot.
- Paid AI vẫn theo key + budget gate riêng.

## Guardrails

- Ads spend/bid/budget: approval-gated.
- KiotViet write/direct booking auto-create: fail-closed.
- Refund/payment/debt/pricing lớn: approval-gated.
- Customer channel ngoài phạm vi duyệt: không tự mở.
- Mutation phá hủy: phải có rollback.

## Nghiệm thu

Bắt buộc:
- app/database OK;
- runtime `tce-executive-org-v1`;
- agentRegistry >= 16;
- companyAutopilot = v1;
- companyRuntimeMode = VPS_ALWAYS_ON;
- desktopDependency = false;
- Executive/Sync/Staff Ops/CMI enabled;
- write guardrails an toàn;
- DNS Tenten trỏ OVH và public HTTPS /health = 200.

Runbook: `docs/runtime/TCE_OVH_ONLY_MIGRATION.md`.
