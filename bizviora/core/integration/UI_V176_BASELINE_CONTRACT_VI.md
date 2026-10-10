# BIZVIORA — Hợp đồng tích hợp giao diện khách hàng V1.7.6

**Phiên bản:** V1.7.6 / 10-10-2026 | **Trạng thái:** Chủ sở hữu đã duyệt làm mốc thiết kế qua quyết định DEC-BIZ-20261010-006. Chưa nghiệm thu kết nối backend.

## 1. Bản giao diện có hiệu lực
Tệp ZIP đính kèm trong hội thoại BIZVIORA ngày 10/10/2026: `BIZVIORA_UI_V1_7_6_APPROVED_DESIGN_BASELINE_SYNTHETIC.zip`. 68 mục, dung lượng 33.458.101 byte; SHA-256 **`6b2512c8b0eed00902291e53452c462dafdc1b2cdee8ef5c640a3660437c732b`**. `index.html` bên trong 331.636 byte; SHA-256 **`9d73b6a465cffead74d0c25fada723b9d11b2a5648aec58813636b42882c15ea`**. Bản ZIP lưu Drive: https://drive.google.com/file/d/1vgOztvz2TjK3FsZJXCn4hIDufmah19Cr/view (kích thước khớp; SHA của bản trên Drive chưa xác minh trực tiếp).

**Lưu ý khác biệt:** `bizviora/demo/index.html` hiện trên nhánh GitHub Core 001 có SHA-256 **`f959d62e7b96b491564f8d33dbe0a60300859c210de99a210dd32be131ff3a97`**; KHÔNG trùng `index.html` trong ZIP duyệt. Không được dùng giao diện GitHub hiện hành làm chuẩn hoặc tuyên bố đã cập nhật sang V1.7.6 nếu chưa nhập và kiểm chứng file đúng SHA.

## 2. Những gì phải giữ nguyên khi kết nối dữ liệu thật
Danh mục 14 khu vực: `overview` (Tổng quan), `assistant` (Trợ lý), `tasks` (Công việc), `approvals` (Phê duyệt), `customers` (Danh sách khách), `customer` (AI chăm sóc khách hàng), `marketing`, `operations`, `finance`, `hr`, `analytics`, `data`, `reports`, `settings`.
- Khách hàng: chọn hồ sơ làm thay đổi danh tính, trạng thái và hành trình năm bước; giữ năm tab Hành trình/Thông tin/Dịch vụ/Ghi chú/Phản hồi.
- Công việc: các bộ lọc thời gian, trạng thái, nhân viên, tìm kiếm kết hợp; không thay điều hướng/nút đã được duyệt.
- AI chăm sóc khách: hội thoại theo khách, lịch sử từng kênh cùng trạng thái đầy đủ/không đầy đủ, nguyên bản và dịch tiếng Việt; nháp nhân viên/AI; chỉ chọn tên tệp khi chưa có upload thực; dịch sang ngôn ngữ khách/Anh chỉ khi bản dịch được xác minh. Mọi nút gửi tin thật **TẮT**.
- Responsive desktop/mobile phải theo ảnh đã duyệt trong `screenshots/`, `side_by_side/` và `visual_review.html`.

## 3. Ánh xạ dịch vụ Core 002 được phép
| Phần giao diện V1.7.6 | Kết nối dự kiến | Cổng |
|---|---|---|
| Đăng nhập/Ngữ cảnh | Supabase Auth và `GET /v1/context?tenantId=...` | JWT ký thật A/B chưa PASS |
| Tổng quan doanh nghiệp | tenant → business unit → property theo membership server-side | Không chấp nhận tự khai quyền |
| Công việc | `GET /v1/tasks`, `POST /v1/tasks` khi manager trở lên | RLS SQL thử nghiệm đạt; JWT thật chưa chạy |
| Phê duyệt | `GET /v1/approvals` | **Không mở viết/duyệt** |
| Khách hàng/AI Customer | chờ hợp đồng dữ liệu hội thoại và quyền nhà cung cấp | **Dữ liệu DEMO**, không ghép khách bằng tên |
| Tài chính cá nhân | owner-private, phân quyền độc lập | **Chưa mở dữ liệu thật** |
| OTA/Facebook | không có API đủ quyền đã nghiệm thu | **AUTO_SEND_OFF, BOOKING_WRITE_OFF** |

## 4. Quy trình thay dữ liệu giả bằng dữ liệu thật
1. Giữ nguyên cây điều hướng, hình ảnh, CSS, vị trí điều khiển và nội dung hiển thị V1.7.6. Tạo nhánh tích hợp riêng, không chỉnh `main` hay bản demo đang trình diễn.
2. Kiểm tra SHA archive/index trước tích hợp. Không dùng `bizviora/demo/index.html` khác hash để tự nhận là V1.7.6.
3. Bổ sung lớp giao tiếp (adapter) tách UI và API, chỉ hiển thị dữ liệu thật khi phiên người dùng đã được xác minh bằng token hợp lệ và tenant membership đã được kiểm tra phía máy chủ; khi lỗi hoặc thiếu quyền, hiển thị trạng thái rõ ràng, không tự thay bằng dữ liệu giả mà không gắn nhãn.
4. Từng luồng test A/B: actor chỉ thấy dữ liệu tenant được phép; staff không ghi tác vụ; owner không đọc tài chính cá nhân của owner tenant khác; kiểm tra nhật ký.
5. Chạy lại kiểm thử UI (33/33 tương tác, 7/7 kịch bản, 14/14 màn hình, mobile) **trên phiên bản sau tích hợp**. Các kết quả QA có sẵn trong ZIP chỉ chứng minh prototype trước tích hợp.

## 5. Quy tắc nghiệm thu/rollback
Các chứng cứ hiện hành trong ZIP ghi rõ **DEMO ONLY**, không có lệnh `fetch(` gọi API hay tài khoản OTA thật, bộ nhớ RAM tạm và nút Gửi luôn khóa. Nếu dữ liệu chưa xác minh, ngữ cảnh tenant sai, người dùng thiếu quyền, hoặc bản UI sau tích hợp sai giao diện mốc, phải **TẠM GIỮ** và quay về giao diện V1.7.6 đã duyệt. Không tự gửi tin hoặc sửa booking.

Chủ sở hữu duyệt mốc thiết kế không đồng nghĩa duyệt thao tác ra khách, chi tiền hoặc production. Nguồn quyết định: Master Blueprint `DEC-BIZ-20261010-006`; tiến độ `TASK-001`; kỹ thuật `Technical Build Guide`.
