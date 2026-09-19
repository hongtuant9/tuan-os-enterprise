import "server-only";
import { getAdminContainer } from "@/server/container";

type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
const PRICE: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.20, cached: 0.02, output: 1.20 },
  "gpt-5.6-terra": { input: 2.00, cached: 0.20, output: 12.00 },
  // Conservative non-promotional Sol rate so the guard does not undercount when promos expire.
  "gpt-5.6-sol": { input: 5.00, cached: 0.50, output: 30.00 },
};
function numberEnv(name: string): number { const value = Number(process.env[name] ?? "0"); return Number.isFinite(value) ? Math.max(0, value) : 0; }
export function estimateCostUsd(model: string, usage: Usage): number {
  const price = PRICE[model] ?? PRICE["gpt-5.6-luna"];
  const input = Math.max(0, usage.input_tokens ?? 0);
  const cached = Math.min(input, Math.max(0, usage.input_tokens_details?.cached_tokens ?? 0));
  const uncached = input - cached;
  const output = Math.max(0, usage.output_tokens ?? 0);
  return (uncached * price.input + cached * price.cached + output * price.output) / 1_000_000;
}
async function assertBudget(input: {
  monthly: number;
  daily: number;
  reservedCostUsd?: number;
  agentId?: string;
  approvalError: string;
}): Promise<void> {
  if (input.monthly <= 0 || input.daily <= 0) throw new Error(input.approvalError);
  const { db } = getAdminContainer();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  let monthQuery = db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", monthStart);
  let dayQuery = db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", dayStart);
  if (input.agentId) {
    monthQuery = monthQuery.eq("agent_id", input.agentId);
    dayQuery = dayQuery.eq("agent_id", input.agentId);
  }

  const [{ data: monthRows }, { data: dayRows }] = await Promise.all([monthQuery, dayQuery]);
  const sum = (rows: Array<{ estimated_cost_usd: number | string }> | null) => (rows ?? []).reduce((a, r) => a + Number(r.estimated_cost_usd ?? 0), 0);
  const reserve = Math.max(0, input.reservedCostUsd ?? 0);
  if (sum(monthRows) + reserve > input.monthly) throw new Error("HOLD_COST: monthly OpenAI budget would be exceeded.");
  if (sum(dayRows) + reserve > input.daily) throw new Error("HOLD_COST: daily OpenAI budget would be exceeded.");
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
  await db.from("tce_ai_usage_ledger").insert({ agent_id: agentId, model, input_tokens: usage.input_tokens ?? 0, cached_input_tokens: cached, output_tokens: usage.output_tokens ?? 0, estimated_cost_usd: estimateCostUsd(model, usage), request_source: requestSource });
}

export function estimatePreflightCostUsd(model: string, estimatedInputTokens: number, maxOutputTokens: number): number {
  return estimateCostUsd(model, { input_tokens: Math.max(0, estimatedInputTokens), output_tokens: Math.max(0, maxOutputTokens) });
}
