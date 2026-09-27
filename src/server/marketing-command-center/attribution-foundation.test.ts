import test from "node:test";
import assert from "node:assert/strict";
import {
  attributionStatusFor,
  canAttributeVerifiedRevenue,
  isBusinessBookingEvent,
  isRepeatCustomer,
  verifiedCac,
  verifiedRoas,
} from "./attribution-foundation.ts";

test("A: tracked Google Ads + verified booking + verified revenue can be directly attributed", () => {
  assert.equal(attributionStatusFor({ trackedSource: true }), "DIRECT_VERIFIED");
  assert.equal(canAttributeVerifiedRevenue({ bookingVerified: true, revenueVerified: true }), true);
});

test("B: Ads click without booking cannot receive revenue attribution", () => {
  assert.equal(canAttributeVerifiedRevenue({ bookingVerified: false, revenueVerified: true }), false);
});

test("C: OTA booking is valid business booking without website lead when booking evidence is verified", () => {
  assert.equal(isBusinessBookingEvent("BOOKING_CONFIRMED", true), true);
});

test("D: walk-in without tracking evidence remains unattributed, not Google Ads", () => {
  assert.equal(attributionStatusFor({}), "UNATTRIBUTED");
});

test("E: self-reported Google Maps remains SELF_REPORTED", () => {
  assert.equal(attributionStatusFor({ selfReportedSource: true }), "SELF_REPORTED");
});

test("F: website_book_click is not a confirmed booking", () => {
  assert.equal(isBusinessBookingEvent("website_book_click", true), false);
});

test("G: platform conversion value without verified booking/revenue cannot produce verified ROAS", () => {
  assert.equal(verifiedRoas({
    adSpend: 1_000_000,
    spendVerified: true,
    attributedRevenue: 5_000_000,
    attributedRevenueVerified: false,
  }), null);
});

test("H: repeat customer requires verified repeat stay evidence", () => {
  assert.equal(isRepeatCustomer({ verifiedStayCount: 1 }), false);
  assert.equal(isRepeatCustomer({ verifiedStayCount: 2 }), true);
});

test("CAC fails closed unless both spend and acquired-customer denominator are verified", () => {
  assert.equal(verifiedCac({
    spend: 1_000_000,
    spendVerified: true,
    acquiredCustomers: 10,
    acquiredCustomersVerified: false,
  }), null);
});
