import test from "node:test";
import assert from "node:assert/strict";
import { autoReplyGate, directBookingWriteGate } from "./safety-gates.ts";

test("Shadow mode always blocks automatic replies", () => {
  assert.equal(autoReplyGate("shadow", false), false);
  assert.equal(autoReplyGate("shadow", true), false);
});

test("simulation and off always block automatic replies", () => {
  assert.equal(autoReplyGate("simulation", true), false);
  assert.equal(autoReplyGate("off", true), false);
});

test("limited_auto requires explicit owner approval", () => {
  assert.equal(autoReplyGate("limited_auto", false), false);
  assert.equal(autoReplyGate("limited_auto", true), true);
});

test("live still requires explicit owner approval", () => {
  assert.equal(autoReplyGate("live", false), false);
  assert.equal(autoReplyGate("live", true), true);
});

test("booking write is independently double-gated", () => {
  assert.equal(directBookingWriteGate("limited_auto", true, false), false);
  assert.equal(directBookingWriteGate("limited_auto", false, true), false);
  assert.equal(directBookingWriteGate("limited_auto", true, true), true);
  assert.equal(directBookingWriteGate("live", true, true), true);
});

test("Shadow blocks booking write even when both write flags are true", () => {
  assert.equal(directBookingWriteGate("shadow", true, true), false);
  assert.equal(directBookingWriteGate("simulation", true, true), false);
  assert.equal(directBookingWriteGate("off", true, true), false);
});
