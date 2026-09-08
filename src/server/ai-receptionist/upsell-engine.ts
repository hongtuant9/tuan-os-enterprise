export type JourneyEntry = "HOMESTAY" | "COZY" | "EXPERIENCE" | "EXPLORE" | "GENERAL";
export type UpsellMode = "verified_offer" | "information_only" | "verification_required";

export type UpsellCandidate = {
  ruleId: string;
  offer: string;
  mode: UpsellMode;
  source: string;
};

export type UpsellContext = {
  openComplaint?: boolean;
  customerDeclinedUpsell?: boolean;
  offersShownLast24h?: number;
  rejectedOffers?: string[];
  maxOffersPerInteraction?: number;
};

const RULES: Record<JourneyEntry, UpsellCandidate[]> = {
  HOMESTAY: [
    { ruleId: "XS-001", offer: "BREAKFAST", mode: "verified_offer", source: "04_CHINH_SACH" },
    { ruleId: "XS-004", offer: "COZY_GARDEN", mode: "information_only", source: "08_COZY_GARDEN_MASTER" },
    { ruleId: "XS-004", offer: "LOCAL_PLAN", mode: "information_only", source: "MASTER_PROJECT_V1" },
  ],
  COZY: [
    { ruleId: "XS-002", offer: "STAY_NEARBY", mode: "information_only", source: "02_HANG_PHONG" },
    { ruleId: "XS-002", offer: "EXPERIENCE", mode: "verification_required", source: "10_DICH_VU_SAN_PHAM" },
    { ruleId: "XS-002", offer: "LOCAL_PLAN", mode: "information_only", source: "MASTER_PROJECT_V1" },
  ],  EXPERIENCE: [
    { ruleId: "XS-003", offer: "COZY_GARDEN", mode: "information_only", source: "08_COZY_GARDEN_MASTER" },
    { ruleId: "XS-003", offer: "STAY_NEARBY", mode: "information_only", source: "02_HANG_PHONG" },
    { ruleId: "XS-003", offer: "TRANSPORT", mode: "verification_required", source: "10_DICH_VU_SAN_PHAM" },
  ],
  EXPLORE: [
    { ruleId: "XS-003", offer: "COZY_GARDEN", mode: "information_only", source: "08_COZY_GARDEN_MASTER" },
    { ruleId: "XS-003", offer: "STAY_NEARBY", mode: "information_only", source: "02_HANG_PHONG" },
  ],
  GENERAL: [],
};

export function buildUpsellPlan(entry: JourneyEntry, context: UpsellContext = {}): UpsellCandidate[] {
  if (context.openComplaint || context.customerDeclinedUpsell) return [];
  if ((context.offersShownLast24h ?? 0) >= 2) return [];

  const rejected = new Set(context.rejectedOffers ?? []);
  const cap = Math.max(0, Math.min(context.maxOffersPerInteraction ?? 2, 2));
  return RULES[entry]
    .filter((candidate) => !rejected.has(candidate.offer))
    .filter((candidate) => candidate.mode !== "verification_required")
    .slice(0, cap);
}

export function offersForRouting(entry: JourneyEntry): string[] {
  return buildUpsellPlan(entry, { maxOffersPerInteraction: 2 }).map((candidate) => candidate.offer);
}
