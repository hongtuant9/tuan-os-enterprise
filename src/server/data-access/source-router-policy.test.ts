import test from "node:test";
import assert from "node:assert/strict";
import { selectDataAccessRoute } from "./source-router-policy.ts";

test("fresh canonical cache wins for read", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:true, webhookAvailable:false,
    apiCost:"PAID", browser:"NETWORK_VERIFIED",
  }), "CACHE");
});

test("free API wins over OpenClaw", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:false, webhookAvailable:false,
    apiCost:"FREE", browser:"NETWORK_VERIFIED",
  }), "API");
});

test("verified OpenClaw network can outrank paid API for non-critical read", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:false, webhookAvailable:false,
    apiCost:"PAID", browser:"NETWORK_VERIFIED",
    browserEstimatedTco:2, paidApiEstimatedTco:10,
  }), "OPENCLAW_NETWORK");
});

test("paid API wins when browser TCO is higher", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"MEDIUM", cacheFresh:false, webhookAvailable:false,
    apiCost:"PAID", browser:"DOM_VERIFIED",
    browserEstimatedTco:20, paidApiEstimatedTco:10,
  }), "API");
});

test("critical financial read does not downgrade to browser to save API cost", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"FINANCIAL", cacheFresh:false, webhookAvailable:false,
    apiCost:"PAID", browser:"NETWORK_VERIFIED",
    browserEstimatedTco:1, paidApiEstimatedTco:100,
  }), "API");
});

test("critical write without API/webhook fails closed", () => {
  assert.equal(selectDataAccessRoute({
    operation:"WRITE", risk:"EXTERNAL_WRITE", cacheFresh:false, webhookAvailable:false,
    apiCost:"UNAVAILABLE", browser:"NETWORK_VERIFIED",
  }), "HOLD");
});

test("vision is last fallback only for non-critical read", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:false, webhookAvailable:false,
    apiCost:"UNAVAILABLE", browser:"VISION_ONLY",
  }), "OPENCLAW_VISION");
});
