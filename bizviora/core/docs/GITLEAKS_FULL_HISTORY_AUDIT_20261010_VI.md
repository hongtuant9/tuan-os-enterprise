# BIZVIORA — Kiểm toán toàn lịch sử Git bằng Gitleaks chính thức

Ngày: 10/10/2026. Trạng thái: **ĐÃ THỰC HIỆN QUÉT / CẦN RÀ SOÁT 26 CẢNH BÁO / CHƯA GỠ SECURITY_GATE_HOLD**.

## 1. Phê duyệt, phạm vi và phương pháp

Chủ sở hữu phê duyệt rõ việc tải bản Gitleaks chính thức vào thư mục tạm trên Mac, quét chỉ đọc toàn bộ lịch sử Git của TUAN OS/BIZVIORA, không cài dịch vụ nền, không chỉnh production, không chi phí.

- Công cụ: `gitleaks/gitleaks`, bản phát hành ổn định **v8.30.1**, macOS `darwin_arm64`.
- Đã so khớp SHA-256 của archive với **digest asset** tại GitHub Releases API và **checksums.txt** chính thức; đều PASS. SHA-256 của archive: `b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5`.
- Công cụ đặt trong thư mục riêng quyền 0700 tại `/tmp/bizviora-gitleaks-b8hx6j7f/`; không cài Homebrew, không daemon, không tạo dịch vụ nền.
- Đối tượng: Git mirror tại `/tmp/bizviora-git-audit.Doh7IE/repo.git` được sao chép chỉ đọc, **1.158 refs**, lựa chọn lịch sử `--log-opts='--all'`.
- Lệnh: `gitleaks git --no-banner --log-level error --redact=100 --log-opts='--all' --report-format=json --report-path=<thư mục tạm>/official_findings_sensitive.json <Git mirror>`.
- Báo cáo chi tiết giữ tại Mac, không gửi secret, token, JWT, password hoặc giá trị khớp vào Google Drive, GitHub hay chat. Báo cáo lược bỏ bí mật: `/tmp/bizviora-gitleaks-b8hx6j7f/redacted_summary.json`.
- Không thay đổi production, hạ tầng, quyền truy cập hoặc mã nguồn nghiệp vụ. Không phát sinh chi phí.

## 2. Kết quả công cụ

| Chỉ tiêu | Giá trị |
|---|---|
| Gitleaks version | 8.30.1 |
| Refs được bao phủ bởi tùy chọn quét | 1.158 |
| Tổng lượt phát hiện | **26** |
| Rule ID | `generic-api-key` |
| `src/server/hospitality/room-supply-qr.ts` | **24 lượt** trên 2 commit lịch sử |
| `src/server/channels/omnichannel-worker.ts` | **2 lượt** trên 2 commit lịch sử |
| Trạng thái review | **REVIEW_REQUIRED**, chưa xác nhận lộ khóa thực tế |

**Quy tắc bảo mật khi diễn giải:** do bật `--redact=100`, tất cả trường `Secret` trong JSON đều có giá trị **REDACTED**. Đây là giá trị che nội dung do công cụ tạo, **không phải chuỗi khóa thật**. Do đó KHÔNG được suy luận 26 lượt chỉ thuộc một khóa duy nhất từ JSON đã ẩn giá trị, cũng không được kết luận các lượt phát hiện đều là dương tính giả.

Mọi vị trí phải được đối chiếu bằng rà soát cục bộ an toàn ở đúng commit, xác định đó là dữ liệu giả lập/hằng số hoặc khóa thật còn có hiệu lực; nếu là bí mật thật phải xử lý riêng qua phê duyệt quản trị, đánh giá phạm vi ảnh hưởng và thay khóa qua kênh bí mật. **Không xuất nội dung khóa vào chat, Drive, Git hay nhật ký.**

## 3. Tiêu chí đóng cổng quét Git

1. Người phụ trách rà soát đủ **26 lượt phát hiện**, nhóm trùng theo bí mật thực *chỉ trong môi trường riêng có kiểm soát*, không dùng trường `REDACTED` để đếm.
2. Mỗi phát hiện có phân loại **TRUE_POSITIVE / FALSE_POSITIVE / INCONCLUSIVE**, chủ sở hữu xác nhận mức ảnh hưởng, ghi số lượng và đường dẫn commit/line, tuyệt đối không công bố chuỗi.
3. Nếu xác nhận có khóa thật trong lịch sử, giữ `SECURITY_GATE_HOLD`, đưa phương án thu hồi/đổi khóa và xác minh đã hết quyền; phải có phê duyệt trước thao tác thay quyền hoặc sửa production.
4. Quét kiểm tra lại sau khắc phục, lưu báo cáo số liệu đã loại nội dung nhạy cảm và quyết định duyệt.
5. Cổng bảo mật tổng thể vẫn HOLD cho đến khi hoàn thành backup/restore độc lập, bảo vệ tài chính chủ sở hữu và các điều kiện hiện hành.

## 4. Trạng thái và bằng chứng quản trị

`OFFICIAL_GITLEAKS_V8_30_1_VERIFIED` / `FULL_REFS_SCAN_EXECUTED` / `26_GENERIC_API_KEY_FINDINGS` / `FINDINGS_REVIEW_REQUIRED` / `ZERO_NEW_SPEND` / `PRODUCTION_UNCHANGED` / `SECURITY_GATE_HOLD`.

Checkpoint tiến độ duy nhất: TASK-BIZ-20261009-001 tại TASK-001; giải trình kỹ thuật tại Technical Build Guide. Không coi báo cáo này là quyền phê duyệt xóa dữ liệu, viết lại Git history, sửa Git main, thay khóa, nâng cấp dịch vụ hoặc triển khai production.
