import { decidePilotMessage } from "../src/server/ai-receptionist/decision-engine.ts";

const cases = [
  ["cozy_menu", "Cozy Garden có menu gì?", "eat", "COZY_AGENT", "Coconut Coffee"],
  ["cozy_coffee", "Tôi muốn uống cà phê ngon ở Cozy Garden", "eat", "COZY_AGENT", "45.000 VND"],
  ["cozy_food", "Cozy có món ăn gì?", "eat", "COZY_AGENT", "Beef Fried Noodles"],
  ["experience_generic", "Tôi muốn trải nghiệm làm cà phê ở Tam Cốc", "experience", "AI_CONCIERGE", "Coffee Experience"],
  ["explore_generic", "Tôi muốn đi Tràng An và Hang Múa ngày mai", "explore", "AI_CONCIERGE", "lên kế hoạch"],
  ["stay_route", "Lavender còn phòng cho 2 người không?", "stay", "AI_BOOKING", null],
  ["mixed_cozy_stay", "Ăn ở Cozy Garden rồi tìm homestay gần đó", "eat", "COZY_AGENT", null],
  ["mixed_experience_food", "Cooking class rồi ăn tối ở Cozy Garden", "experience", "AI_CONCIERGE", null],
  ["tour_specific_guard", "Có bán tour Tràng An không?", "explore", "AI_CONCIERGE", null],
  ["bike_specific_guard", "Có xe đạp cho thuê không?", "explore", "AI_CONCIERGE", null],
  ["cooking_specific_guard", "Có cooking class không?", "experience", "AI_CONCIERGE", null],
  ["cozy_voucher_guard", "Cozy Garden có voucher không?", "eat", "COZY_AGENT", null],
  ["cozy_location_guard", "Cozy Garden ở trong khuôn viên homestay không?", "eat", "COZY_AGENT", null],
  ["generic", "Xin chào", "general", "AI_RECEPTIONIST", "Tam Coc Experience"],
  ["support", "Tôi cần hỗ trợ vì quên đồ", "support", "AI_RECEPTIONIST", null],
];

let pass = 0;
for (const [name, text, intent, agent, needle] of cases) {
  const r = decidePilotMessage(text, {});
  const ok = r.metadataPatch.primary_intent === intent && r.metadataPatch.routed_agent === agent && (!needle || r.reply.includes(needle));
  if (ok) pass++; else console.error("FAIL", name, JSON.stringify({ reply: r.reply, meta: r.metadataPatch, review: r.review?.reviewType }));
  console.log(ok ? "PASS" : "FAIL", name);
}
console.log(`TOTAL ${pass}/${cases.length}`);
if (pass !== cases.length) process.exit(1);
