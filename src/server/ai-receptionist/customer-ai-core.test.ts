import test from "node:test";
import assert from "node:assert/strict";
import { inferCustomerCarePhase } from "./customer-care.ts";
import { buildUpsellPlan } from "./upsell-engine.ts";
import {
  buildKiotVietOrderPayload,
  canDraftConfirmation,
  validateBookingDraftInput,
} from "./booking-orchestration.ts";

test("homestay upsell keeps only safe offers", () => {
  const offers = buildUpsellPlan("HOMESTAY").map((item) => item.offer);
  assert.deepEqual(offers, ["BREAKFAST", "COZY_GARDEN"]);
});

test("complaint suppresses upsell", () => {
  assert.deepEqual(buildUpsellPlan("HOMESTAY", { openComplaint: true }), []);
});

test("customer decline suppresses upsell", () => {
  assert.deepEqual(buildUpsellPlan("COZY", { customerDeclinedUpsell: true }), []);
});

test("verification-required upsell is filtered", () => {
  const offers = buildUpsellPlan("COZY").map((item) => item.offer);
  assert.equal(offers.includes("EXPERIENCE"), false);
});

test("upsell frequency cap fails closed", () => {
  assert.deepEqual(buildUpsellPlan("HOMESTAY", { offersShownLast24h: 2 }), []);
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

test("invalid booking dates are rejected", () => {
  assert.throws(() => validateBookingDraftInput({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    checkIn: "2026-10-22",
    checkOut: "2026-10-20",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
  }), /không hợp lệ/i);
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

test("KiotViet payload requires guest phone", () => {
  assert.throws(() => buildKiotVietOrderPayload({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    guestContact: null,
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
    phone: "",
    branchId: 8992,
    roomClassVersion: 1,
    quotedPrice: 500000,
    priceSource: "VERIFIED_UAT_SOURCE",
  }), /số điện thoại/i);
});
