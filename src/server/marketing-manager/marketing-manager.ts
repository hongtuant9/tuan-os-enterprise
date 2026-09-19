import "server-only";
import { buildMarketingPlan } from "./planning-engine";
import { dispatchMarketingPlan, type DispatchResult } from "./task-dispatcher";
import { persistSpecialistBacklog, type SpecialistBacklogResult } from "./specialist-backlog";
import type { MarketingPlan, MarketingPlanInput, SpecialistRequirement } from "./types";

export type MarketingManagerCycleOptions = {
  dispatch?: boolean;
  createSpecialistBacklog?: boolean;
};

export type MarketingManagerCycleResult = {
  plan: MarketingPlan;
  dispatch?: DispatchResult;
  specialistBacklog: SpecialistRequirement[];
  specialistBacklogPersistence?: SpecialistBacklogResult;
};

function uniqueSpecialists(items: SpecialistRequirement[]): SpecialistRequirement[] {
  const seen = new Set<string>();
  const result: SpecialistRequirement[] = [];
  for (const item of items) {
    const key = item.capability.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export async function runMarketingManagerCycle(
  input: MarketingPlanInput,
  options: MarketingManagerCycleOptions = {}
): Promise<MarketingManagerCycleResult> {
  const plan = await buildMarketingPlan(input);
  const specialistBacklog = uniqueSpecialists(plan.requiredSpecialists);

  const dispatch = options.dispatch
    ? await dispatchMarketingPlan(plan)
    : undefined;
  const shouldCreateSpecialistBacklog = options.createSpecialistBacklog !== false;
  const specialistBacklogPersistence = shouldCreateSpecialistBacklog && specialistBacklog.length
    ? await persistSpecialistBacklog(specialistBacklog)
    : undefined;

  return {
    plan,
    dispatch,
    specialistBacklog: shouldCreateSpecialistBacklog ? specialistBacklog : [],
    specialistBacklogPersistence,
  };
}

export function marketingManagerOperatingCadence(): Record<string, string[]> {
  return {
    daily: [
      "Read verified business signals and channel health",
      "Detect demand gaps, blockers and reputation issues",
      "Prioritize work by business impact and risk",
      "Dispatch GREEN non-financial tasks to specialist agents",
      "Escalate financial, policy and high-risk changes for Owner approval",
      "Review publishing queue, failures and retry status",
    ],
    weekly: [
      "Review funnel and channel KPIs",
      "Compare plan versus actual",
      "Stop low-value work and expand validated winners",
      "Create next-week campaign and content priorities",
      "Identify missing capabilities and propose specialist agents",
    ],
    monthly: [
      "Review marketing contribution to direct booking and service demand",
      "Review campaign efficiency and channel mix",
      "Update customer segments, content pillars and experiments",
      "Propose budget changes for Owner approval",
      "Update 90-day marketing roadmap",
    ],
  };
}
