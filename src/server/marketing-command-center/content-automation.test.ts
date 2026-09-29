import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTENT_GATES,
  assertApprovalGatedPublish,
  buildPublishIdempotencyKey,
  evaluateVariantReadiness,
} from "./content-automation.ts";

test("variant is ready only when every mandatory gate passes and approval exists", () => {
  const gateResults = Object.fromEntries(
    CONTENT_GATES.map((gate) => [gate, "PASS"]),
  );

  const result = evaluateVariantReadiness({
    qaStatus: "PASS",
    approvalStatus: "APPROVED",
    gateResults,
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.missingGates, []);
  assert.deepEqual(result.blockingGates, []);
});

test("variant fails closed when a mandatory gate is missing", () => {
  const gateResults = Object.fromEntries(
    CONTENT_GATES.filter((gate) => gate !== "TRACKING").map((gate) => [gate, "PASS"]),
  );

  const result = evaluateVariantReadiness({
    qaStatus: "PASS",
    approvalStatus: "APPROVED",
    gateResults,
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.missingGates, ["TRACKING"]);
});

test("MVP policy never allows auto publish", () => {
  const result = assertApprovalGatedPublish({
    capabilityStatus: "WRITE_APPROVAL_REQUIRED",
    variantReady: true,
    autoPublishEnabled: true,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "AUTO_PUBLISH_DISABLED_BY_MVP_POLICY");
});

test("approval-gated publish can proceed only when capability and content are ready", () => {
  const result = assertApprovalGatedPublish({
    capabilityStatus: "WRITE_APPROVAL_REQUIRED",
    variantReady: true,
    autoPublishEnabled: false,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "APPROVAL_GATED_READY");
});

test("idempotency key is stable for the same logical publish", () => {
  const input = {
    contentId: "CNT-001",
    channelId: "facebook",
    variantKey: "feed-v1",
    scheduledAt: "2026-09-30T12:00:00+07:00",
  };

  assert.equal(
    buildPublishIdempotencyKey(input),
    buildPublishIdempotencyKey(input),
  );
});
