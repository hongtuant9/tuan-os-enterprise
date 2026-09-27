import "server-only";
import { getAdminContainer } from "@/server/container";

type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
const PRICE: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.20, cached: 0.02, output: 1.20 },
  "gpt-5.6-terra": { input: 2.00, cached: 0.20, output: 12.00 },
  // Conservative non-promotional Sol rate so the guard does not undercount when promos expire.
  "gpt-5.6-sol": { input: 5.00, cached: 0.50, output: 30.00 },
};

function numberEnv(name: string): number {
  const value = Number(process.env[name] ?? "0");
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function globalBudget() {
  // Migration fallback: existing Receptionist approval already defines 1 USD/day + 10 USD/month.
  // Explicit global vars take precedence once configured on VPS.
  return {
    daily: numberEnv("TCE_OPENAI_GLOBAL_DAILY_BUDGET_USD") || numberEnv("AI_RECEPTIONIST_DAILY_BUDGET_USD"),
    monthly: numberEnv("TCE_OPENAI_GLOBAL_MONTHLY_BUDGET_USD") || numberEnv("AI_RECEPTIONIST_MONTHLY_BUDGET_USD"),
  };
}

function bangkokPeriodStarts(now = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  return {
    monthStart: new Date(Date.UTC(year, month, 1) - offsetMs).toISOString(),
    dayStart: new Date(Date.UTC(year, month, day) - offsetMs).toISOString(),
  };
}

export function estimateCostUsd(model: string, usage: Usage): number {
  const price = PRICE[model] ?? PRICE["gpt-5.6-luna"];
  const input = Math.max(0, usage.input_tokens ?? 0);
  const cached = Math.min(input, Math.max(0, usage.input_tokens_details?.cached_tokens ?? 0));
  const uncached = input - cached;
  const output = Math.max(0, usage.output_tokens ?? 0);
  return (uncached * price.input + cached * price.cached + output * price.output) / 1_000_000;
}

async function usageTotals(agentId?: string): Promise<{ monthly: number; daily: number }> {
  const { db } = getAdminContainer();
  const { monthStart, dayStart } = bangkokPeriodStarts();

  let monthQuery = db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", monthStart);
  let dayQuery = db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", dayStart);
  if (agentId) {
    monthQuery = monthQuery.eq("agent_id", agentId);
    dayQuery = dayQuery.eq("agent_id", agentId);
  }

  const [monthResult, dayResult] = await Promise.all([monthQuery, dayQuery]);
  if (monthResult.error || dayResult.error) {
    throw new Error("HOLD_COST_LEDGER: không đọc được OpenAI usage ledger; fail closed.");
  }

  const sum = (rows: Array<{ estimated_cost_usd: number | string }> | null) =>
    (rows ?? []).reduce((total, row) => total + Number(row.estimated_cost_usd ?? 0), 0);

  return {
    monthly: sum(monthResult.data),
    daily: sum(dayResult.data),
  };
}

async function assertGlobalOpenAiBudget(reservedCostUsd = 0): Promise<void> {
  const cap = globalBudget();
  if (cap.monthly <= 0 || cap.daily <= 0) {
    throw new Error("HOLD_COST_APPROVAL: Global OpenAI budget chưa được duyệt/cấu hình.");
  }

  const usage = await usageTotals();
  const reserve = Math.max(0, reservedCostUsd);
  if (usage.monthly + reserve > cap.monthly) {
    throw new Error("HOLD_COST: global monthly OpenAI budget would be exceeded.");
  }
  if (usage.daily + reserve > cap.daily) {
    throw new Error("HOLD_COST: global daily OpenAI budget would be exceeded.");
  }
}

async function assertBudget(input: {
  monthly: number;
  daily: number;
  reservedCostUsd?: number;
  agentId?: string;
  approvalError: string;
}): Promise<void> {
  const reserve = Math.max(0, input.reservedCostUsd ?? 0);
  await assertGlobalOpenAiBudget(reserve);

  if (input.monthly <= 0 || input.daily <= 0) throw new Error(input.approvalError);
  const usage = await usageTotals(input.agentId);

  if (usage.monthly + reserve > input.monthly) throw new Error("HOLD_COST: monthly OpenAI budget would be exceeded.");
  if (usage.daily + reserve > input.daily) throw new Error("HOLD_COST: daily OpenAI budget would be exceeded.");
}

export async function assertTceAiBudget(reservedCostUsd = 0): Promise<void> {
  return assertBudget({
    monthly: numberEnv("TCE_AI_MONTHLY_BUDGET_USD"),
    daily: numberEnv("TCE_AI_DAILY_BUDGET_USD"),
    reservedCostUsd,
    approvalError: "HOLD_COST_APPROVAL: TCE AI budget chưa được duyệt.",
  });
}

export async function assertReceptionistAiBudget(reservedCostUsd = 0): Promise<void> {
  return assertBudget({
    monthly: numberEnv("AI_RECEPTIONIST_MONTHLY_BUDGET_USD"),
    daily: numberEnv("AI_RECEPTIONIST_DAILY_BUDGET_USD"),
    reservedCostUsd,
    agentId: "receptionist",
    approvalError: "HOLD_COST_APPROVAL: AI Receptionist budget chưa được duyệt.",
  });
}

export async function recordTceAiUsage(agentId: string, model: string, usage: Usage, requestSource = "control-center") {
  const { db } = getAdminContainer();
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const { error } = await db.from("tce_ai_usage_ledger").insert({
    agent_id: agentId,
    model,
    input_tokens: usage.input_tokens ?? 0,
    cached_input_tokens: cached,
    output_tokens: usage.output_tokens ?? 0,
    estimated_cost_usd: estimateCostUsd(model, usage),
    request_source: requestSource,
  });
  if (error) throw new Error("HOLD_COST_LEDGER: không ghi được OpenAI usage ledger; fail closed.");
}

export function estimatePreflightCostUsd(model: string, estimatedInputTokens: number, maxOutputTokens: number): number {
  return estimateCostUsd(model, {
    input_tokens: Math.max(0, estimatedInputTokens),
    output_tokens: Math.max(0, maxOutputTokens),
  });
}
