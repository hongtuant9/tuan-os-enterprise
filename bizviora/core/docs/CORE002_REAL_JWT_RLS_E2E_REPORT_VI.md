# BIZVIORA — Bằng chứng nghiệm thu đăng nhập JWT thật và phân quyền RLS (Core 002)

**Mốc:** 10/10/2026 | **Môi trường:** Supabase `bizviora-staging-core-002`, project `oxakhhpyvvymujiwuvnm`, tổ chức `siyirombfrwlzpgaofwx` (Free). **Không dùng production**.

## Kết luận

**SIGNED_JWT_AUTH_RLS_E2E_PASS — 11/11.** Bộ kiểm thử `tests/staging-auth-rls.e2e.mjs` chạy qua HTTPS tới Supabase Auth/PostgREST thật từ máy Mac đã được người dùng ủy quyền và đăng nhập Supabase CLI. Kiểm thử Node/Mock riêng cũng đạt **31/31** sau sửa lỗi regex UUID.

Ba danh tính *chỉ dành cho thử nghiệm*, không phải khách thật, đã được tạo bằng Supabase Auth Admin API trên đúng staging. Mật khẩu ngẫu nhiên do tiến trình tạo, JWT được lấy bằng đăng nhập mật khẩu qua Auth API; không ghi vào chat, Git hoặc Drive, không đưa vào log. Mã quản trị chỉ dùng trong tiến trình chuẩn bị thử, không đưa vào BIZVIORA frontend/backend.

## Kết quả từng bài thử JWT/RLS thực

| STT | Tình huống | Kết quả |
|---|---|---|
| 1 | Supabase Auth xác minh JWT thật của ba người dùng khác nhau | PASS |
| 2 | Membership và role: chủ A, nhân viên A, chủ B | PASS |
| 3 | Chủ A không xem tenant B; chủ B không xem tenant A | PASS |
| 4 | Công việc không lộ chéo tenant | PASS |
| 5 | Không có JWT không xem được tenant/membership | PASS |
| 6 | Nhân viên A không được tạo công việc | PASS |
| 7 | Chủ A không tạo được công việc tại tenant B | PASS |
| 8 | Chủ A tạo công việc tại A có audit; chủ B không xem được | PASS |
| 9 | Nhân viên A không được xem audit | PASS |
| 10 | Không được tự tạo quyết định APPROVED qua API trực tiếp | PASS |
| 11 | Không được tự thêm membership để nâng quyền | PASS |

**Thực thi:** 11 bài / 11 đạt / 0 thất bại; thời gian khoảng **6.776 ms**; exit code 0. Kiểm thử có một công việc giả lập và một sự kiện audit thực, được giữ lại trên staging để truy vết, không phải dữ liệu khách thật.

## Đối chiếu staging sau kiểm thử

Đọc lại PostgreSQL: 3 tài khoản Auth thử, 2 tenant thử, 3 membership, 1 task và 1 audit event thuộc đúng các tenant thử. Chưa xóa các bản ghi này vì cần chủ sở hữu phê duyệt riêng thao tác xóa dữ liệu theo phân cấp L3.

**Supabase Security Advisor** hiện có **một cảnh báo WARN: `auth_leaked_password_protection` (Leaked Password Protection Disabled)**. Không coi là lỗi RLS, nhưng chưa phê duyệt thay đổi cấu hình hoặc chi phí; bảo mật toàn hệ thống vẫn HOLD. Các kiểm tra khác cần tiếp tục: quét Git bằng công cụ chuyên dụng (bộ dò heuristic toàn refs đã chạy), restore bản backup độc lập, phân quyền tài chính cá nhân chủ sở hữu, hợp đồng kết nối OTA/Meta và thử tải.

## Nguồn UI đã duyệt

Giữ **BIZVIORA UI V1.7.6** từ ZIP đã được chủ sở hữu gửi. File ZIP đã đối chiếu SHA-256; tệp giao diện demo cũ trong GitHub có SHA khác bản được duyệt. Tài liệu `integration/UI_V176_BASELINE_CONTRACT_VI.md` là hợp đồng tích hợp, **không tuyên bố đã triển khai frontend V1.7.6**.

## Trạng thái điều hành

- `STAGING_FREE_PROJECT_VERIFIED`
- `SIGNED_JWT_AUTH_RLS_11_OF_11_PASS`
- `CORE_UNIT_MOCK_31_OF_31_PASS`
- `SUPABASE_SECURITY_ADVISOR_1_AUTH_WARN`
- `SPECIALIZED_SECRET_SCAN_NOT_RUN`
- `TRANSACTIONAL_LOGICAL_RESTORE_PASS`, `INDEPENDENT_BACKUP_RESTORE_NOT_RUN`
- `OWNER_PRIVATE_NEGATIVE_TEST_NOT_RUN`
- `SECURITY_GATE_HOLD`, `PRODUCTION_UNCHANGED`, `AUTO_SEND_OFF`, `BOOKING_WRITE_OFF`, `PAYMENT_OFF`

**Phê duyệt:** chủ sở hữu đã cho phép tạo Supabase staging riêng chỉ khi chi phí bằng 0, thực hiện JWT A/B và thử RLS, không sửa production. Việc xóa fixture, thay đổi Auth cấu hình, triển khai production, chi ngân sách hoặc bật gửi OTA cần đúng thẩm quyền.

Nguồn quản trị: TASK-BIZ-20261009-001 tại TASK-001 và Technical Build Guide hiện hành.
