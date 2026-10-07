import test from "node:test";
import assert from "node:assert/strict";
import { classifyEcosystemMessage, decidePilotMessage } from "./decision-engine.ts";
import { inferCustomerCarePhase } from "./customer-care.ts";
import { buildUpsellPlan } from "./upsell-engine.ts";
import {
  buildKiotVietOrderPayload,
  canDraftConfirmation,
  validateBookingDraftInput,
} from "./booking-orchestration.ts";

test("stay intent routes to booking and exposes only safe cross-sell candidates", () => {
  const route = classifyEcosystemMessage("We need a room in Lavender for two nights.");
  assert.equal(route.primaryIntent, "stay");
  assert.equal(route.routedAgent, "AI_BOOKING");
  assert.equal(route.journeyEntry, "HOMESTAY");
  assert.deepEqual(route.upsellOffers, ["BREAKFAST", "COZY_GARDEN"]);
});

test("complaint suppresses upsell", () => {
  assert.deepEqual(buildUpsellPlan("HOMESTAY", { openComplaint: true }), []);
});

test("verification-required upsell is filtered", () => {
  const offers = buildUpsellPlan("COZY").map((item) => item.offer);
  assert.equal(offers.includes("EXPERIENCE"), false);
});

test("booking intent with missing fields asks for one missing fact instead of confirming", () => {
  const decision = decidePilotMessage(
    "I want to book a room at Lavender.",
    {},
    "UAT Guest",
    "uat@example.invalid",
  );
  assert.equal(decision.conversationStatus, "waiting_guest");
  assert.match(decision.reply, /ngày nhận phòng/i);
  assert.equal(decision.review, undefined);
});

test("complete booking request still fails closed until live availability and price are verified", () => {
  const decision = decidePilotMessage(
    "I want to book Lavender from 2026-10-20 to 2026-10-22 for 2 adults.",
    {},
    "UAT Guest",
    "0900000000",
  );
  assert.equal(decision.conversationStatus, "needs_manager");
  assert.equal(decision.review?.reviewType, "booking_exception");
  assert.deepEqual(decision.review?.missingFields, [
    "kiotviet_live_availability",
    "kiotviet_live_price",
  ]);
  assert.match(decision.reply, /kiểm tra phòng và mức giá hiện hành/i);
});

test("unknown service detail escalates instead of inventing", () => {
  const decision = decidePilotMessage(
    "How much is the airport taxi pickup?",
    {},
    "UAT Guest",
    "uat@example.invalid",
  );
  assert.equal(decision.conversationStatus, "needs_manager");
  assert.equal(decision.review?.reviewType, "service_request");
  assert.equal(decision.review?.missingFields.includes("taxi_price_rule"), true);
});

test("customer-care phase inference separates pre/in/post service", () => {
  assert.equal(inferCustomerCarePhase("We will arrive tomorrow and need check-in advice."), "pre_service");
  assert.equal(inferCustomerCarePhase("I am currently at the hotel and need help."), "in_service");
  assert.equal(inferCustomerCarePhase("We checked out and want to leave feedback."), "post_service");
});

test("quoted booking price without VERIFIED source is rejected", () => {
  assert.throws(() => validateBookingDraftInput({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
    quotedPrice: 500000,
    priceSource: null,
  }), /VERIFIED/i);
});

test("confirmation can only be drafted after booking and verification are both verified", () => {
  assert.equal(canDraftConfirmation("verified", "verified"), true);
  assert.equal(canDraftConfirmation("created", "verified"), false);
  assert.equal(canDraftConfirmation("verified", "failed"), false);
});

test("KiotViet payload cannot be built without verified price evidence", () => {
  assert.throws(() => buildKiotVietOrderPayload({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    guestContact: "0900000000",
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
    phone: "0900000000",
    branchId: 8992,
    roomClassVersion: 1,
    quotedPrice: null,
    priceSource: null,
  }), /VERIFIED/i);
});
