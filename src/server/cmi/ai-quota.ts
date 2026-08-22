import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCmiAiModel } from "@/server/cmi/ai-engine";

export type CmiAiAction = "competitor_discovery" | "cmi_analysis" | "marketing_strategy";

type RpcResult = { data: unknown; error: unknown };
type RpcAdapter = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};

const RESERVED_COST_USD: Record<CmiAiAction, number> = {
  competitor_discovery: 0.25,
  cmi_analysis: 0.10,
  marketing_strategy: 0.10,
};

export function getCmiAiDailyLimit(): number {
  const raw = Number(process.env.CMI_AI_DAILY_LIMIT ?? 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.min(100, Math.max(1, Math.round(raw)));
}

export async function consumeCmiAiQuota(
  _db: SupabaseClient<Database>,
  action: CmiAiAction
): Promise<number> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("AI chưa có OPENAI_API_KEY trên production. Không gọi API.");
  }

  const adapter = createAdminClient() as unknown as RpcAdapter;
  const { data, error } = await adapter.rpc("reserve_cmi_ai_budget", {
    p_action_type: action,
    p_created_by: null,
    p_reserved_cost_usd: RESERVED_COST_USD[action],
    p_model: getCmiAiModel(),
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

  return data ? 1 : 0;
}
