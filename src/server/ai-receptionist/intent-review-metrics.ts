export type IntentReviewSample = {
  intent: string;
  reviewStatus: "pending" | "approved" | "edited" | "rejected" | "taken_over" | null;
  qaPass: boolean | null;
};

export type IntentReviewMetric = {
  intent: string;
  reviewed: number;
  approvedUnchanged: number;
  edited: number;
  rejected: number;
  takenOver: number;
  qaFailures: number;
  approvedUnchangedRate: number;
  humanCorrectionRate: number;
  rejectedOrTakeoverRate: number;
  automationCandidate: false;
};

export function buildIntentReviewMetrics(samples: IntentReviewSample[]): IntentReviewMetric[] {
  const groups = new Map<string, IntentReviewSample[]>();

  for (const sample of samples) {
    const intent = sample.intent.trim() || "general";
    const reviewed = sample.reviewStatus === "approved"
      || sample.reviewStatus === "edited"
      || sample.reviewStatus === "rejected"
      || sample.reviewStatus === "taken_over";
    if (!reviewed) continue;
    const list = groups.get(intent) ?? [];
    list.push(sample);
    groups.set(intent, list);
  }

  return [...groups.entries()]
    .map(([intent, rows]) => {
      const reviewed = rows.length;
      const approvedUnchanged = rows.filter((row) => row.reviewStatus === "approved").length;
      const edited = rows.filter((row) => row.reviewStatus === "edited").length;
      const rejected = rows.filter((row) => row.reviewStatus === "rejected").length;
      const takenOver = rows.filter((row) => row.reviewStatus === "taken_over").length;
      const qaFailures = rows.filter((row) => row.qaPass === false).length;
      return {
        intent,
        reviewed,
        approvedUnchanged,
        edited,
        rejected,
        takenOver,
        qaFailures,
        approvedUnchangedRate: reviewed > 0 ? approvedUnchanged / reviewed : 0,
        humanCorrectionRate: reviewed > 0 ? edited / reviewed : 0,
        rejectedOrTakeoverRate: reviewed > 0 ? (rejected + takenOver) / reviewed : 0,
        automationCandidate: false as const,
      };
    })
    .sort((a, b) => b.reviewed - a.reviewed || a.intent.localeCompare(b.intent));
}
