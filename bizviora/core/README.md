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
