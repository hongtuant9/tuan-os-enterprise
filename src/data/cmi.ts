export type CmiResearchJob = {
  id: string;
  businessUnitId: string | null;
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
  capturedAt: string | null;
  createdAt: string;
};

export type CmiEvidence = {
  id: string;
  sourceId: string;
  evidenceType: string;
  rawText: string | null;
  screenshotPath: string | null;
  sourceUrl: string | null;
  contentHash: string | null;
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
  risks: unknown[];
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
    aiModel: string;
    note: string;
  };
};
