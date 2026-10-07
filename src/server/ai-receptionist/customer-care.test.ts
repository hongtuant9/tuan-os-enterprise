import test from "node:test";
import assert from "node:assert/strict";
import { inferCustomerCarePhase } from "./customer-care.ts";

test("arrival tomorrow remains pre-service even when operational text mentions review", () => {
  assert.equal(
    inferCustomerCarePhase("I have a reservation and will arrive tomorrow. Please prepare this for human review."),
    "pre_service",
  );
});

test("explicit post-stay review remains post-service", () => {
  assert.equal(
    inferCustomerCarePhase("I checked out yesterday and want to leave a review about my stay."),
    "post_service",
  );
});

test("in-stay wording has precedence", () => {
  assert.equal(
    inferCustomerCarePhase("I am currently in my room and need help."),
    "in_service",
  );
});
