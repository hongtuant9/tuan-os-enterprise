import test from "node:test";
import assert from "node:assert/strict";
import { deriveCommercialLead } from "./lead-qualification.ts";

test("general/support conversation remains inquiry", () => {
  assert.equal(deriveCommercialLead({ primaryIntent: "general" }).status, "INQUIRY");
  assert.equal(deriveCommercialLead({ primaryIntent: "support" }).status, "INQUIRY");
});

test("explicit commercial intents become leads", () => {
  assert.equal(deriveCommercialLead({ primaryIntent: "eat" }).status, "LEAD");
  assert.equal(deriveCommercialLead({ primaryIntent: "experience" }).status, "LEAD");
  assert.equal(deriveCommercialLead({ primaryIntent: "explore" }).status, "LEAD");
  assert.equal(deriveCommercialLead({ primaryIntent: "stay" }).status, "LEAD");
});

test("stay with dates and guest count becomes qualified lead", () => {
  assert.equal(deriveCommercialLead({
    primaryIntent: "stay",
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    guestCount: 2,
  }).status, "QUALIFIED_LEAD");
});

test("stay with dates guests and property becomes booking intent, not booked", () => {
  assert.equal(deriveCommercialLead({
    primaryIntent: "stay",
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    guestCount: 2,
    propertyHint: "Lavender Homestay",
  }).status, "BOOKING_INTENT");
});
