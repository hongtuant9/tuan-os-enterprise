import assert from "node:assert/strict";
import { auditWebsite } from "../src/server/ai-operations/website-agent.ts";
import { auditChannels } from "../src/server/ai-operations/channel-auditor.ts";
import { buildAdsReport } from "../src/server/ai-operations/google-ads-agent.ts";

const website = auditWebsite(
  [{ url: "https://tamcocexperience.com/", expectedStatus: 200, forbiddenText: ["daily from 7:30 AM", "Breakfast included"], sourceOfTruth: "WEB-TCE-001" }],
  [{ url: "https://tamcocexperience.com/", observedAt: new Date().toISOString(), status: 200, finalUrl: "https://tamcocexperience.com/", text: "current live body", hasGtm: true, hasGa4: true }],
);
assert.equal(website.canMutate, false);
assert.equal(website.findings.length, 0);

const channels = auditChannels(
  [
    { stableKey: "CHANNEL|Facebook", channel: "Facebook", entity: "TCE", expectedStatus: "LIVE — METRICOOL CONNECTED / ANALYTICS PASS", verificationStatus: "VERIFIED", sourceOfTruth: "Metricool runtime" },
    { stableKey: "CHANNEL|TikTok", channel: "TikTok", entity: "TCE", expectedStatus: "DEFER - NOT DEPLOYING", verificationStatus: "INACTIVE", sourceOfTruth: "Owner Decision" },
  ],
  [{ stableKey: "CHANNEL|Facebook", observedAt: new Date().toISOString(), source: "Metricool", status: "LIVE — METRICOOL CONNECTED / ANALYTICS PASS", reachable: true }],
);
assert.equal(channels.canMutate, false);
assert.deepEqual(channels.findings.map((x) => x.status), ["match", "hold"]);

const ads = buildAdsReport({
  accountId: "cozy",
  campaignId: "Leads-Search-1",
  campaignName: "Leads-Search-1",
  observedAt: new Date().toISOString(),
  cost: 785309.71,
  clicks: 145,
  impressions: 3153,
  conversions: 0,
  conversionValue: 0,
  searchImpressionShare: 0.28277,
  lostIsBudget: 0.14607,
  lostIsRank: 0.57116,
});
assert.equal(ads.canMutate, false);
assert.equal(ads.recommendations.every((x) => x.autoExecute === false), true);
assert.equal(ads.recommendations.some((x) => x.id.includes("conversion-zero")), true);
assert.equal(ads.recommendations.some((x) => x.id.includes("rank-lost-is")), true);

console.log("AI Operations shadow regression PASS");
