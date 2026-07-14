# AI Agent Lễ tân — Private Pilot V1

Ngày xây dựng: 14/07/2026

## Kết luận

Bản này dựng nền tảng cho **AI Booking, Concierge & Experience Agent** trong ứng dụng hiện tại, tại route:

```text
/ai-le-tan
```

Booking OTA không được nhập vào màn hình AI Lễ tân. KiotViet Hotel vẫn là System of Record cho phòng trống, giá và booking.

## Chức năng đã có

- Giao diện tiếng Việt.
- Hộp thư khách nhắn trực tiếp.
- Phòng kiểm thử nội bộ ở chế độ `SIMULATION`.
- Decision Gate không suy đoán dữ liệu thiếu.
- Cổng Quản lý Homestay:
  - Duyệt.
  - Từ chối.
  - Yêu cầu bổ sung.
  - Bắt buộc có ghi chú.
- AI tiếp tục hội thoại sau quyết định của Quản lý.
- Tạo `knowledge_candidate` từ dữ liệu có giá trị tái sử dụng.
- Màn hình booking chỉ dành cho `booking_source=AI_DIRECT`.
- Khung KiotViet Hotel client có read endpoints và write gate mặc định khóa.
- API nhận tin nhắn trực tiếp cho connector/n8n:

```text
POST /api/ai-receptionist/messages
```

## Migration

```text
supabase/migrations/0012_ai_receptionist.sql
```

Các bảng mới:

```text
ai_conversations
ai_messages
ai_booking_records
ai_manager_reviews
ai_knowledge_candidates
ai_pilot_sessions
```

## Feature Flags an toàn

```text
AI_RECEPTIONIST_MODE=SIMULATION
AI_PILOT_ALLOWLIST_ENABLED=true
AI_PILOT_KNOWLEDGE_CAPTURE_ENABLED=true
AI_PILOT_OUTBOUND_ENABLED=false
AI_PILOT_KIOTVIET_WRITE_ENABLED=false
KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED=false
```

## Backlog dữ liệu được thu thập trong quá trình test

- Giờ check-in/check-out cuối cùng của từng cơ sở.
- Chính sách bữa sáng.
- Chính sách trẻ em.
- Phụ thu nhận sớm, trả muộn và thêm người.
- Giá và điều kiện taxi.
- Chính sách xe đạp, xe máy.
- Cooking class.
- Danh sách trải nghiệm được phép bán.
- Bảng giá hoặc hoa hồng dịch vụ.
- Quy định voucher Cozy Garden.
- Ảnh được phép gửi cho từng phòng.
- Nội dung về vị trí Cozy Garden trong khuôn viên homestay.

## Kiểm thử đã chạy

```text
ESLint: PASS
TypeScript tsc --noEmit: PASS
Syntax transpile toàn bộ src: PASS
Next.js production build: TIMEOUT trong môi trường kiểm thử; chưa đủ căn cứ xác nhận build production PASS.
```

## Chưa triển khai

- Chưa chạy Migration trên Supabase production.
- Chưa cấu hình KiotViet API key.
- Chưa đăng ký KiotViet Webhook.
- Chưa kết nối Facebook, Zalo, WhatsApp hoặc Instagram.
- Chưa gửi khách thật.
- Chưa tạo booking thật.
- Chưa deploy lên Coolify.

## Rollback

```text
AI_RECEPTIONIST_MODE=OFF
AI_PILOT_OUTBOUND_ENABLED=false
AI_PILOT_KIOTVIET_WRITE_ENABLED=false
KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED=false
```

Rollback code về commit trước. Không xóa hội thoại, quyết định, booking reference hoặc audit log.
