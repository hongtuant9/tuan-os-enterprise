import test from "node:test";
import assert from "node:assert/strict";
import { selectDataAccessRoute } from "./source-router-policy.ts";

test("fresh VERIFIED canonical cache wins for read", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:true, cacheVerified:true, webhookAvailable:false,
    apiCost:"PAID", browser:"NETWORK_VERIFIED",
  }), "CACHE");
});

test("fresh but NEED_VERIFY cache is never selected", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"FINANCIAL", cacheFresh:true, cacheVerified:false, webhookAvailable:false,
    apiCost:"UNAVAILABLE", browser:"DOM_VERIFIED",
  }), "OPENCLAW_DOM");
});

test("free API wins over OpenClaw", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"FREE", browser:"NETWORK_VERIFIED",
  }), "API");
});

test("verified OpenClaw network can outrank paid API for non-critical read", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"PAID", browser:"NETWORK_VERIFIED",
    browserEstimatedTco:2, paidApiEstimatedTco:10,
  }), "OPENCLAW_NETWORK");
});

test("paid API wins when browser TCO is higher", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"MEDIUM", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"PAID", browser:"DOM_VERIFIED",
    browserEstimatedTco:20, paidApiEstimatedTco:10,
  }), "API");
});

test("critical financial read uses API when paid API exists", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"FINANCIAL", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"PAID", browser:"NETWORK_VERIFIED",
    browserEstimatedTco:1, paidApiEstimatedTco:100,
  }), "API");
});

test("critical financial read may use verified browser when official API is unavailable", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"FINANCIAL", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"UNAVAILABLE", browser:"NETWORK_VERIFIED",
  }), "OPENCLAW_NETWORK");
});

test("critical write without API/webhook fails closed", () => {
  assert.equal(selectDataAccessRoute({
    operation:"WRITE", risk:"EXTERNAL_WRITE", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"UNAVAILABLE", browser:"NETWORK_VERIFIED",
  }), "HOLD");
});

test("critical read does not fall back to vision", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"BOOKING", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"UNAVAILABLE", browser:"VISION_ONLY",
  }), "HOLD");
});

test("vision is last fallback only for non-critical read", () => {
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:"LOW", cacheFresh:false, cacheVerified:false, webhookAvailable:false,
    apiCost:"UNAVAILABLE", browser:"VISION_ONLY",
  }), "OPENCLAW_VISION");
});
