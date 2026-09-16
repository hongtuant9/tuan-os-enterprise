"use server";

import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getAdminContainer } from "@/server/container";
import { runTceAgent, type TceAgentReply } from "@/server/agents/tce-orchestrator";

export type AiManagerActionResult =
  | { ok: true; data: TceAgentReply }
  | { ok: false; error: string };

export async function sendTceManagerMessage(message: string): Promise<AiManagerActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để sử dụng TCE AI Manager." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Manager hoặc Owner được gửi lệnh tới TCE AI Manager." };
  }
  const input = message.trim();
  if (!input) return { ok: false, error: "Nội dung không được để trống." };
  if (input.length > 4000) return { ok: false, error: "Nội dung quá dài; giới hạn 4.000 ký tự." };

  try {
    const data = await runTceAgent(input);
    await getAdminContainer().activityLog.record({
      agent: data.agent,
      unit: "Tam Coc Experience",
      message: `Manager command routed to ${data.agentId} (${data.mode}/${data.permission}).`,
      type: "info",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể xử lý yêu cầu." };
  }
}