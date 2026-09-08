import { decidePilotMessage } from "../src/server/ai-receptionist/decision-engine.ts";

const cases = [];
const add = (name, content, check, meta = {}) => cases.push({ name, content, check, meta });
const has = (needle) => (r) => r.reply.includes(needle);
const status = (s) => (r) => r.conversationStatus === s;
const review = (type) => (r) => r.review?.reviewType === type;
const lang = (v) => (r) => r.metadataPatch.language === v;
const prop = (v) => (r) => r.metadataPatch.property_hint === v;
const guests = (n) => (r) => r.metadataPatch.guest_count === n;
const and = (...checks) => (r) => checks.every((fn) => fn(r));

// Verified Lavender policy cases
add("checkin_vi", "Lavender nhận phòng lúc mấy giờ?", and(has("14:00"), status("active"), lang("vi")));
add("checkin_en", "Lavender check-in time?", and(has("14:00"), status("active"), lang("en")));
add("checkout_vi", "Lavender trả phòng lúc mấy giờ?", and(has("11:30"), status("active")));
add("checkout_en", "Lavender check-out time?", and(has("11:30"), lang("en")));
add("checkin_checkout", "Lavender check-in và check-out thế nào?", and(has("14:00"), has("11:30")));
add("breakfast_vi", "Lavender ăn sáng mấy giờ?", and(has("07:00–09:30"), has("21:00")));
add("breakfast_booking", "Lavender Booking.com có bao gồm bữa sáng không?", has("Room Only"));
add("breakfast_expedia", "Lavender Expedia có breakfast không?", has("Expedia/Airbnb/Tripadvisor"));
add("breakfast_price", "Lavender bữa sáng mua ngoài giá bao nhiêu?", has("75.000 VND/người"));
add("ruby_policy_guard", "Ruby check-in mấy giờ?", and(status("needs_manager"), prop("Ruby Homestay")));
// Booking parser and language cases
add("booking_vi_full", "Tôi muốn đặt phòng Lavender cho 2 người từ 10/09/2026 đến 12/09/2026.", and(status("waiting_guest"), guests(2), prop("Lavender Homestay")));
add("booking_en_full", "I want a Lavender room for 2 people from 2026-09-10 to 2026-09-12.", and(status("waiting_guest"), guests(2), lang("en")));
add("booking_complete_profile", "Tôi muốn đặt phòng Lavender cho 2 người từ 10/09/2026 đến 12/09/2026.", and(status("needs_manager"), review("booking_exception")), { customer_name: "Test Guest", customer_contact: "0901111111" });
add("booking_iso_dates", "Lavender room 2 people 2026-09-10 2026-09-12", (r) => r.metadataPatch.check_in === "2026-09-10" && r.metadataPatch.check_out === "2026-09-12");
add("booking_short_dates", "Lavender cho 2 người 10/09/2026 đến 12/09/2026", (r) => r.metadataPatch.check_in === "2026-09-10" && r.metadataPatch.check_out === "2026-09-12");
add("guest_1", "Lavender cho 1 người 10/09/2026 đến 12/09/2026", guests(1));
add("guest_2", "Lavender cho 2 khách 10/09/2026 đến 12/09/2026", guests(2));
add("guest_3", "Lavender cho 3 người 10/09/2026 đến 12/09/2026", guests(3));
add("guest_4_en", "Lavender for 4 people 2026-09-10 to 2026-09-12", and(guests(4), lang("en")));
add("missing_dates", "Tôi muốn đặt phòng Lavender cho 2 người", status("waiting_guest"));
add("missing_guests", "Tôi muốn đặt Lavender từ 10/09/2026 đến 12/09/2026", status("waiting_guest"));
add("missing_property", "Tôi muốn đặt phòng cho 2 người từ 10/09/2026 đến 12/09/2026", status("waiting_guest"));
add("missing_contact", "Tôi muốn đặt Lavender cho 2 người từ 10/09/2026 đến 12/09/2026", status("waiting_guest"));
add("phone_extract", "Lavender 2 người 10/09/2026-12/09/2026, số 0901234567", (r) => r.metadataPatch.customer_contact === "0901234567");
add("property_lavender", "Lavender còn phòng không?", prop("Lavender Homestay"));
add("property_ruby", "Ruby còn phòng không?", prop("Ruby Homestay"));
// Safety / unknown policy escalation
add("child_vi", "Lavender có chính sách trẻ em thế nào?", review("policy_exception"));
add("child_en", "Lavender child policy?", review("policy_exception"));
add("baby", "Lavender có em bé thì sao?", review("policy_exception"));
add("early_checkin", "Lavender nhận sớm có phụ thu không?", review("policy_exception"));
add("late_checkout", "Lavender trả muộn phí bao nhiêu?", review("policy_exception"));
add("extra_guest", "Lavender thêm người phụ thu sao?", review("policy_exception"));
add("taxi_vi", "Lavender có taxi đón ga không?", review("service_request"));
add("airport_pickup", "Lavender airport pickup price?", review("service_request"));
add("bicycle", "Lavender có xe đạp không?", review("service_request"));
add("motorbike", "Lavender thuê xe máy giá bao nhiêu?", review("service_request"));
add("cooking_class", "Lavender có cooking class không?", review("service_request"));
add("tour", "Lavender bán tour Tràng An không?", review("service_request"));
add("experience", "Có experience Hang Múa không?", review("service_request"));
add("voucher", "Cozy Garden có voucher giảm 10% không?", review("policy_exception"));
add("room_photo", "Gửi tôi ảnh phòng Lavender", review("missing_data"));
add("cozy_location", "Cozy Garden có trong khuôn viên homestay không?", review("missing_data"));
// Generic / persistence-safe behavior
add("generic_vi", "Xin chào", and(status("active"), lang("vi")));
add("generic_en", "Hello", and(status("active"), lang("en")));
add("generic_room_en", "Do you have a room?", lang("en"));
add("generic_room_vi", "Còn phòng không?", lang("vi"));
add("weekend_vi", "Cuối tuần còn phòng không?", status("waiting_guest"));
add("stay_en", "I want to stay at Lavender", status("waiting_guest"));
add("metadata_keep_property", "check-in time?", (r) => r.metadataPatch.property_hint === "Lavender Homestay", { property_hint: "Lavender Homestay" });
add("metadata_keep_guest", "Lavender từ 10/09/2026 đến 12/09/2026", guests(2), { guest_count: 2 });
add("metadata_keep_contact", "Lavender cho 2 người 10/09/2026-12/09/2026", (r) => r.metadataPatch.customer_contact === "0901111111", { customer_contact: "0901111111" });
add("metadata_keep_name", "Lavender cho 2 người 10/09/2026-12/09/2026", (r) => r.metadataPatch.customer_name === "Test Guest", { customer_name: "Test Guest" });
add("price_question_safe", "Lavender cho 2 người 10/09/2026-12/09/2026 giá bao nhiêu?", (r) => r.conversationStatus === "waiting_guest" && !/\b\d{2,3}[.,]?\d{3}\s*VND|\b\d{3,6}k\b/i.test(r.reply));
add("no_false_confirmation", "Đặt luôn Lavender cho 2 người 10/09/2026-12/09/2026", (r) => !/đã đặt|confirmed|xác nhận đặt phòng thành công/i.test(r.reply));
add("no_payment_claim", "Lavender 2 người 10/09/2026-12/09/2026 thanh toán thế nào?", (r) => !/đã thanh toán|payment received/i.test(r.reply));
add("unknown_policy_manager", "Lavender có hoàn tiền không?", (r) => !/được hoàn|không hoàn/i.test(r.reply));
add("contact_plus84", "Lavender 2 người 10/09/2026-12/09/2026 +84901234567", (r) => r.metadataPatch.customer_contact === "+84901234567");

let pass = 0;
for (const tc of cases) {
  const result = decidePilotMessage(tc.content, tc.meta, tc.meta.customer_name, tc.meta.customer_contact);
  const ok = Boolean(tc.check(result));
  if (ok) pass++;
  else console.error("FAIL", tc.name, JSON.stringify({ reply: result.reply, status: result.conversationStatus, review: result.review?.reviewType, metadata: result.metadataPatch }));
  console.log(ok ? "PASS" : "FAIL", tc.name);
}
console.log(`TOTAL ${pass}/${cases.length}`);
if (pass !== cases.length) process.exit(1);
