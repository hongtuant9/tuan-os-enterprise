export type FreshnessStatus = "LIVE" | "FRESH" | "STALE" | "ERROR" | "NO_DATA";

export type FreshnessPolicy = {
  expectedRefreshMs: number;
  staleAfterMs: number;
  errorAfterMs: number;
  owner: string;
};

export type FreshnessEvaluation = {
  status: FreshnessStatus;
  syncAgeMs: number | null;
  dataAgeMs: number | null;
};

function age(nowMs: number, value?: string | null) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, nowMs - ts);
}

export function evaluateFreshness(input: {
  now: Date;
  lastSyncAt?: string | null;
  lastRecordAt?: string | null;
  sourceStatus?: string | null;
  lastError?: string | null;
  policy: FreshnessPolicy;
}): FreshnessEvaluation {
  const nowMs = input.now.getTime();
  const syncAgeMs = age(nowMs, input.lastSyncAt);
  const dataAgeMs = age(nowMs, input.lastRecordAt);
  const sourceStatus = (input.sourceStatus ?? "").toLowerCase();

  if (sourceStatus === "error" || Boolean(input.lastError)) {
    return { status: "ERROR", syncAgeMs, dataAgeMs };
  }
  if (syncAgeMs == null) {
    return { status: "STALE", syncAgeMs, dataAgeMs };
  }
  if (syncAgeMs > input.policy.errorAfterMs) {
    return { status: "ERROR", syncAgeMs, dataAgeMs };
  }
  if (syncAgeMs > input.policy.staleAfterMs) {
    return { status: "STALE", syncAgeMs, dataAgeMs };
  }
  if (dataAgeMs == null) {
    return { status: "NO_DATA", syncAgeMs, dataAgeMs };
  }
  if (dataAgeMs <= input.policy.staleAfterMs) {
    return { status: "LIVE", syncAgeMs, dataAgeMs };
  }
  return { status: "FRESH", syncAgeMs, dataAgeMs };
}

export const AI_RECEPTIONIST_FRESHNESS_POLICY: FreshnessPolicy = {
  expectedRefreshMs: 2 * 60_000,
  staleAfterMs: 6 * 60_000,
  errorAfterMs: 15 * 60_000,
  owner: "AI Receptionist / Hospitality AI",
};
