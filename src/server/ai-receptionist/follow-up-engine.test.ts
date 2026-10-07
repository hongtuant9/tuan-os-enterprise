import test from "node:test";
import assert from "node:assert/strict";
import { buildFollowUpPlan, hasComplaintSignal } from "./follow-up-engine.ts";

test("pre-service follow-up is recommendation-only", () => {
  const plan = buildFollowUpPlan("pre_service");
  assert.equal(plan?.kind, "pre_arrival_check");
  assert.equal(plan?.humanApprovalRequired, true);
  assert.equal(plan?.autoSendAllowed, false);
});

test("in-service follow-up is recommendation-only", () => {
  const plan = buildFollowUpPlan("in_service");
  assert.equal(plan?.kind, "in_stay_check");
  assert.equal(plan?.suggestedDelayHours, 6);
  assert.equal(plan?.autoSendAllowed, false);
});

test("post-service follow-up is recommendation-only", () => {
  const plan = buildFollowUpPlan("post_service");
  assert.equal(plan?.kind, "post_stay_feedback");
  assert.equal(plan?.suggestedDelayHours, 24);
});

test("general phase produces no follow-up", () => {
  assert.equal(buildFollowUpPlan("general"), null);
});

test("complaint suppresses automated follow-up planning", () => {
  assert.equal(buildFollowUpPlan("in_service", { openComplaint: true }), null);
});

test("human takeover suppresses follow-up planning", () => {
  assert.equal(buildFollowUpPlan("post_service", { humanTakeover: true }), null);
});

test("customer opt-out suppresses follow-up planning", () => {
  assert.equal(buildFollowUpPlan("pre_service", { customerDeclinedFollowUp: true }), null);
});

test("complaint signal detects direct guest complaint text", () => {
  assert.equal(hasComplaintSignal("I have a complaint about the air conditioner."), true);
  assert.equal(hasComplaintSignal("Điều hòa không hoạt động và tôi muốn phàn nàn."), true);
  assert.equal(hasComplaintSignal("Everything is okay."), false);
});
