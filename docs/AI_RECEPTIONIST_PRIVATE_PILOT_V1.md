# AI Receptionist — Facebook Private Pilot V2

> Giữ nguyên tên file để không phá liên kết cũ. Nội dung này supersede mô tả Private Pilot V1 ngày 14/07/2026.

Ngày cập nhật: 19/09/2026
Trạng thái: ACTIVE — FACEBOOK LIMITED AUTO
Phạm vi: Tam Coc Experience · Lavender · Ruby · Cozy Garden

## 1. Vai trò tài liệu

Đây là runbook cho AI Receptionist / Booking Assistant / Concierge trong private pilot.
Tài liệu KHÔNG phải nguồn business truth cho giá, availability, policy hoặc dịch vụ live.

Thứ tự authority:
1. Active Owner Decision / Decision ID.
2. Runtime SSOT cho live facts.
3. L3 `Tam_Coc_Experience_Master_Information_Sheet_V1`.
4. Domain SSOT: KiotViet Hotel/F&B, MKT-001, COST-001, WEB-TCE-001...
5. Channel/public evidence chỉ dùng đối chiếu.

NEED VERIFY / HOLD luôn fail closed.

## 2. Runtime hiện hành

- Production: `https://app.tamcocexperience.com`
- Mode: `limited_auto`.
- Customer channel stage: `facebook_only`.
- Facebook Messenger: private pilot, outbound chỉ cho allowlist.
- Các channel khác: đóng ở customer-facing runtime.
- KiotViet read: được dùng cho kiểm tra runtime đã được phê duyệt.
- KiotViet write: khóa trừ Safety Gate riêng.
- Direct Booking auto-create: khóa nếu write gate chưa PASS.
- Hội thoại, message, review, knowledge candidate và audit log được lưu trong Supabase.

## 3. Kiến trúc trả lời V2

```text
Facebook / Pilot
  → Page Persona + Language Detection
  → Intent / Conversation Memory
  → L3/L4/Runtime Knowledge Resolver
  → Decision & Safety Plan
  → Conversation Sales Renderer
  → Naturalness / Safety QA
  → Facebook Send API
```

LLM chỉ quyết định cách diễn đạt. LLM không được tự tạo business fact.

## 4. Knowledge Resolver

Runtime đọc L3 theo cơ chế sync read-only vào `sync_records`:
- `01_THONG_TIN_CO_SO`
- `03_GIA_VA_GOI_BAN`
- `04_CHINH_SACH`
- `05_TIEN_NGHI_DICH_VU`
- `10_DICH_VU_SAN_PHAM`

Một record chỉ được đưa vào fact pack khi trạng thái tương đương `VERIFIED` và `Allowed Use` có `AI_RESPONSE`, `SALES` hoặc `PUBLIC`.
Không hard-code giá, policy, menu hoặc service truth trong `decision-engine.ts`.

## 5. Knowledge Candidate lifecycle

```text
Guest question
→ knowledge gap
→ Manager Review
→ knowledge_candidate
→ manager/owner review
→ APPROVED = chờ canonicalization
→ cập nhật đúng L3/L4 authority
→ sync worker
→ runtime resolver thấy VERIFIED record
→ AI được phép dùng
```

`APPROVED` không đồng nghĩa `PUBLIC/SALES fact`. Business fact chỉ dùng sau canonical source + sync/read-back.

## 6. Conversation Style Knowledge

Feedback về cách nói được tách khỏi business knowledge. Manager có thể ghi feedback ngay tại hội thoại, ví dụ: hỏi từng thông tin một; không mở đầu bằng câu khuôn mẫu; trả lời ngắn như Messenger; tránh upsell khi khách chưa giải quyết nhu cầu chính.

Feedback tạo `conversation_style_feedback` và phải được duyệt trước khi dùng. Style guidance không được phép chứa hoặc override giá, policy, availability hoặc service truth.

## 7. Page Persona

- TCE: local travel & hospitality sales advisor.
- Lavender: reservation + guest-care host.
- Ruby: reservation + guest-care host.
- Cozy Garden: restaurant + local-experience host.

Persona chỉ điều chỉnh tone, ưu tiên và cách hỏi; không quyết định fact.

## 8. Ngôn ngữ và bản dịch quản trị

AI phát hiện ngôn ngữ từ message mới nhất và reply bằng cùng ngôn ngữ khách.
Hỗ trợ nhận diện trực tiếp tối thiểu: VI, EN, FR, ES, DE, IT, PT, NL, ZH, JA, KO, RU, TH.

Mỗi message mới lưu: nội dung gốc; mã ngôn ngữ phát hiện; bản dịch tiếng Việt; QA metadata.
Trang `/ai-le-tan` hiển thị song song **Nội dung gốc** và **Bản dịch tiếng Việt** để Owner/Manager đọc nhanh, kiểm duyệt và tạo feedback huấn luyện.

## 9. Conversation Memory

Metadata hội thoại giữ: customer name/contact, language, check-in/check-out, guest count, property hint, primary intent, page entity và journey/context.
Renderer còn đọc lịch sử message gần nhất để tránh hỏi lại thông tin khách đã cung cấp.

## 10. Naturalness / Safety QA

QA gate chặn hoặc fallback khi phát hiện: câu rỗng; lộ thuật ngữ nội bộ (`Master Data`, `SSOT`, `KiotViet`, rule engine...); hỏi quá nhiều câu trong một lượt; số/giá không có trong fact pack hoặc runtime evidence; cam kết booking/availability khi đang HOLD.

Chuẩn giao tiếp:
- Messenger-style, thường 1–3 câu.
- Hỏi tối đa 1–2 câu cần thiết tiếp theo.
- Không hỏi lại dữ liệu đã biết.
- Không tự giới thiệu “tôi là AI”.
- Không dùng câu mẫu hành chính nếu có thể nói tự nhiên.
- Upsell chỉ sau khi đã xử lý nhu cầu chính.

## 11. Pilot Gate

Chỉ Facebook private pilot được mở. Không mở Instagram / WhatsApp / Zalo / OTA messaging cho tới khi Facebook pilot PASS.

PASS yêu cầu tối thiểu:
- critical hallucination = 0;
- sai price/policy/availability = 0;
- unauthorized write = 0;
- language reply đúng;
- manager escalation đúng;
- QA không phát hiện internal-system language;
- Owner review xác nhận hội thoại đủ tự nhiên.

## 12. Rollback

```text
AI_RECEPTIONIST_MODE=OFF
AI_PILOT_OUTBOUND_ENABLED=false
AI_PILOT_KIOTVIET_WRITE_ENABLED=false
KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED=false
```

Không xóa conversation, message, review, knowledge candidate hoặc audit log. Rollback code về commit production trước thay đổi.
