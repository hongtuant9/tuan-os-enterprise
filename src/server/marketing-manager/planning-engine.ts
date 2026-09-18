import "server-only";
import {
  assertTceAiBudget,
  estimatePreflightCostUsd,
  recordTceAiUsage,
} from "@/server/agents/tce-cost-guard";
import { MARKETING_CAPABILITY_MAP } from "./capability-map";
import type {
  MarketingExperiment,
  MarketingGoal,
  MarketingKpi,
  MarketingPlan,
  MarketingPlanInput,
  MarketingTaskSpec,
  SpecialistRequirement,
} from "./types";

function selectedModel(): string {
  return (
    process.env.MARKETING_MANAGER_MODEL?.trim() ||
    process.env.TCE_AGENT_MODEL_TERRA?.trim() ||
    "gpt-5.6-terra"
  );
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;
  const chunks: string[] = [];
  for (const item of Array.isArray(root.output) ? root.output : []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n");
}

function parseJson(text: string): Record<string, unknown> {
  const clean = text.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "");
  const parsed = JSON.parse(clean) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export async function buildMarketingPlan(input: MarketingPlanInput): Promise<MarketingPlan> {
  if (!input.businessObjectives.length) {
    throw new Error("HOLD_OBJECTIVES: businessObjectives is required");
  }
  if (!input.verifiedFacts.length) {
    throw new Error("HOLD_FACTS: verifiedFacts is required");
  }

  const model = selectedModel();
  const promptPayload = {
    ...input,
    brandArchitecture: {
      masterBrand: "TCE / Tam Coc Experience",
      serviceLines: {
        lavender: "Lavender Villa / Lavender Homestay",
        ruby: "Ruby Bungalow / Ruby Homestay",
        cozy: "Cozy Garden",
      },
      journey: "STAY -> EAT & RELAX -> EXPERIENCE -> EXPLORE",
    },
    capabilityMap: MARKETING_CAPABILITY_MAP,
  };

  const instructions = [
    "You are the AI Marketing Manager for Tam Coc Experience (TCE), operating like a professional Head of Marketing.",
    "Translate business objectives into a measurable marketing plan and decompose it into executable tasks for specialist agents.",
    "TCE is the master brand. Lavender, Ruby and Cozy are service lines with distinct operational identities.",
    "Use ONLY verifiedFacts and currentSignals for factual claims.",
    "Never invent KPI baselines, prices, occupancy, availability, budgets, policies, reviews or campaign results.",
    "Financial mutations, ad spend, discounts, price changes, refunds or public offers with financial impact are RED and require approval.",
    "Verified static content, planning, research, reporting and non-financial execution may be GREEN.",
    "If a capability is needed and no existing agent can handle it, add it to requiredSpecialists.",
    "Tasks must be concrete, independently executable and have one primary capability.",
    "Prefer API/cloud execution. Browser/computer operator is fallback only when no supported API exists.",
    "Facebook is the only auto-publishing pilot channel initially. Other channels remain shadow/connected until separately approved.",
    "Return valid JSON only. No markdown.",
  ].join("\n");

  const outputShape = {
    executiveSummary: "",
    goals: [{ name: "", metric: "", target: "", horizon: "month" }],
    priorities: [""],
    kpis: [{ name: "", definition: "", source: "", target: "" }],
    tasks: [
      {
        title: "",
        objective: "",
        capability: "",
        entity: "tce",
        channel: "facebook",
        priority: "P2",
        risk: "GREEN",
        requiresApproval: false,
        specialistAgentId: "",
        dueDate: "",
        successMetric: "",
        dependencies: [""],
      },
    ],
    requiredSpecialists: [
      {
        capability: "",
        suggestedAgentId: "",
        suggestedName: "",
        reason: "",
        minimumPermissions: "L1_SAFE",
        implementationPriority: "P2",
      },
    ],
    experiments: [
      { name: "", hypothesis: "", metric: "", variants: [""], guardrail: "" },
    ],
    blockers: [""],
  };

  const inputText =
    JSON.stringify(promptPayload) +
    "\n\nReturn this JSON shape exactly:\n" +
    JSON.stringify(outputShape);

  await assertTceAiBudget(
    estimatePreflightCostUsd(
      model,
      Math.ceil((instructions.length + inputText.length) / 4),
      2600
    )
  );

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model,
      instructions,
      input: inputText,
      max_output_tokens: 2600,
      store: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error("Marketing Manager planning error: " + response.status);
  }

  const responsePayload = await response.json();
  const raw = parseJson(extractText(responsePayload));
  const usage =
    responsePayload && typeof responsePayload === "object"
      ? (responsePayload as Record<string, unknown>).usage
      : undefined;

  if (usage && typeof usage === "object") {
    await recordTceAiUsage(
      "marketing_manager",
      model,
      usage as Record<string, number>,
      "marketing-plan"
    );
  }

  const goals = objects(raw.goals)
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      metric: String(item.metric ?? "").trim(),
      target: String(item.target ?? "").trim() || undefined,
      horizon: (
        ["day", "week", "month", "quarter", "year"].includes(String(item.horizon))
          ? String(item.horizon)
          : input.horizon
      ) as MarketingGoal["horizon"],
    }))
    .filter((item) => item.name && item.metric);

  const kpis = objects(raw.kpis)
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      definition: String(item.definition ?? "").trim(),
      source: String(item.source ?? "").trim(),
      target: String(item.target ?? "").trim() || undefined,
    }))
    .filter((item) => item.name && item.definition) as MarketingKpi[];

  const tasks = objects(raw.tasks)
    .map((item) => ({
      title: String(item.title ?? "").trim(),
      objective: String(item.objective ?? "").trim(),
      capability: String(item.capability ?? "").trim(),
      entity: String(item.entity ?? "tce"),
      channel: item.channel ? String(item.channel) : undefined,
      priority: String(item.priority ?? "P2"),
      risk: String(item.risk ?? "HOLD"),
      requiresApproval: Boolean(item.requiresApproval),
      specialistAgentId: item.specialistAgentId
        ? String(item.specialistAgentId)
        : undefined,
      dueDate: item.dueDate ? String(item.dueDate) : undefined,
      successMetric: item.successMetric ? String(item.successMetric) : undefined,
      dependencies: strings(item.dependencies),
    }))
    .filter((item) => item.title && item.capability) as MarketingTaskSpec[];

  const requiredSpecialists = objects(raw.requiredSpecialists)
    .map((item) => ({
      capability: String(item.capability ?? "").trim(),
      suggestedAgentId: String(item.suggestedAgentId ?? "").trim(),
      suggestedName: String(item.suggestedName ?? "").trim(),
      reason: String(item.reason ?? "").trim(),
      minimumPermissions: String(item.minimumPermissions ?? "L1_SAFE"),
      implementationPriority: String(item.implementationPriority ?? "P2"),
    }))
    .filter((item) => item.capability && item.suggestedAgentId) as SpecialistRequirement[];

  const experiments = objects(raw.experiments)
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      hypothesis: String(item.hypothesis ?? "").trim(),
      metric: String(item.metric ?? "").trim(),
      variants: strings(item.variants),
      guardrail: String(item.guardrail ?? "").trim(),
    }))
    .filter((item) => item.name && item.hypothesis) as MarketingExperiment[];

  return {
    generatedAt: new Date().toISOString(),
    executiveSummary: String(raw.executiveSummary ?? "").trim(),
    goals,
    priorities: strings(raw.priorities),
    kpis,
    tasks,
    requiredSpecialists,
    experiments,
    blockers: strings(raw.blockers),
  };
}
