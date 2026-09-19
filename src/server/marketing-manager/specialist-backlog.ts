import "server-only";
import { getAdminContainer } from "@/server/container";
import type { MarketingPriority, SpecialistRequirement } from "./types";

function taskPriority(priority: MarketingPriority): "high" | "medium" | "low" {
  if (priority === "P0" || priority === "P1") return "high";
  if (priority === "P2") return "medium";
  return "low";
}

function capabilityTaskTitle(item: SpecialistRequirement): string {
  const name = item.suggestedName.trim() || item.suggestedAgentId.trim();
  return `Marketing capability gap: ${item.capability} -> ${name}`;
}

export type SpecialistBacklogResult = {
  created: string[];
  skippedExisting: string[];
};

export async function persistSpecialistBacklog(
  requirements: SpecialistRequirement[]
): Promise<SpecialistBacklogResult> {
  const container = getAdminContainer();
  const existing = await container.tasks.list();
  const existingTitles = new Set(
    existing
      .filter((item) => item.status !== "done")
      .map((item) => item.title.trim().toLowerCase())
  );

  const result: SpecialistBacklogResult = {
    created: [],
    skippedExisting: [],
  };

  for (const requirement of requirements) {
    const title = capabilityTaskTitle(requirement);
    const key = title.toLowerCase();

    if (existingTitles.has(key)) {
      result.skippedExisting.push(title);
      continue;
    }

    await container.tasks.create(
      {
        title,
        unit: "TCE AI / Marketing Capability",
        owner: "marketing_manager",
        priority: taskPriority(requirement.implementationPriority),
        dueDate: null,
      },
      "marketing_manager"
    );

    existingTitles.add(key);
    result.created.push(title);
  }

  return result;
}
