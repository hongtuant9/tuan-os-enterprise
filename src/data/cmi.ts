export type CmiBusinessLine = "cozy_garden" | "homestay" | "tpt_isteam" | "cross_business";

export const CMI_BUSINESS_LINES: Array<{
  value: CmiBusinessLine;
  label: string;
  description: string;
}> = [
  {
    value: "cozy_garden",
    label: "Cozy Garden",
    description: "Đồ ăn, đồ uống, trải nghiệm tại quán, cooking class và dịch vụ liên quan.",
  },
  {
    value: "homestay",
    label: "Homestay",
    description: "Lưu trú, OTA, trải nghiệm khách, dịch vụ bổ sung và vận hành homestay.",
  },
  {
    value: "tpt_isteam",
    label: "TpT / iSTEAM",
    description: "Tài nguyên giáo dục, AI & Robotics, worksheet, lesson plan, bundle và sản phẩm số.",
  },
  {
    value: "cross_business",
    label: "Dùng chung nhiều mảng",
    description: "Nghiên cứu áp dụng cho nhiều mảng kinh doanh hoặc chưa cần tách riêng.",
  },
];

export function cmiBusinessLineLabel(value: string): string {
  return CMI_BUSINESS_LINES.find((item) => item.value === value)?.label ?? "Dùng chung nhiều mảng";
}

export type CmiResearchJob = {
  id: string;
  businessUnitId: string | null;
  businessLine: CmiBusinessLine;
  title: string;
  objective: string;
  researchType: string;
  status: string;
  createdAt: string;
};

export type CmiSource = {
  id: string;
  researchJobId: string;
  platform: string;
  sourceType: string;
  url: string | null;
  title: string | null;
  competitorName: string | null;
  captureMethod: string;
  status: string;
  createdAt: string;
};

export type CmiEvidence = {
  id: string;
  sourceId: string;
  evidenceType: string;
  rawText: string | null;
  screenshotPath: string | null;
  sourceUrl: string | null;
  isVerified: boolean;
  capturedAt: string;
};

export type CmiInsight = {
  id: string;
  researchJobId: string;
  insightType: string;
  title: string;
  summary: string;
  customerSegment: string | null;
  topic: string | null;
  frequencyCount: number;
  confidence: number | null;
  verificationStatus: string;
};

export type CmiOpportunity = {
  id: string;
  researchJobId: string;
  businessUnitId: string | null;
  title: string;
  customerSegment: string | null;
  problem: string;
  proposedSolution: string;
  evidenceSummary: string | null;
  currentCapability: string | null;
  capabilityGap: string | null;
  desirabilityScore: number | null;
  feasibilityScore: number | null;
  viabilityScore: number | null;
  priorityScore: number | null;
  status: string;
};

export type MarketingStrategy = {
  id: string;
  opportunityId: string;
  version: number;
  targetCustomer: string;
  positioning: string;
  valueProposition: string;
  marketingIdeas: unknown[];
  channelStrategy: unknown[];
  testHypotheses: unknown[];
  kpis: unknown[];
  assumptions: unknown[];
  status: string;
};

export type CmiDashboard = {
  researchJobs: CmiResearchJob[];
  sources: CmiSource[];
  evidence: CmiEvidence[];
  insights: CmiInsight[];
  opportunities: CmiOpportunity[];
  marketingStrategies: MarketingStrategy[];
  metrics: {
    researchJobs: number;
    evidence: number;
    verifiedEvidence: number;
    insights: number;
    opportunities: number;
    marketingStrategies: number;
  };
  automation: {
    browserConnected: boolean;
    aiAnalysisConnected: boolean;
    note: string;
  };
};
