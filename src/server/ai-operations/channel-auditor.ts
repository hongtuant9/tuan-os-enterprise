export type ChannelSeverity = "P0" | "P1" | "P2" | "P3";
export type ChannelFindingStatus = "match" | "mismatch" | "needs_verification" | "hold";

export interface CanonicalChannelRecord {
  stableKey: string;
  channel: string;
  entity: string;
  expectedStatus: string;
  verificationStatus: string;
  lastVerified?: string;
  sourceOfTruth: string;
  decisionId?: string;
  notes?: string;
}

export interface ObservedChannelState {
  stableKey: string;
  observedAt: string;
  source: string;
  status?: string;
  verificationEvidence?: string;
  reachable?: boolean;
  data?: Record<string, string | number | boolean | null>;
}

export interface ChannelFinding {
  findingId: string;
  stableKey: string;
  channel: string;
  entity: string;
  status: ChannelFindingStatus;
  severity: ChannelSeverity;
  summary: string;
  expected?: string;
  observed?: string;
  evidence?: string;
  mutationAllowed: false;
  recommendedAction: string;
}

function normalize(value?: string) {
  return (value ?? "").trim().toUpperCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ");
}

function severityFor(record: CanonicalChannelRecord, observed?: ObservedChannelState): ChannelSeverity {
  const channel = record.channel.toLowerCase();
  if (observed?.reachable === false && /(booking|agoda|expedia|airbnb|website|google maps)/.test(channel)) return "P1";
  if (/(booking|agoda|expedia|airbnb)/.test(channel)) return "P1";
  if (/(google ads|website|google maps)/.test(channel)) return "P1";
  return "P2";
}

function findingId(stableKey: string, suffix: string) {
  const safe = stableKey.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `AUD-${safe}-${suffix}`;
}

export function auditChannel(record: CanonicalChannelRecord, observed?: ObservedChannelState): ChannelFinding {
  const verification = normalize(record.verificationStatus);
  if (verification === "HOLD" || verification === "INACTIVE") {
    return {
      findingId: findingId(record.stableKey, "hold"), stableKey: record.stableKey, channel: record.channel, entity: record.entity,
      status: "hold", severity: "P3", summary: `${record.channel} is intentionally ${verification}.`,
      mutationAllowed: false, recommendedAction: "Retain HOLD/INACTIVE. Do not create or mutate the channel without a new Owner decision.",
    };
  }
  if (!observed) {
    return {
      findingId: findingId(record.stableKey, "missing-evidence"), stableKey: record.stableKey, channel: record.channel, entity: record.entity,
      status: "needs_verification", severity: severityFor(record), summary: `No fresh runtime evidence for ${record.channel}.`,
      expected: record.expectedStatus, mutationAllowed: false,
      recommendedAction: "Collect authenticated/public read-only evidence. Do not infer current state from stale records.",
    };
  }

  if (observed.reachable === false) {
    return {
      findingId: findingId(record.stableKey, "unreachable"), stableKey: record.stableKey, channel: record.channel, entity: record.entity,
      status: "needs_verification", severity: severityFor(record, observed), summary: `${record.channel} could not be verified at runtime.`,
      expected: record.expectedStatus, evidence: observed.verificationEvidence, mutationAllowed: false,
      recommendedAction: "Retry read-only verification with bounded retry; escalate if the channel remains unreachable.",
    };
  }

  const expected = normalize(record.expectedStatus);
  const actual = normalize(observed.status);
  if (actual && expected && actual !== expected) {
    return {
      findingId: findingId(record.stableKey, "status-drift"), stableKey: record.stableKey, channel: record.channel, entity: record.entity,
      status: "mismatch", severity: severityFor(record, observed), summary: `${record.channel} runtime status differs from canonical record.`,
      expected: record.expectedStatus, observed: observed.status, evidence: observed.verificationEvidence,
      mutationAllowed: false, recommendedAction: "Open a scoped remediation proposal with authority check, approval class, before/after evidence and rollback.",
    };
  }

  return {
    findingId: findingId(record.stableKey, "match"), stableKey: record.stableKey, channel: record.channel, entity: record.entity,
    status: verification === "VERIFIED" ? "match" : "needs_verification",
    severity: verification === "VERIFIED" ? "P3" : "P2",
    summary: verification === "VERIFIED" ? `${record.channel} matches the canonical state.` : `${record.channel} has runtime evidence but canonical verification is not VERIFIED.`,
    expected: record.expectedStatus, observed: observed.status, evidence: observed.verificationEvidence,
    mutationAllowed: false, recommendedAction: verification === "VERIFIED" ? "No change." : "Review evidence and update canonical verification only after authority rules pass.",
  };
}
export function auditChannels(records: CanonicalChannelRecord[], observations: ObservedChannelState[]) {
  const observedByKey = new Map(observations.map((item) => [item.stableKey, item]));
  const findings = records.map((record) => auditChannel(record, observedByKey.get(record.stableKey)));
  const material = findings.filter((finding) => finding.severity === "P0" || finding.severity === "P1");
  return {
    mode: "read_only_shadow" as const,
    canMutate: false as const,
    generatedAt: new Date().toISOString(),
    findingCount: findings.length,
    materialCount: material.length,
    findings,
  };
}
