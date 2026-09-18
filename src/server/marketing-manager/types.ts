import type { TceAgentId } from "@/server/agents/tce-registry";

export type MarketingEntity = "tce" | "lavender" | "ruby" | "cozy";
export type MarketingChannel =
  | "facebook"
  | "instagram"
  | "website"
  | "google_business"
  | "google_ads"
  | "meta_ads"
  | "tripadvisor"
  | "email"
  | "whatsapp"
  | "ota"
  | "offline";

export type MarketingRisk = "GREEN" | "YELLOW" | "RED" | "HOLD";
export type MarketingPriority = "P0" | "P1" | "P2" | "P3";

export type MarketingGoal = {
  name: string;
  metric: string;
  target?: string;
  horizon: "day" | "week" | "month" | "quarter" | "year";
};

export type MarketingKpi = {
  name: string;
  definition: string;
  source: string;
  target?: string;
};

export type MarketingTaskSpec = {
  title: string;
  objective: string;
  capability: string;
  entity: MarketingEntity;
  channel?: MarketingChannel;
  priority: MarketingPriority;
  risk: MarketingRisk;
  requiresApproval: boolean;
  specialistAgentId?: TceAgentId;
  dueDate?: string;
  successMetric?: string;
  dependencies?: string[];
};

export type SpecialistRequirement = {
  capability: string;
  suggestedAgentId: string;
  suggestedName: string;
  reason: string;
  minimumPermissions: "L0_READ" | "L1_SAFE" | "L2_APPROVAL" | "L3_CRITICAL";
  implementationPriority: MarketingPriority;
};

export type MarketingExperiment = {
  name: string;
  hypothesis: string;
  metric: string;
  variants: string[];
  guardrail: string;
};

export type MarketingPlan = {
  generatedAt: string;
  executiveSummary: string;
  goals: MarketingGoal[];
  priorities: string[];
  kpis: MarketingKpi[];
  tasks: MarketingTaskSpec[];
  requiredSpecialists: SpecialistRequirement[];
  experiments: MarketingExperiment[];
  blockers: string[];
};

export type MarketingPlanInput = {
  horizon: "week" | "month" | "quarter";
  businessObjectives: string[];
  verifiedFacts: string[];
  constraints?: string[];
  activeChannels?: MarketingChannel[];
  entities?: MarketingEntity[];
  currentSignals?: Record<string, string | number | boolean | null>;
};
