import assert from "node:assert/strict";
import test from "node:test";
import { AI_RECEPTIONIST_FRESHNESS_POLICY, evaluateFreshness } from "./data-freshness.ts";

const now = new Date("2026-09-29T07:00:00.000Z");
const isoAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

test("fresh pipeline with recent data is LIVE", () => {
  const x = evaluateFreshness({now,lastSyncAt:isoAgo(1),lastRecordAt:isoAgo(2),sourceStatus:"idle",policy:AI_RECEPTIONIST_FRESHNESS_POLICY});
  assert.equal(x.status,"LIVE");
  assert.equal(x.pipelineStatus,"LIVE");
  assert.equal(x.dataRecencyStatus,"CURRENT");
});

test("fresh pipeline with old data is FRESH not STALE", () => {
  const x = evaluateFreshness({now,lastSyncAt:isoAgo(1),lastRecordAt:isoAgo(180),sourceStatus:"idle",policy:AI_RECEPTIONIST_FRESHNESS_POLICY});
  assert.equal(x.status,"FRESH");
  assert.equal(x.pipelineStatus,"LIVE");
  assert.equal(x.dataRecencyStatus,"NO_RECENT_ACTIVITY");
});

test("stale pipeline is STALE regardless of old records", () => {
  assert.equal(evaluateFreshness({now,lastSyncAt:isoAgo(8),lastRecordAt:isoAgo(180),sourceStatus:"idle",policy:AI_RECEPTIONIST_FRESHNESS_POLICY}).status,"STALE");
});

test("pipeline beyond error threshold is ERROR", () => {
  assert.equal(evaluateFreshness({now,lastSyncAt:isoAgo(20),lastRecordAt:isoAgo(2),sourceStatus:"idle",policy:AI_RECEPTIONIST_FRESHNESS_POLICY}).status,"ERROR");
});

test("source error is ERROR immediately", () => {
  assert.equal(evaluateFreshness({now,lastSyncAt:isoAgo(1),lastRecordAt:isoAgo(1),sourceStatus:"error",lastError:"gmail_failed",policy:AI_RECEPTIONIST_FRESHNESS_POLICY}).status,"ERROR");
});

test("fresh pipeline with no records is NO_DATA", () => {
  assert.equal(evaluateFreshness({now,lastSyncAt:isoAgo(1),lastRecordAt:null,sourceStatus:"idle",policy:AI_RECEPTIONIST_FRESHNESS_POLICY}).status,"NO_DATA");
});
