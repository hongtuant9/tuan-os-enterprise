export interface GoogleAdsSnapshot {
  accountId: string;
  campaignId: string;
  campaignName: string;
  observedAt: string;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue?: number;
  searchImpressionShare?: number;
  lostIsBudget?: number;
  lostIsRank?: number;
}

export interface AdsRecommendation {
  id: string;
  campaignId: string;
  severity: "P1" | "P2" | "P3";
  finding: string;
  proposedAction: string;
  expectedImpact: string;
  approvalLevel: "L2_APPROVAL" | "L3_CRITICAL";
  autoExecute: false;
}

function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}
export function summarizeAds(snapshot: GoogleAdsSnapshot) {
  const ctr = safeRate(snapshot.clicks, snapshot.impressions);
  const cpc = safeRate(snapshot.cost, snapshot.clicks);
  const conversionRate = safeRate(snapshot.conversions, snapshot.clicks);
  const cpa = safeRate(snapshot.cost, snapshot.conversions);
  const roas = snapshot.conversionValue === undefined ? null : safeRate(snapshot.conversionValue, snapshot.cost);
  return { ctr, cpc, conversionRate, cpa, roas };
}

export function recommendAds(snapshot: GoogleAdsSnapshot): AdsRecommendation[] {
  const metrics = summarizeAds(snapshot);
  const recommendations: AdsRecommendation[] = [];

  if (snapshot.cost > 0 && snapshot.clicks > 0 && snapshot.conversions === 0) recommendations.push({
    id: `ADS-${snapshot.campaignId}-conversion-zero`, campaignId: snapshot.campaignId, severity: "P1",
    finding: "Campaign is spending and receiving clicks but has zero recorded conversions.",
    proposedAction: "Audit conversion mapping, search terms and landing-page CTA before changing budget or bidding.",
    expectedImpact: "Restore trustworthy measurement and prevent optimization against traffic-only signals.",
    approvalLevel: "L2_APPROVAL", autoExecute: false,
  });

  if ((snapshot.lostIsBudget ?? 0) > 0.2) recommendations.push({
    id: `ADS-${snapshot.campaignId}-budget-lost-is`, campaignId: snapshot.campaignId, severity: "P2",
    finding: `Search lost impression share due to budget is ${(snapshot.lostIsBudget! * 100).toFixed(1)}%.`,
    proposedAction: "Do not increase budget automatically. First confirm conversion quality and marginal CPA/ROAS.",
    expectedImpact: "Avoid scaling unproven traffic while identifying whether budget is the true constraint.",
    approvalLevel: "L3_CRITICAL", autoExecute: false,
  });
  if ((snapshot.lostIsRank ?? 0) > 0.3) recommendations.push({
    id: `ADS-${snapshot.campaignId}-rank-lost-is`, campaignId: snapshot.campaignId, severity: "P2",
    finding: `Search lost impression share due to rank is ${(snapshot.lostIsRank! * 100).toFixed(1)}%.`,
    proposedAction: "Review ad relevance, search terms and landing-page match before any bid increase.",
    expectedImpact: "Improve eligible impression capture without defaulting to higher spend.",
    approvalLevel: "L2_APPROVAL", autoExecute: false,
  });

  if (metrics.ctr < 0.02 && snapshot.impressions >= 500) recommendations.push({
    id: `ADS-${snapshot.campaignId}-low-ctr`, campaignId: snapshot.campaignId, severity: "P2",
    finding: `CTR is ${(metrics.ctr * 100).toFixed(2)}% on a meaningful impression base.`,
    proposedAction: "Review query/ad/landing-page message match and draft a scoped creative or keyword proposal.",
    expectedImpact: "Improve traffic relevance before increasing spend.",
    approvalLevel: "L2_APPROVAL", autoExecute: false,
  });

  return recommendations;
}

export function buildAdsReport(snapshot: GoogleAdsSnapshot) {
  return {
    mode: "read_only_shadow" as const,
    canMutate: false as const,
    snapshot,
    metrics: summarizeAds(snapshot),
    recommendations: recommendAds(snapshot),
  };
}
