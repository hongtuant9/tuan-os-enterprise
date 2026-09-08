import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertAvailabilityStillAvailable,
  sanitizeDirectBookingPayload,
  validateAvailabilityGuard,
} from "../src/server/integrations/kiotviet/booking-safety.ts";

const baseGuard = {
  branchId: 8992,
  roomClassId: "101",
  checkIn: "2026-09-10",
  checkOut: "2026-09-12",
  roomCount: 1,
};
const data = (available = 2, branchId = 8992, id = 101) => ({
  result: { data: [{ branchId, id, totalAvailableRoom: available }] },
});
const tests = [];
const add = (name, fn) => tests.push({ name, fn });
const throws = (fn, needle) => {
  try { fn(); return false; } catch (e) { return String(e?.message ?? e).includes(needle); }
};
add("guard_valid", () => { validateAvailabilityGuard(baseGuard); return true; });
add("guard_missing_room", () => throws(() => validateAvailabilityGuard({ ...baseGuard, roomClassId: "" }), "Thiếu dữ liệu"));
add("guard_zero_rooms", () => throws(() => validateAvailabilityGuard({ ...baseGuard, roomCount: 0 }), "Thiếu dữ liệu"));
add("guard_bad_dates", () => throws(() => validateAvailabilityGuard({ ...baseGuard, checkOut: "2026-09-09" }), "sau ngày nhận"));
add("availability_exact", () => assertAvailabilityStillAvailable(data(1), baseGuard).available === 1);
add("availability_surplus", () => assertAvailabilityStillAvailable(data(3), { ...baseGuard, roomCount: 2 }).available === 3);
add("availability_insufficient", () => throws(() => assertAvailabilityStillAvailable(data(1), { ...baseGuard, roomCount: 2 }), "không còn đủ phòng"));
add("availability_zero", () => throws(() => assertAvailabilityStillAvailable(data(0), baseGuard), "không còn đủ phòng"));
add("availability_branch_mismatch", () => throws(() => assertAvailabilityStillAvailable(data(2, 9000), baseGuard), "không còn đủ phòng"));
add("availability_room_mismatch", () => throws(() => assertAvailabilityStillAvailable(data(2, 8992, 999), baseGuard), "không còn đủ phòng"));
add("availability_empty_payload", () => throws(() => assertAvailabilityStillAvailable({}, baseGuard), "không còn đủ phòng"));
add("availability_numeric_id_normalized", () => assertAvailabilityStillAvailable(data(2, 8992, 101), baseGuard).roomClassId === "101");
add("sanitize_removes_internal", () => {
  const out = sanitizeDirectBookingPayload({
    conversationId: "conv-1", idempotencyKey: "idem-1", availabilityGuard: baseGuard,
    note: "AI_DIRECT", guestName: "Test Guest",
  });
  return !("conversationId" in out) && !("idempotencyKey" in out) && !("availabilityGuard" in out) && out.note === "AI_DIRECT";
});
add("source_second_check_before_post", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "../src/server/integrations/kiotviet/hotel-client.ts"), "utf8");
  const check = src.indexOf("await this.assertSecondAvailability(payload.availabilityGuard)");
  const post = src.indexOf('return this.request("/public/order"');
  return check >= 0 && post > check;
});
add("source_write_gate_present", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "../src/server/integrations/kiotviet/hotel-client.ts"), "utf8");
  return src.includes("isKiotVietDirectBookingWriteEnabled") && src.includes("KiotViet write đang khóa");
});

let pass = 0;
for (const t of tests) {
  let ok = false;
  try { ok = Boolean(await t.fn()); } catch (e) { console.error("ERROR", t.name, e); }
  console.log(ok ? "PASS" : "FAIL", t.name);
  if (ok) pass++;
}
console.log(`TOTAL ${pass}/${tests.length}`);
if (pass !== tests.length) process.exit(1);
