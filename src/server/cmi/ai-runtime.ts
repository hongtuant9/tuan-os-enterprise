import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

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

function adapter(): RpcAdapter {
  return createAdminClient() as unknown as RpcAdapter;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isCmiAiProviderConfigured(): boolean {
  const masterEnabled = (process.env.CMI_AI_ENABLED ?? "false").toLowerCase() === "true";
  return masterEnabled && Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function getCmiAiRuntimeStatus(): Promise<CmiAiRuntimeStatus> {
  const db = adapter();
  const { data, error } = await db.rpc("get_cmi_ai_runtime_status");
  if (error) throw error;
  const row = record(data);
  const enabled = row.enabled === true;
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
