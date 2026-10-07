import test from "node:test";
import assert from "node:assert/strict";
import { evaluateManualSendGate } from "./manual-send-gate.ts";

const base = {
  enabled: true,
  replyMailboxPresent: true,
  threadIdPresent: true,
};

test("Manual Send fails closed when runtime gate is off", () => {
  assert.equal(evaluateManualSendGate({
    ...base,
    enabled: false,
    channel: "booking",
    replyTo: "guest-123@guest.booking.com",
  }).ready, false);
});

test("Booking relay allowlist passes", () => {
  assert.equal(evaluateManualSendGate({
    ...base,
    channel: "booking",
    replyTo: "guest-123@guest.booking.com",
  }).ready, true);
});

test("Agoda notification sender is rejected", () => {
  assert.equal(evaluateManualSendGate({
    ...base,
    channel: "agoda",
    replyTo: "notifications@agoda-messaging.com",
  }).ready, false);
});

test("Expedia relay allowlist passes", () => {
  assert.equal(evaluateManualSendGate({
    ...base,
    channel: "expedia",
    replyTo: "abc123@m.expediapartnercentral.com",
  }).ready, true);
});

test("Direct email requires canonical direct-care mailbox and valid recipient", () => {
  assert.equal(evaluateManualSendGate({
    ...base,
    channel: "email",
    replyTo: "guest@example.com",
    mailboxPurpose: "direct_guest_care",
    mailboxMatchesCanonical: true,
  }).ready, true);

  assert.equal(evaluateManualSendGate({
    ...base,
    channel: "email",
    replyTo: "no-reply@example.com",
    mailboxPurpose: "direct_guest_care",
    mailboxMatchesCanonical: true,
  }).ready, false);
});

test("missing Gmail thread fails closed", () => {
  assert.equal(evaluateManualSendGate({
    ...base,
    threadIdPresent: false,
    channel: "airbnb",
    replyTo: "guest@reply.airbnb.com",
  }).ready, false);
});

test("unknown channel cannot Manual Send", () => {
  assert.equal(evaluateManualSendGate({
    ...base,
    channel: "facebook",
    replyTo: "guest@example.com",
  }).ready, false);
});
