import {
  assertBookingTransition,
  canDraftConfirmation,
  buildKiotVietOrderPayload,
  failureSafePatch,
  makeBookingIdempotencyKey,
  validateBookingDraftInput,
} from "../src/server/ai-receptionist/booking-orchestration.ts";

const base = {
  conversationId: "conv-1", guestName: "Guest", guestContact: "0900000000",
  checkIn: "2026-09-10", checkOut: "2026-09-12", adults: 2, children: 0,
  roomCount: 1, roomClassId: "room-1", roomClassName: "Standard Family",
};
let pass = 0;
const test = (name, fn) => {
  try { fn(); console.log("PASS", name); pass++; }
  catch (error) { console.error("FAIL", name, error?.message ?? error); }
};
const throws = (fn) => { let ok = false; try { fn(); } catch { ok = true; } if (!ok) throw new Error("expected throw"); };
test("valid_draft", () => validateBookingDraftInput(base));
test("missing_name", () => throws(() => validateBookingDraftInput({ ...base, guestName: "" })));
test("bad_dates", () => throws(() => validateBookingDraftInput({ ...base, checkOut: base.checkIn })));
test("zero_adults", () => throws(() => validateBookingDraftInput({ ...base, adults: 0 })));
test("zero_rooms", () => throws(() => validateBookingDraftInput({ ...base, roomCount: 0 })));
test("missing_room_class", () => throws(() => validateBookingDraftInput({ ...base, roomClassId: "" })));
test("price_without_source", () => throws(() => validateBookingDraftInput({ ...base, quotedPrice: 900000 })));
test("verified_price", () => validateBookingDraftInput({ ...base, quotedPrice: 900000, priceSource: "VERIFIED_PRICEBOOK" }));
test("idempotency_stable", () => {
  const a = makeBookingIdempotencyKey(base); const b = makeBookingIdempotencyKey({ ...base });
  if (a !== b || !a.startsWith("ai-booking-")) throw new Error("unstable key");
});
test("idempotency_changes_room", () => {
  if (makeBookingIdempotencyKey(base) === makeBookingIdempotencyKey({ ...base, roomClassId: "room-2" })) throw new Error("same key");
});
test("transition_draft_checking", () => assertBookingTransition("draft", "checking"));
test("transition_created_verified", () => assertBookingTransition("created", "verified"));
test("transition_invalid_skip", () => throws(() => assertBookingTransition("draft", "verified")));
test("confirmation_only_verified", () => {
  if (!canDraftConfirmation("verified", "verified")) throw new Error("verified blocked");
  if (canDraftConfirmation("created", "pending")) throw new Error("unsafe confirmation");
});
test("failure_safe", () => {
  const patch = failureSafePatch("API_TIMEOUT", { requestId: "x" });
  if (patch.status !== "failed_safe" || patch.verification_status !== "failed") throw new Error("bad patch");
});
test("payload_verified", () => { const p = buildKiotVietOrderPayload({ ...base, roomClassId: "120841", quotedPrice: 900000, priceSource: "VERIFIED_PRICEBOOK", phone: "0900 000 000", branchId: 8992, roomClassVersion: 3 }); if (p.branchId !== 8992 || p.counterType !== 3 || p.roomClasses[0].version !== 3) throw new Error("bad payload"); });
test("payload_requires_phone", () => throws(() => buildKiotVietOrderPayload({ ...base, roomClassId: "120841", quotedPrice: 900000, priceSource: "VERIFIED_PRICEBOOK", phone: "", branchId: 8992, roomClassVersion: 3 })));
test("payload_requires_verified_price", () => throws(() => buildKiotVietOrderPayload({ ...base, roomClassId: "120841", phone: "0900000000", branchId: 8992, roomClassVersion: 3 })));
test("payload_requires_version", () => throws(() => buildKiotVietOrderPayload({ ...base, roomClassId: "120841", quotedPrice: 900000, priceSource: "VERIFIED_PRICEBOOK", phone: "0900000000", branchId: 8992, roomClassVersion: -1 })));
console.log(`TOTAL ${pass}/19`);
if (pass !== 19) process.exit(1);
