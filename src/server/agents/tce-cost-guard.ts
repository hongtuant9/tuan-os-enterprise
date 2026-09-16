import "server-only";
import { getAdminContainer } from "@/server/container";

type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
const PRICE: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.20, cached: 0.02, output: 1.20 },
  "gpt-5.6-terra": { input: 2.00, cached: 0.20, output: 12.00 },
  "gpt-5.6-sol": { input: 4.00, cached: 0.40, output: 20.00 },
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
export async function assertTceAiBudget(): Promise<void> {
  const monthly = numberEnv("TCE_AI_MONTHLY_BUDGET_USD");
  const daily = numberEnv("TCE_AI_DAILY_BUDGET_USD");
  if (monthly <= 0 || daily <= 0) throw new Error("HOLD_COST_APPROVAL: TCE AI budget chưa được duyệt.");
  const { db } = getAdminContainer();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const [{ data: monthRows }, { data: dayRows }] = await Promise.all([
    db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", monthStart),
    db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", dayStart),
  ]);
  const sum = (rows: Array<{ estimated_cost_usd: number | string }> | null) => (rows ?? []).reduce((a, r) => a + Number(r.estimated_cost_usd ?? 0), 0);
  if (sum(monthRows) >= monthly) throw new Error("HOLD_COST: monthly OpenAI budget reached.");
  if (sum(dayRows) >= daily) throw new Error("HOLD_COST: daily OpenAI budget reached.");
}
export async function recordTceAiUsage(agentId: string, model: string, usage: Usage, requestSource = "control-center") {
  const { db } = getAdminContainer();
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  await db.from("tce_ai_usage_ledger").insert({ agent_id: agentId, model, input_tokens: usage.input_tokens ?? 0, cached_input_tokens: cached, output_tokens: usage.output_tokens ?? 0, estimated_cost_usd: estimateCostUsd(model, usage), request_source: requestSource });
}
