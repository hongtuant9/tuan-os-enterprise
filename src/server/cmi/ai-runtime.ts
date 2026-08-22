import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type CmiAiAction = "competitor_discovery" | "cmi_analysis" | "marketing_strategy";

export type CmiAiRuntimeStatus = {
  enabled: boolean;
  providerConfigured: boolean;
  effectiveEnabled: boolean;
  monthlyBudgetUsd: number;
  monthlyEstimatedUsedUsd: number;
  dailyLimit: number;
  dailyUsed: number;
};

type RpcResult = { data: unknown; error: unknown };
type RpcAdapter = { rpc(name: string, args?: Record<string, unknown>): Promise<RpcResult> };
type QueryResult = { data: unknown; error: unknown };
type QueryBuilder = PromiseLike<QueryResult> & {
  update(input: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  select(columns: string): QueryBuilder;
  single(): PromiseLike<QueryResult>;
};
type DbAdapter = RpcAdapter & { from(name: string): QueryBuilder };

function adapter(): DbAdapter {
  return createAdminClient() as unknown as DbAdapter;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bool(value: unknown): boolean {
  return value === true;
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isCmiAiProviderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function getCmiAiRuntimeStatus(): Promise<CmiAiRuntimeStatus> {
  const db = adapter();
  const { data, error } = await db.rpc("get_cmi_ai_runtime_status");
  if (error) throw error;
  const row = record(data);
  const enabled = bool(row.enabled);
  const providerConfigured = isCmiAiProviderConfigured();
  return {
    enabled,
    providerConfigured,
    effectiveEnabled: enabled && providerConfigured,
    monthlyBudgetUsd: num(row.monthly_budget_usd, 5),
    monthlyEstimatedUsedUsd: num(row.monthly_estimated_used_usd, 0),
    dailyLimit: Math.round(num(row.daily_limit, 10)),
    dailyUsed: Math.round(num(row.daily_used, 0)),
  };
}

export async function setCmiAiRuntimeEnabled(enabled: boolean, actorUserId: string): Promise<void> {
  const db = adapter();
  const { error } = await db.rpc("set_cmi_ai_runtime_enabled", {
    p_enabled: enabled,
    p_updated_by: actorUserId,
  });
  if (error) throw error;
}

const RESERVED_COST_USD: Record<CmiAiAction, number> = {
  competitor_discovery: 0.25,
  cmi_analysis: 0.10,
  marketing_strategy: 0.10,
};

export async function reserveCmiAiBudget(action: CmiAiAction, actorUserId: string): Promise<string> {
  if (!isCmiAiProviderConfigured()) {
    throw new Error("AI chưa có OPENAI_API_KEY trên production. Không gọi API.");
  }
  const db = adapter();
  const { data, error } = await db.rpc("reserve_cmi_ai_budget", {
    p_action_type: action,
    p_created_by: actorUserId,
    p_reserved_cost_usd: RESERVED_COST_USD[action],
    p_model: process.env.CMI_AI_MODEL?.trim() || "gpt-5.6-luna",
  });
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("CMI_AI_RUNTIME_DISABLED")) {
      throw new Error("AI có phí đang TẮT trên bảng điều khiển CMI.");
    }
    if (message.includes("CMI_AI_DAILY_QUOTA_REACHED")) {
      throw new Error("Đã đạt giới hạn AI CMI trong ngày. Không gọi thêm API.");
    }
    if (message.includes("CMI_AI_MONTHLY_BUDGET_REACHED")) {
      throw new Error("Đã chạm ngân sách AI CMI tháng này. Không gọi thêm API.");
    }
    throw error;
  }
  const id = String(data ?? "").trim();
  if (!id) throw new Error("Không tạo được reservation ngân sách AI.");
  return id;
}

export type CmiAiUsage = {
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  estimatedCostUsd: number;
};

export function estimateCmiAiCost(payload: unknown): CmiAiUsage {
  const root = record(payload);
  const usage = record(root.usage);
  const inputTokens = Math.max(0, Math.round(num(usage.input_tokens, 0)));
  const outputTokens = Math.max(0, Math.round(num(usage.output_tokens, 0)));
  const output = Array.isArray(root.output) ? root.output : [];
  const webSearchCalls = output.filter((item) => {
    const row = record(item);
    return row.type === "web_search_call";
  }).length;

  // Standard pricing verified 2026-08-22: GPT-5.6 Luna $0.20/M input, $1.20/M output;
  // web_search $10/1k calls. Cached-token discount is intentionally ignored => conservative estimate.
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * 0.20 +
    (outputTokens / 1_000_000) * 1.20 +
    webSearchCalls * 0.01;

  return { inputTokens, outputTokens, webSearchCalls, estimatedCostUsd };
}

export async function finishCmiAiUsage(usageId: string, payload: unknown, success: boolean): Promise<void> {
  const db = adapter();
  const usage = success
    ? estimateCmiAiCost(payload)
    : { inputTokens: 0, outputTokens: 0, webSearchCalls: 0, estimatedCostUsd: 0 };
  const { error } = await db.rpc("finish_cmi_ai_usage", {
    p_usage_id: usageId,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens,
    p_web_search_calls: usage.webSearchCalls,
    p_estimated_cost_usd: usage.estimatedCostUsd,
    p_success: success,
  });
  if (error) throw error;
}
