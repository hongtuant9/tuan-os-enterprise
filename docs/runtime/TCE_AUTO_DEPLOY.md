# TCE — GitHub → Coolify → VPS Autopilot

Trạng thái: cấu hình chế độ tự vận hành liên tục ngày 20/09/2026.

## Mục tiêu
Toàn bộ runtime Tam Coc Experience hoạt động trên VPS/Coolify và không phụ thuộc vào máy Windows hoặc MacBook của Owner.

## Chuỗi vận hành
1. Mã nguồn chính thức nằm trên GitHub `main`.
2. Push/merge vào `main` được GitHub Webhook chuyển tới Coolify.
3. Coolify build và chạy container trên VPS với chính sách tự khởi động lại.
4. `start.mjs` khởi chạy các worker an toàn trong cùng runtime:
   - Đồng bộ dữ liệu: 5 phút.
   - Hội đồng Điều hành/TUAN-OS: 5 phút.
   - Vận hành nhân sự: 5 phút.
   - Hàng đợi nghiên cứu CMI: 15 giây khi có việc.
5. GitHub Actions watchdog chạy mỗi giờ và kiểm tra trực tiếp VPS `57.128.186.45` bằng SNI `app.tamcocexperience.com`, vì vậy nghiệm thu runtime không phụ thuộc DNS public hoặc máy cá nhân.
6. Public DNS vẫn được kiểm tra riêng để phát hiện lỗi định tuyến khách hàng.

## Chế độ mặc định
- `TCE_COMPANY_AUTOPILOT_ENABLED`: bật trừ khi đặt rõ `false`.
- Executive Worker: bật trừ khi đặt rõ `false`.
- Sync Worker: bật trừ khi đặt rõ `false`.
- Staff Ops Worker: bật trừ khi đặt rõ `false`.
- CMI Browser/Queue Worker: bật trừ khi đặt rõ `false`.
- TCE Agent AI chỉ dùng model tạo sinh khi có OpenAI key và ngân sách ngày/tháng đã được duyệt; nếu không có ngân sách thì fail-closed.

## Guardrails
- Không tự mở chi ngân sách quảng cáo, chuyển tiền, hoàn tiền, xử lý nợ hoặc thay đổi giá lớn.
- Không tự mở thêm kênh khách hàng ngoài phạm vi đã phê duyệt.
- Không tự bật KiotViet write/direct-booking auto-create nếu gate chưa PASS.
- Mutation phá hủy phải có rollback.
- NEED VERIFY/HOLD không được biến thành fact.
- DOC-GOV-001 áp dụng cho tài liệu/báo cáo nội bộ.

## Tiêu chuẩn nghiệm thu VPS
`/health` trực tiếp trên managed VPS phải trả HTTP 200 và:
- `runtime=tce-executive-org-v1`
- `agentRegistry>=16`
- `executiveOrgRoles>=11`
- `companyAutopilot=v1`
- `companyRuntimeMode=VPS_ALWAYS_ON`
- `desktopDependency=false`
- Executive / Sync / Staff Ops / CMI workers đều enabled
- app/database OK
- guardrails write vẫn giữ trạng thái an toàn.

Public DNS route là một lớp riêng: lỗi DNS không được hiểu nhầm là toàn bộ VPS đã dừng.
