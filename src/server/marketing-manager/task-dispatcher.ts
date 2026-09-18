import "server-only";
import { getAdminContainer } from "@/server/container";
import type { MarketingPlan, MarketingTaskSpec } from "./types";

function taskPriority(priority: MarketingTaskSpec["priority"]): "urgent" | "high" | "medium" | "low" {
  if (priority === "P0") return "urgent";
  if (priority === "P1") return "high";
  if (priority === "P2") return "medium";
  return "low";
}

export type DispatchResult = {
  created: string[];
  skippedExisting: string[];
  heldForApproval: string[];
};

export async function dispatchMarketingPlan(plan: MarketingPlan): Promise<DispatchResult> {
  const container = getAdminContainer();
  const existing = await container.tasks.list();
  const existingTitles = new Set(
    existing
      .filter((item) => item.status !== "done")
      .map((item) => item.title.trim().toLowerCase())
  );

  const result: DispatchResult = {
    created: [],
    skippedExisting: [],
    heldForApproval: [],
  };

  for (const task of plan.tasks) {
    const key = task.title.trim().toLowerCase();

    if (existingTitles.has(key)) {
      result.skippedExisting.push(task.title);
      continue;
    }

    if (task.requiresApproval || task.risk === "RED" || task.risk === "HOLD") {
      result.heldForApproval.push(task.title);
      continue;
    }

    await container.tasks.create(
      {
        title: task.title,
        unit: "TCE AI / Marketing",
        owner: task.specialistAgentId ?? "marketing_manager",
        priority: taskPriority(task.priority),
        dueDate: task.dueDate ?? null,
      },
      "marketing_manager"
    );

    existingTitles.add(key);
    result.created.push(task.title);
  }

  return result;
}
