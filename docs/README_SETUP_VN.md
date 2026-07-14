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

## AI Agent Lễ tân — Private Pilot

### 1. Chạy migration

Thực hiện trong **Supabase SQL Editor**:

```text
supabase/migrations/0012_ai_receptionist.sql
```

Migration tạo các bảng:

- `ai_conversations`
- `ai_messages`
- `ai_booking_records`
- `ai_manager_reviews`
- `ai_knowledge_candidates`
- `ai_pilot_sessions`

### 2. Cấu hình trong Coolify

Thực hiện tại **Coolify → Application → Environment Variables**. Chỉ kiểm tra trạng thái tồn tại, không chia sẻ giá trị secret.

```text
AI_RECEPTIONIST_MODE=SIMULATION
AI_PILOT_ALLOWLIST_ENABLED=true
AI_PILOT_ALLOWED_CONVERSATION_IDS=<comma-separated conversation IDs>
AI_PILOT_KNOWLEDGE_CAPTURE_ENABLED=true
AI_PILOT_OUTBOUND_ENABLED=false
AI_PILOT_KIOTVIET_WRITE_ENABLED=false
KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED=false
KIOTVIET_HOTEL_API_BASE_URL=https://api-integration-hotel.kiotviet.vn
KIOTVIET_HOTEL_PUBLIC_API_KEY=<server-only>
KIOTVIET_HOTEL_WEBHOOK_SECRET=<server-only>
```

Không đặt KiotViet key trong biến có tiền tố `NEXT_PUBLIC_`.

### 3. Kiểm tra sau deploy

1. Đăng nhập `https://app.tamcocexperience.com/`.
2. Mở **AI Lễ tân**.
3. Xác nhận banner hiển thị **Mô phỏng** và **KiotViet write: Đang khóa**.
4. Mở **Phòng kiểm thử**, gửi một câu hỏi thiếu dữ liệu.
5. Kiểm tra hội thoại được lưu và yêu cầu xuất hiện ở **Cần Quản lý xác nhận**.
6. Quản lý nhập ghi chú, chọn quyết định và xác nhận AI tạo phản hồi tiếp theo.
7. Kiểm tra `knowledge_candidate` xuất hiện nhưng chưa được publish.

### 4. Rollback

- Đặt `AI_RECEPTIONIST_MODE=OFF` để dừng toàn bộ xử lý AI Lễ tân.
- Giữ `AI_PILOT_OUTBOUND_ENABLED=false`.
- Giữ `AI_PILOT_KIOTVIET_WRITE_ENABLED=false`.
- Giữ `KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED=false`.
- Rollback deployment về commit trước nếu giao diện hoặc API lỗi.
- Không xóa dữ liệu hội thoại/audit trong quá trình rollback.
