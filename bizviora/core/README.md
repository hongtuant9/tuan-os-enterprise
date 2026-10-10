# BIZVIORA — NỀN TẢNG LÕI 001 (CORE MVP 001)

Trạng thái: **MÃ NGUỒN THỬ NGHIỆM, CHƯA TRIỂN KHAI CƠ SỞ DỮ LIỆU THẬT**.

Nền tảng lõi xây dựng trên nhánh `feature/bizviora-core-mvp-001-20261010`; nhánh này tách khỏi production main và nhánh giao diện Render. Không có tích hợp OTA/Facebook thật, không có chức năng tự gửi hoặc sửa đặt phòng.

## Chức năng
- Xác minh token người dùng bằng Supabase Auth; tenant và vai trò luôn đọc từ CSDL, không tin dữ liệu do trình duyệt tự khai.
- GET /health; GET /v1/context; GET /v1/tasks; POST /v1/tasks; GET /v1/approvals.
- Phân quyền nhân viên chỉ đọc, quản lý trở lên mới được tạo tác vụ; phê duyệt chỉ được đọc.
- Mẫu SQL riêng `bv_*` có quyền mức hàng (RLS), quan hệ Tenant → Business Unit → Property và nhật ký thay đổi công việc trong cùng giao dịch.
- Cấm service role ở ứng dụng người dùng; bảo vệ các hành động không được phê duyệt.

## Chạy kiểm thử mã nguồn, không cần tài khoản thật
```sh
cd bizviora/core
npm test
```

## Chuẩn bị hệ thống thử nghiệm THẬT (chưa được thực hiện)
1. Chủ sở hữu duyệt dự án Supabase **staging độc lập**; xác minh không trùng ID Supabase TUAN OS đang hoạt động.
2. Chạy thủ công `sql/001_STAGING_ONLY_init.sql` chỉ trên staging, sau khi xác minh đối tượng.
3. Tạo hai tài khoản A/B bằng Supabase Auth, người dùng tự đặt thông tin đăng nhập, cấp membership qua giao diện quản trị staging đáng tin cậy.
4. Cấu hình biến môi trường trên máy thử; không đưa giá trị khóa vào tài liệu hay Git:
   `BIZVIORA_STAGING_ACK=STAGING_ONLY`,
   `BIZVIORA_SUPABASE_URL`,
   `BIZVIORA_SUPABASE_ANON_KEY`,
   `BIZVIORA_STAGING_PROJECT_REF`.
5. Sau khi cài `npm ci` ở thư mục repository root, chạy `node bizviora/core/server.mjs`. Chỉ lắng nghe 127.0.0.1:4317.
6. Kiểm thử từ JWT đăng nhập A/B, từ chối truy cập chéo, sự kiện ghi nhật ký và phục hồi độc lập.

## Điều kiện dừng
**SECURITY_GATE_HOLD / AUTO_SEND_OFF / BOOKING_WRITE_OFF / REAL_CUSTOMER_OFF / PAYMENT_OFF**.

Bài kiểm thử giả lập **không** thay cho thử RLS thật, sao lưu/khôi phục hay rà soát bảo mật. Không nhập dữ liệu sản xuất, không tạo giao dịch tài chính, không thay quyền tài khoản, không tự phát hành sản phẩm cho khách ngoài.

Nguồn quyết định: Master Blueprint BIZVIORA, TASK-001, APPROVAL-001, Technical Build Guide.


## Core 002 — Staging đã tạo, cổng JWT thật chưa đạt (10/10/2026)

- **Đúng dự án staging duy nhất được phê duyệt:** `oxakhhpyvvymujiwuvnm` (`bizviora-staging-core-002`, Singapore, tổ chức Free), chi phí tạo dự án được Supabase xác nhận **0 USD/tháng**.
- **CẤM** chạy migration / runtime trên `mmxgthzafjoienokyplw` (TUAN OS production) hoặc `zydtetnvguvlhpkjlvqi` (CSKH cũ). Runtime và bộ E2E đã khóa chính xác ref staging.
- Migration `bizviora_core_001_staging_rls_audit` áp dụng thành công; `bizviora_core_002_revoke_audit_trigger_execute` thu hồi quyền thực thi công khai của hàm `SECURITY DEFINER`.
- Supabase đã xác minh 7 bảng `bv_*` bật RLS; 9 chính sách; công cụ kiểm tra bảo mật: **0 cảnh báo** sau sửa. Mục hiệu năng có những nhắc nhở index cần theo dõi theo tải thật.
- SQL đã kiểm thử A/B và vai trò owner/staff trong giao dịch staging với ngữ cảnh quyền Postgres + `request.jwt.claim.sub` **mô phỏng**. Giao dịch `ROLLBACK`; kiểm tra sau thử: 0 tenant, task, audit và tài khoản giả lập.
- **CHƯA** có thử JWT phát hành qua Supabase Auth API, tài khoản Auth đăng nhập thật A/B, sao lưu/khôi phục và quét bí mật toàn bộ lịch sử Git. Do đó **SECURITY_GATE_HOLD**.

### Chạy kiểm thử JWT/RLS thật khi có tài khoản staging được tạo đúng quy trình

Chỉ tạo tài khoản thử bằng **Supabase Auth** trên **dự án staging BIZVIORA**. Dùng 3 danh tính khác nhau (chủ doanh nghiệp A, nhân viên A, chủ doanh nghiệp B). Không lấy dữ liệu/tài khoản sản xuất. Cần seed membership một cách có kiểm soát qua giao diện quản trị staging để A không được nhìn thấy B, staff không được tự thêm task và chủ A/B độc lập.

Thiết lập biến môi trường qua trình quản lý bí mật **tại máy chạy thử**, không gửi mật khẩu, JWT, API key qua ChatGPT, Drive, Git hay log:
- `BIZVIORA_STAGING_E2E_ACK=RUN_ON_ISOLATED_STAGING`
- `BIZVIORA_STAGING_PROJECT_REF=oxakhhpyvvymujiwuvnm`
- `BIZVIORA_SUPABASE_URL`, `BIZVIORA_SUPABASE_ANON_KEY`
- `BIZVIORA_TEST_TENANT_A`, `BIZVIORA_TEST_TENANT_B`
- `BIZVIORA_TEST_JWT_OWNER_A`, `BIZVIORA_TEST_JWT_STAFF_A`, `BIZVIORA_TEST_JWT_OWNER_B`

Cài phụ thuộc trong thư mục `bizviora/core` (từ bản mã đã xác minh), sau đó chạy `npm run test:staging:auth-rls`. Không gửi kết quả chứa token. Kiểm tra từng giả định kiểm thử, dữ liệu ghi nhật ký, và xác nhận tenant A không thể đọc/ghi B rồi mới đề nghị gỡ cổng bảo mật. Bộ kiểm thử này **tạo công việc thử** và không tự xóa, chỉ chạy trên môi trường staging cách ly.

Tài liệu/điểm tiếp nối: TASK-001 và Technical Build Guide. Không triển khai OTA/Facebook tự gửi, giá, thanh toán hoặc khách ngoài.


## Bằng chứng Core 002 bổ sung — 10/10/2026

**Thiết kế khách hàng đã duyệt:** BIZVIORA UI V1.7.6 theo quyết định `DEC-BIZ-20261010-006`. Đường dẫn bản ZIP trên Drive: https://drive.google.com/file/d/1vgOztvz2TjK3FsZJXCn4hIDufmah19Cr/view . Mã SHA-256 của **file đính kèm đã trực tiếp kiểm tra** `6b2512c8b0eed00902291e53452c462dafdc1b2cdee8ef5c640a3660437c732b`. Giao diện `bizviora/demo/index.html` hiện tại có hash **KHÁC**. Xem `integration/UI_V176_BASELINE_CONTRACT_VI.md`; không thay giao diện đã duyệt bằng bản khác.

**Hồi quy mã Core:** khi chạy trực tiếp nhánh GitHub trên máy Mac đã được ủy quyền, lần đầu chỉ có **16/29** bài đạt do biểu thức kiểm tra UUID thiếu nhóm thứ tư. Đã sửa trong `src/access.mjs`, bổ sung kiểm thử, chạy lại tại commit `912a140d7bea596dea11c80c3cec2c4ec25bb1c3`: **31/31 bài đạt**. Chỉ là bài kiểm thử Node bằng dữ liệu giả, không thay kết quả JWT thật.

**Kiểm thử bảo mật Git đọc-only:** sao chép mirror ở thư mục tạm không đồng bộ đám mây trên máy Mac; rà soát toàn bộ **1.158 refs / 13.460 Git objects / 2.604 blobs**, khoảng 49,7 MB nội dung text. Bộ dò heuristic tự viết phát hiện **0 mẫu khóa/token có chữ ký đặc trưng**; 43 lượt khớp biểu thức gán bí mật trong lịch sử (37 vị trí duy nhất được phân loại là biến/biểu thức thực thi). Không xuất giá trị bí mật ra log/chat. **Chưa chạy máy quét chuyên dụng Gitleaks/TruffleHog; không tuyên bố full secret scan đạt chuẩn phát hành.**

**Diễn tập khôi phục mức logic:** script `sql/004_STAGING_ONLY_LOGICAL_RESTORE_TRANSACTIONAL_TEST.sql` trên đúng staging tạo dữ liệu hoàn toàn giả lập, sao chép vào bảng tạm, xóa rồi khôi phục và so khớp 6 bảng, `ROLLBACK` kết thúc, đọc lại tất cả bảng nghiệp vụ liên quan đều còn **0 bản ghi**. Bản đầu của kịch bản bị lỗi thứ tự trigger/audit; đã sửa và chạy lại thành công. **Chưa diễn tập restore từ bản backup vật lý/logical độc lập trên dự án khác**, do đó `RESTORE_FULL_GATE_HOLD`.

**Đăng nhập thật:** Supabase CLI cài trên máy Mac nhưng chưa có phiên đăng nhập quản trị. Connector không có API tạo người dùng Auth; **3 JWT thực của Auth vẫn chưa được cấp**, bộ `tests/staging-auth-rls.e2e.mjs` **CHƯA CHẠY**. Không đăng mật khẩu/token vào chat, Drive hoặc Git. `REAL_JWT_E2E_NOT_RUN`, `SECURITY_GATE_HOLD`, `PRODUCTION_OFF`.

Nhật ký chính thức tại Technical Build Guide và TASK-001.
