export type SocialEntity = "tce" | "lavender" | "ruby" | "cozy";
export type SocialRiskClass = "GREEN" | "YELLOW" | "RED" | "HOLD";
export type SocialTopic = "stay" | "eat" | "experience" | "explore" | "ecosystem";
export type SocialRouteRole = "PRIMARY" | "SECONDARY" | "STORY_ONLY" | "SKIP";

export type SocialContentCandidate = {
  entity: SocialEntity;
  topic: SocialTopic;
  factsVerified: boolean;
  containsPrice?: boolean;
  containsAvailability?: boolean;
  containsPromotion?: boolean;
  containsPolicy?: boolean;
  containsComplaintOrCrisis?: boolean;
  containsFinancialCommitment?: boolean;
  containsSyntheticPropertyMedia?: boolean;
};

export type SocialContentDecision = {
  risk: SocialRiskClass;
  reasons: string[];
  routes: Record<SocialEntity, SocialRouteRole>;
  publishAllowed: false;
  requiresHumanApproval: boolean;
};

function baseRoutes(candidate: SocialContentCandidate): Record<SocialEntity, SocialRouteRole> {
  const routes: Record<SocialEntity, SocialRouteRole> = {
    tce: "SKIP",
    lavender: "SKIP",
    ruby: "SKIP",
    cozy: "SKIP",
  };

  if (candidate.entity === "tce") {
    routes.tce = "PRIMARY";
    if (candidate.topic === "explore" || candidate.topic === "ecosystem") {
      routes.lavender = "SECONDARY";
      routes.ruby = "SECONDARY";
      routes.cozy = "SECONDARY";
    }
    return routes;
  }

  routes[candidate.entity] = "PRIMARY";
  routes.tce = "SECONDARY";
  if (candidate.entity === "cozy" && candidate.topic === "eat") {
    routes.lavender = "STORY_ONLY";
    routes.ruby = "STORY_ONLY";
  }
  return routes;
}

export function decideSocialContent(candidate: SocialContentCandidate): SocialContentDecision {
  const reasons: string[] = [];
  let risk: SocialRiskClass = "GREEN";

  if (!candidate.factsVerified) {
    risk = "HOLD";
    reasons.push("UNVERIFIED_FACTS");
  }

  if (candidate.containsSyntheticPropertyMedia) {
    risk = "HOLD";
    reasons.push("SYNTHETIC_PROPERTY_MEDIA_NOT_ALLOWED");
  }

  if (candidate.containsComplaintOrCrisis || candidate.containsFinancialCommitment) {
    risk = "RED";
    if (candidate.containsComplaintOrCrisis) reasons.push("COMPLAINT_OR_CRISIS");
    if (candidate.containsFinancialCommitment) reasons.push("FINANCIAL_COMMITMENT");
  } else if (
    risk !== "HOLD" &&
    (candidate.containsPrice || candidate.containsAvailability || candidate.containsPromotion || candidate.containsPolicy)
  ) {
    risk = "YELLOW";
    if (candidate.containsPrice) reasons.push("DYNAMIC_PRICE");
    if (candidate.containsAvailability) reasons.push("LIVE_AVAILABILITY");
    if (candidate.containsPromotion) reasons.push("PROMOTION");
    if (candidate.containsPolicy) reasons.push("CUSTOMER_POLICY");
  }

  if (risk === "GREEN") reasons.push("VERIFIED_STATIC_CONTENT");

  return {
    risk,
    reasons,
    routes: baseRoutes(candidate),
    publishAllowed: false,
    requiresHumanApproval: risk === "YELLOW" || risk === "RED" || risk === "HOLD",
  };
}
