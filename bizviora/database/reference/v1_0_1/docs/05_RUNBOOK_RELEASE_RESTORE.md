# 05 — Migration, rollback, vận hành và backup/restore

## Thứ tự thay đổi bắt buộc
0. Đối chiếu SSOT Master Blueprint, TASK-001, APPROVAL-001, baseline Git/Supabase ref; giữ `PRODUCTION_HOLD`.
1. `00_readonly_inventory.sql` chỉ đọc, lưu hash schema hiện trạng (không chứa dữ liệu nhạy cảm).
2. Clone **Core + Auth** vào QA cô lập, không dùng production backup nếu chưa được phê duyệt xử lý dữ liệu. Có phương án synthetic clone khi không được chuyển dữ liệu thật.
3. Run reference additive SQL trong QA bằng role migration đủ quyền (không chạy bằng user/JWT trong ứng dụng).
4. Thực thi test RLS, FK, Auth signed-JWT, Agent negative, tool and private boundaries, WAL backup/restore.
5. Đo p95 API/DB, hạ tầng, agent concurrency & costs; ghi evidence + SHA + EXPLAIN.
6. Khi đạt Gate A/B: đề nghị owner phê duyệt `STAGING DDL DEPLOY` riêng; snapshot trước thay đổi và staged rollout (feature flag OFF).
7. Cấu hình API/UI read-only trước, Owner Google HTTP 200 nghiệm thu, không bật outbound.
8. Staging UAT + rollback rehearsal; production L3 phê duyệt **riêng**, không tự triển khai theo gói tài liệu này.

## Rollback
- Additive migration không tương đương rollback tự do: tạo bảng, triggers và policy có thể đã được tham chiếu dữ liệu mới.
- Trước khi có ghi live: disable flags, revert API image, xác minh các bảng độc lập, rollback migration trên QA hoặc khôi phục baseline được phê duyệt.
- Sau khi có ghi live: KHÔNG DROP hay xóa data. Chuyển read-only, snapshot/export, quyết định data reconciliation hoặc restore theo RPO/RTO đã được chủ sở hữu chấp thuận.
- Nếu tenant isolation leak, invalid finance balance, unauthorized outbound hoặc audit missing: đóng write gate, dừng agent worker, giảm blast radius, báo sự cố, giữ log an toàn và rollback.

## Các công tắc mặc định
`AUTO_SEND_OFF`, `BOOKING_WRITE_OFF`, `ADS_SPEND_OFF`, `AGENT_TOOLS_OFF` cho mọi synthetic/tenant mới. Không tự bật.

## Backup strategy
- Backup PITR tùy gói và được phê duyệt chi phí; pg_dump logical theo schema + auth/roles dependencies khi thích hợp; encrypted offsite copies.
- Restore drill định kỳ ở hệ cô lập, đối chiếu primary keys, tenant scopes, audit, owner PRIVATE grants, Storage object references và schema migration.
- Không lưu backup chứa PII/credentials vào thư mục Drive tham chiếu này.

## Bằng chứng release
Time, operator, environment, project ref, repo SHA, migration checksum, QA result IDs, Auth A/B proof, backup/restore verified timestamp, rollback test, owner approver. Thiếu bất kỳ mục quan trọng -> HOLD.
