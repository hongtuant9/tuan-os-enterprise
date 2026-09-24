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
- Generative renderer dùng `AI_RECEPTIONIST_OPENAI_API_KEY` + budget riêng `AI_RECEPTIONIST_DAILY_BUDGET_USD` / `AI_RECEPTIONIST_MONTHLY_BUDGET_USD`; thiếu key/budget thì fail-safe về fallback, không tự phát sinh phí.

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


## 13. Omnichannel V1 — 24/09/2026

Owner đã duyệt mở rộng kiến trúc sang **AI Lễ tân 24/7 đa kênh**, nhưng activation vẫn theo từng cổng (progressive gate), không mở đồng loạt.

Kiến trúc chung:

```text
Channel adapter / official provider API
  → normalized customer message
  → customer identity + conversation memory
  → pre-service / in-service / post-service care phase
  → L3/L4/runtime knowledge resolver
  → decision + safety gate
  → conversation renderer + QA
  → channel delivery adapter
  → delivery status + audit log
```

Trạng thái adapter:
- Facebook Messenger: webhook adapter hiện hành; private pilot.
- Instagram Direct: webhook adapter có sẵn nhưng CLOSED cho tới khi auth/probe/UAT PASS.
- WhatsApp: webhook adapter có sẵn nhưng CLOSED cho tới khi Cloud API auth/probe/UAT PASS.
- Website chat: dùng authenticated normalized-message bridge; public widget chỉ mở sau security/UAT.
- Email: cần mailbox OAuth/API + polling/idempotency trước khi mở.
- Booking.com / Agoda / Airbnb / Expedia / Tripadvisor: chỉ dùng official connectivity/partner API. Không dùng browser automation làm transport customer-facing.
- Google Maps / Business Profile: dùng discovery/review/reputation workflow; không coi là direct chat transport.

Quy tắc thương mại:
- OTA không tự upsell/off-platform remarketing trong V1.
- Không tự xác nhận giá, availability, policy hoặc booking nếu thiếu authority live.
- Booking/financial/pricing write tiếp tục khóa bằng approval riêng.
- Một channel chỉ được outbound tự động khi provider verification + allowlist/UAT + mode gate đều PASS.

VPS chạy `TCE Omnichannel Worker` để giữ readiness/polling lane 24/7. Worker fail closed: provider chưa cấu hình/xác minh hoặc chưa có adapter chính thức thì trả HOLD, không gọi API giả và không gửi khách.


### 13.1 Machine bridge dùng chung

Website/Email/OTA connector có thể đẩy inbound message qua endpoint authenticated hiện có:

`POST /api/ai-receptionist/messages`

Machine caller dùng `x-api-key` khớp `N8N_API_KEY`; không tạo public unauthenticated ingestion endpoint.

Normalized payload giữ tối thiểu:
- `channel`
- `externalConversationId`
- `externalMessageId` để chống xử lý trùng
- `content`
- `pageEntity`
- `carePhase` nếu provider đã biết
- `reservationReference` nếu là OTA/booking context
- `providerMessageType`

Connector chịu trách nhiệm provider auth, cursor/retry và outbound delivery. AI Receptionist core chịu trách nhiệm tri thức, safety, CRM identity, lifecycle care, reply draft và audit.


## 14. OTA Connectivity trực tiếp — Verified 25/09/2026

Kết luận sau khi đối chiếu tài liệu chính thức và mailbox vận hành thực tế:

- **Booking.com** có Connectivity Messaging API nhưng quyền API thuộc Connectivity Partner / machine account / endpoint entitlement. Đồng thời Booking.com gửi một số guest-message email qua alias `@guest.booking.com` / `@property.booking.com`, cho phép reply theo thread.
- **Agoda** có Channel Manager Messaging API; ngoài ra Agoda guest-message email dùng relay `@agoda-messaging.com` và email xác nhận rõ reply sẽ được chuyển trực tiếp tới khách.
- **Airbnb** vận hành API theo API Program/Software Partner; host message email có `Reply-To` dạng `@reply.airbnb.com`, và nội dung email cho biết có thể reply trực tiếp.
- **Expedia Group** có Messaging API cho connectivity providers; individual property không có direct API entitlement mặc định. Guest-message email từ Partner Central sử dụng relay `@m.expediapartnercentral.com`.
- **Hotel Link không còn là dependency của kiến trúc OTA V1.** TCE sẽ ưu tiên direct official API khi entitlement tồn tại, nếu không thì dùng direct OTA email relay.

### 14.1 Kiến trúc OTA ưu tiên

```text
OTA official Messaging API (nếu TCE có entitlement)
                │
                └──────────────┐
                               ↓
OTA direct message email → Gmail OAuth → OTA Email Worker
                               ↓
                    Normalized OTA message
                               ↓
                    AI Receptionist core
                               ↓
         reservation context + L3/L4/runtime
                               ↓
                 safety / manager gate
                               ↓
      approved relay reply address + Gmail Send
                               ↓
                   OTA guest conversation
```

### 14.2 Direct OTA Email Worker

Worker 24/7 dùng Google OAuth connection hiện có của TCE, không tạo credential store mới.

Yêu cầu:
- Gmail scopes: `gmail.readonly` + `gmail.send`;
- poll tối đa 1 phút/lần;
- chỉ đọc sender domains được allowlist;
- `externalMessageId=gmail:<message-id>` để idempotency;
- bắt buộc có `reservationReference` trước khi xử lý;
- lưu check-in/check-out/special request vào reservation context nếu email cung cấp;
- chỉ gửi nếu AI không tạo manager review;
- chỉ gửi tới relay address domain đã allowlist;
- ghi delivery status + external sent message id;
- nếu có lỗi, giữ HOLD và không gửi.

Default auto-reply là **OFF**. Biến `TCE_OTA_EMAIL_AUTOREPLY_CHANNELS` chỉ được bật theo từng channel sau UAT.

### 14.3 Channel-specific route

- **Booking.com**: ưu tiên Messaging API nếu sau này có entitlement. Hiện có thể dùng direct email relay khi inbound đến từ `@guest.booking.com` / `@property.booking.com`. Không gửi tới `noreply@booking.com`.
- **Agoda**: direct email relay được hỗ trợ cho guest-message mail có reply address riêng `@agoda-messaging.com`. Không reply marketing/no-reply address.
- **Airbnb**: direct email relay qua `@reply.airbnb.com`; native Scheduled Quick Replies vẫn phù hợp cho welcome/check-in/check-out định kỳ.
- **Expedia / Hotels.com**: direct email relay qua `@m.expediapartnercentral.com` chỉ bật sau UAT xác nhận round-trip. API chính thức vẫn là partner-entitlement path.
- **Google Maps / Business Profile**: không coi là OTA messaging transport.

### 14.4 STOP conditions

- Sender/reply relay domain không nằm trong allowlist.
- Không có reservation reference hoặc không map được property/conversation.
- AI tạo manager review hoặc safety gate HOLD.
- Có claim về giá/availability/policy nhưng thiếu live authority.
- OAuth scope Gmail chưa VERIFIED.
- Reply round-trip của channel chưa UAT PASS.
- Duplicate message id.
- Delivery không có confirmation/audit trail.
- Bất kỳ dấu hiệu provider chặn/cấm relay automation.

Browser session/cookie không phải dependency của OTA messaging V1.

## 15. OTA Assist Mode — fallback khi chưa có messaging API/webhook

Endpoint nội bộ:

`POST /api/ai-receptionist/ota-assist`

Yêu cầu:
- authenticated user từ role `manager` trở lên hoặc machine caller có `N8N_API_KEY`;
- `channel` thuộc Booking.com / Agoda / Airbnb / Expedia / Tripadvisor;
- `reservationReference` bắt buộc;
- `externalMessageId` bắt buộc để chống xử lý trùng;
- `content` bắt buộc.

Kết quả:
- lưu inbound message + reservation context vào cùng AI Receptionist conversation core;
- phân loại care phase trước/trong/sau dịch vụ;
- tạo draft reply dựa trên L3/L4/runtime;
- `automaticOutbound=false` bắt buộc;
- trả `delivery=MANUAL_REVIEW_REQUIRED`;
- không tạo OTA off-platform upsell;
- không gửi trực tiếp ra OTA.

Luồng vận hành:

```text
Hotel Link / OTA email / operator
  → OTA Assist endpoint
  → AI draft + safety gate
  → Manager/operator review
  → gửi thủ công trong Hotel Link/OTA
  → ghi delivery evidence khi có connector chính thức
```

Đây là fallback chính thức cho tới khi Hotel Link hoặc OTA cấp messaging API/webhook được xác minh.


## 16. Nhật ký kiểm toán giao tiếp — giai đoạn đầu

Mục tiêu bắt buộc: Owner phải biết **AI đã nói gì, khi nào, ở cơ sở nào, trên kênh nào và ai là người viết**.

Không tạo bảng audit mới nếu dữ liệu hiện có đã đủ. Tái sử dụng:
- `ai_conversations`: channel, property, customer, reservation context, care phase.
- `ai_messages`: direction, sender_type, content, status, metadata, created_at, external_message_id.
- `ai_manager_reviews`: quyết định và người duyệt ngoại lệ.

Chuẩn attribution:
- `guest`: khách viết.
- `ai`: AI Lễ tân tạo nội dung.
- `human`: Tuấn/lễ tân/người vận hành viết từ phiên đăng nhập đã định danh.
- `system`: workflow/system note.
- nếu AI tạo draft rồi người thật sửa: metadata `edited_by_human=true` và giữ provenance AI → Human.
- delivery phải ghi `delivered_at`, delivery status và external/provider message ID khi có.

Control Center phải cho lọc tối thiểu theo:
- thời gian ICT;
- cơ sở;
- kênh;
- AI / người thật / khách / hệ thống;
- trạng thái draft / chưa gửi / đã gửi / lỗi.

Giới hạn attribution:
- nếu người thật gửi trực tiếp bên ngoài TCE Control Center và provider/shared mailbox không cung cấp actor identity, hệ thống chỉ được ghi `Human external`; không được đoán đó là Tuấn hay lễ tân.
- muốn phân biệt Tuấn và từng lễ tân một cách chắc chắn, phản hồi người thật phải đi qua TCE workspace có login riêng hoặc provider phải trả actor identity.

## 17. Mailbox trung tâm cho Hospitality

Không dùng email cá nhân `hongtuant9@gmail.com` làm mailbox vận hành lâu dài cho toàn hệ sinh thái.

Tên chuyển tiếp đề xuất khi vẫn dùng Gmail miễn phí:
- `tamcocexperience.guestcare@gmail.com`
- Display name: **Tam Coc Experience Guest Care**

Tên khuyến nghị dài hạn khi dùng domain doanh nghiệp:
- `guestcare@tamcocexperience.com`

Lý do chọn **Guest Care** thay vì Lavender/Booking/Reservations:
- dùng chung Lavender, Ruby và Cozy Garden;
- bao phủ trước/trong/sau dịch vụ, không chỉ booking;
- không phụ thuộc một OTA hoặc một property;
- sau này có thể thêm alias `reservations@`, `stay@`, `cozy@` nhưng cùng inbox/CRM.

Migration mailbox phải theo từng channel:
1. tạo mailbox;
2. cấu hình bảo mật + recovery + 2FA;
3. kết nối OAuth read-only trước;
4. chạy shadow ingestion/UAT;
5. xác minh reply relay từng OTA;
6. mới đổi email property trên OTA/extranet;
7. giữ forwarding từ mailbox cũ trong giai đoạn chuyển tiếp;
8. chỉ bật auto-reply cho từng OTA sau UAT PASS.
