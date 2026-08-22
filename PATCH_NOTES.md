# TUAN OS — CMI + AI Marketing V0.1

## Phạm vi
Bản vá này triển khai:
- AI Nghiên cứu Khách hàng & Thị trường (CMI)
- AI Marketing ở mức ý tưởng/chiến lược cần test và kiểm chứng

Không triển khai:
- Browser tự động
- Crawling OTA/TpT tự động
- LLM call production
- Ads execution
- Auto post
- Auto budget

## Tại sao chưa nối Browser/AI runtime ngay
Source hiện tại chưa có một API contract đã xác minh cho OpenClaw/LLM/browser research.
Không được giả định hoặc thêm secret/API mới nếu chưa có thiết kế, quyền và rollback.

## File mới
- supabase/migrations/0013_cmi_marketing.sql
- src/data/cmi.ts
- src/server/repositories/cmi.repository.ts
- src/server/services/cmi.service.ts
- src/app/actions/cmi.ts
- src/components/cmi/CmiWorkspace.tsx
- src/app/intelligence/cmi/page.tsx
- agents/cmi/SYSTEM_PROMPT.md
- agents/marketing/SYSTEM_PROMPT.md

## File thay thế
- src/components/Sidebar.tsx
- src/server/container.ts

## Trình tự triển khai an toàn
1. Tạo branch feat/cmi-marketing-v01.
2. Copy các file theo đúng đường dẫn.
3. Chạy npm run lint.
4. Chạy npm run build.
5. Backup database production.
6. Review migration 0013.
7. Chạy migration trên Supabase.
8. Redeploy branch/staging trước nếu có.
9. Test /intelligence/cmi.
10. Test tạo Research Job.
11. Test thêm Source.
12. Test thêm Evidence.
13. Test ghi Insight thủ công.
14. Test tạo Opportunity.
15. Test tạo Marketing Strategy.
16. Xác minh activity_logs.
17. Sau khi đạt mới merge main/deploy production.

## Rollback
Code:
- revert commit/PR chứa CMI.

Database:
- Không drop table ngay khi rollback code.
- Giữ dữ liệu CMI để tránh mất bằng chứng.
- Nếu buộc phải gỡ schema, export 8 bảng trước rồi mới drop theo thứ tự phụ thuộc.

## Definition of Done V0.1
- Route /intelligence/cmi chạy.
- Migration 0013 chạy không lỗi.
- Tạo được Research Job.
- Lưu được nguồn và bằng chứng.
- Lưu được Insight và Opportunity.
- Lưu được Marketing Strategy có nhãn cần test.
- Không có hành động tự chạy Ads/đăng bài/chi tiền.
- Không có secret mới.
- Không có lỗi build/lint.
