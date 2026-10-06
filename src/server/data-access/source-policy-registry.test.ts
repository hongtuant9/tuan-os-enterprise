import test from "node:test";
import assert from "node:assert/strict";
import { DATA_SOURCE_POLICIES, getDataSourcePolicy } from "./source-policy-registry.ts";
import { selectDataAccessRoute } from "./source-router-policy.ts";

test("Cozy revenue refresh remains API-backed", () => {
  const p = DATA_SOURCE_POLICIES.KIOTVIET_FNB_REVENUE;
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:p.risk, cacheFresh:false, webhookAvailable:false,
    apiCost:p.apiCost, browser:p.browser,
  }), "API");
});

test("Cozy cashflow may use verified browser because official API is unavailable", () => {
  const p = DATA_SOURCE_POLICIES.KIOTVIET_FNB_CASHFLOW;
  assert.equal(selectDataAccessRoute({
    operation:"READ", risk:p.risk, cacheFresh:false, webhookAvailable:false,
    apiCost:p.apiCost, browser:p.browser,
  }), "OPENCLAW_DOM");
});

test("unknown source is not silently invented", () => {
  assert.equal(getDataSourcePolicy("UNKNOWN_SOURCE"), null);
});
