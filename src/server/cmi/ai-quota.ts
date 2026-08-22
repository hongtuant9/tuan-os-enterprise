import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type CmiAiAction = "competitor_discovery" | "cmi_analysis" | "marketing_strategy";

type RpcResult = { data: unknown; error: unknown };
type RpcAdapter = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};

export function getCmiAiDailyLimit(): number {
  const raw = Number(process.env.CMI_AI_DAILY_LIMIT ?? 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.min(100, Math.max(1, Math.round(raw)));
}

export async function consumeCmiAiQuota(
  db: SupabaseClient<Database>,
  action: CmiAiAction
): Promise<number> {
  const adapter = db as unknown as RpcAdapter;
  const { data, error } = await adapter.rpc("consume_cmi_ai_daily_quota", {
    p_action_type: action,
    p_max_calls: getCmiAiDailyLimit(),
  });

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("CMI_AI_DAILY_QUOTA_REACHED")) {
      throw new Error(`Đã đạt giới hạn ${getCmiAiDailyLimit()} tác vụ AI CMI trong ngày. Không gọi thêm API.`);
    }
    throw error;
  }

  return Number(data ?? 0);
}
