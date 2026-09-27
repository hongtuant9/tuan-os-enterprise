import test from "node:test";
import assert from "node:assert/strict";
import { canResolveCanonicalCustomer } from "./customer-identity.ts";

test("unverified phone cannot merge canonical customers", () => {
  assert.equal(canResolveCanonicalCustomer({ type: "phone", verified: false }, null), false);
});

test("unverified email cannot merge canonical customers", () => {
  assert.equal(canResolveCanonicalCustomer({ type: "email", verified: false }, null), false);
});

test("verified phone/email can resolve canonical customer", () => {
  assert.equal(canResolveCanonicalCustomer({ type: "phone", verified: false }, "2026-09-27T00:00:00Z"), true);
  assert.equal(canResolveCanonicalCustomer({ type: "email", verified: true }, null), true);
});

test("exact channel identity can resolve without phone/email verification", () => {
  assert.equal(canResolveCanonicalCustomer({ type: "facebook", verified: false }, null), true);
  assert.equal(canResolveCanonicalCustomer({ type: "ota", verified: false }, null), true);
});
