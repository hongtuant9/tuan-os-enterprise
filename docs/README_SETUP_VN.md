# Hướng dẫn triển khai TUAN OS Enterprise V0.1

## Mục tiêu
Tạo nền tảng tối thiểu gồm PostgreSQL, Redis, Qdrant và n8n trên VPS qua Coolify.

## Cách upload lên GitHub bằng chuột
1. Mở repository: https://github.com/hongtuant9/tuan-os-enterprise
2. Bấm Add file → Upload files.
3. Kéo thả toàn bộ nội dung trong thư mục đã giải nén.
4. Bấm Commit changes.

## Deploy trên Coolify
1. Mở Coolify.
2. Project: TUAN OS Enterprise.
3. Add Resource.
4. Chọn Public Repository.
5. Dán URL: https://github.com/hongtuant9/tuan-os-enterprise
6. Check repository.
7. Deploy.

## Thứ tự vận hành
1. Deploy core services.
2. Mở n8n.
3. Tạo workflow Telegram sau.
4. Kết nối Google Drive sau.

## AI Agent Lễ tân — Facebook Private Pilot V2

Runbook hiện hành: `docs/AI_RECEPTIONIST_PRIVATE_PILOT_V1.md` (giữ tên file cũ để không phá liên kết).

### Migration bắt buộc

- `0012_ai_receptionist.sql` — conversation/review/knowledge candidate nền tảng.
- `0034_receptionist_l3_knowledge_sources.sql` — 5 nguồn L3 read-only cho Knowledge Resolver.

### Trạng thái runtime mong đợi

- `AI_RECEPTIONIST_MODE=limited_auto`
- `AI_PILOT_ALLOWLIST_ENABLED=true`
- `AI_PILOT_ALLOWED_CONVERSATION_IDS=SET`
- `AI_PILOT_OUTBOUND_ENABLED=true` chỉ cho private pilot Facebook allowlist
- `AI_PILOT_KIOTVIET_WRITE_ENABLED=false`
- `KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED=false`
- `TCE_CUSTOMER_CHANNEL_STAGE=facebook_only`
- `AI_RECEPTIONIST_OPENAI_API_KEY=SET` — key riêng cho Receptionist; không chia sẻ giá trị trong chat/log.
- `AI_RECEPTIONIST_DAILY_BUDGET_USD=SET` và `AI_RECEPTIONIST_MONTHLY_BUDGET_USD=SET` — bắt buộc >0 sau Owner approval.
- `AI_RECEPTIONIST_CONVERSATION_MODEL` có thể để trống; mặc định `gpt-5.6-luna`.

Không dùng `AI_PILOT_KNOWLEDGE_CAPTURE_ENABLED`; knowledge candidate lifecycle được quản lý bằng database status + Manager review + canonical SSOT sync.
Không đặt secret vào tài liệu hoặc biến `NEXT_PUBLIC_*`.

### Kiểm tra sau deploy

1. `/health` phải HTTP 200, app/database `ok`, chỉ Facebook mở.
2. `knowledgeRuntime.expectedSources=5`; sau initial sync cần `configuredSources=5`, `syncedSources=5`, `errorSources=0`.
3. `/ai-le-tan` phải hiển thị hội thoại với **Nội dung gốc** + **Bản dịch tiếng Việt**.
4. Test ít nhất VI/EN/FR: AI reply cùng ngôn ngữ khách.
5. Không được lộ `Master Data`, `SSOT`, `KiotViet`, `rule engine` trong customer reply.
6. Feedback huấn luyện tạo `conversation_style_feedback`; chỉ dùng sau khi được duyệt.
7. Business knowledge candidate APPROVED vẫn chưa phải production fact; phải cập nhật đúng L3/L4 và sync read-back trước.

### Rollback

- `AI_RECEPTIONIST_MODE=OFF`
- `AI_PILOT_OUTBOUND_ENABLED=false`
- `AI_PILOT_KIOTVIET_WRITE_ENABLED=false`
- `KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED=false`
- Rollback deployment về commit trước; không xóa conversation/message/review/knowledge/audit log.
