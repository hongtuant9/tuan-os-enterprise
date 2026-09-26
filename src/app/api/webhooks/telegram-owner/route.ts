import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { telegramOwnerChannelStatus } from "@/server/notifications/telegram-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorized(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
  const provided = req.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";
  return Boolean(expected && provided && safeEqual(expected, provided));
}

async function reply(chatId: string | number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null) as {
    message?: { text?: string; chat?: { id?: number | string }; from?: { id?: number | string } };
  } | null;
  const chatId = update?.message?.chat?.id;
  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || "";
  if (chatId == null || String(chatId) !== ownerChatId) {
    return NextResponse.json({ ok: true, ignored: "non_owner_chat" });
  }

  const text = (update?.message?.text || "").trim();
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  if (/^\/start\b/i.test(text) || /^\/help\b/i.test(text)) {
    await reply(chatId, [
      "TUAN OS Telegram Owner Channel đã kết nối.",
      "Lệnh:",
      "/status — trạng thái kênh và runtime policy",
      "/approvals — mở Approval Center",
      "/ack <TASK_ID> — ghi nhận Tuấn đã thấy cảnh báo; không tự approve mutation",
      "",
      "L3/financial/security vẫn phải approve tại hệ thống chính thức.",
    ].join("\n"));
  } else if (/^\/status\b/i.test(text)) {
    const status = telegramOwnerChannelStatus();
    await reply(chatId, [
      "TUAN OS — Owner Channel",
      `Telegram: ${status.enabled ? "ACTIVE" : "HOLD"}`,
      "Runtime: VPS_ONLY",
      "Window dependency: NO",
      "Desktop dependency: NO",
      `Authenticated Browser Executor: ${process.env.TCE_AUTHENTICATED_BROWSER_EXECUTOR_ENABLED?.trim().toLowerCase() === "true" ? "ACTIVE" : "OFF/HOLD"}`,
      `Paid AI reasoning: ${process.env.TCE_AGENT_AI_ENABLED?.trim().toLowerCase() !== "false" && Boolean(process.env.OPENAI_API_KEY?.trim()) ? "CONFIGURED/GATED" : "OFF/HOLD"}`,
    ].join("\n"));
  } else if (/^\/approvals\b/i.test(text)) {
    await reply(chatId, appUrl ? `Approval Center: ${appUrl}/approvals` : "APP_URL chưa được cấu hình.");
  } else {
    const ack = text.match(/^\/ack\s+([A-Za-z0-9_.:-]+)$/i);
    if (ack) {
      await getAdminContainer().activityLog.record({
        agent: "TUAN OS — Telegram Owner",
        unit: "TUAN OS Telegram Owner",
        message: `owner_ack task=${ack[1]} · source=telegram · note=ACK_ONLY_NOT_APPROVAL`,
        type: "approval",
      });
      await reply(chatId, `Đã ghi nhận Tuấn đã thấy ${ack[1]}. Đây không phải approval. TUAN OS sẽ tự re-check điều kiện và tiếp tục nếu gate thực tế đã PASS.`);
    } else {
      await reply(chatId, "Tôi đã nhận tin nhắn. Dùng /help để xem các lệnh an toàn hiện có.");
    }
  }

  return NextResponse.json({ ok: true });
}
