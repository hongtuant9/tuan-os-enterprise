import { NextResponse } from "next/server";
import { verifyWebhookSecret } from "@/server/api/webhook-auth";
import { getAdminContainer } from "@/server/container";
import { runTceAgent, tceAgentStatusText } from "@/server/agents/tce-orchestrator";

type TelegramMessage = {
  chat?: { id?: number | string };
  text?: string;
  from?: { username?: string; first_name?: string };
};

type TelegramUpdate = { message?: TelegramMessage };

function allowedChat(chatId: string): boolean {
  const raw = process.env.TELEGRAM_OWNER_CHAT_ID?.trim();
  if (!raw) return false;
  return raw.split(",").map((item) => item.trim()).filter(Boolean).includes(chatId);
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3900) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status}`);
}
export async function POST(request: Request) {
  const check = verifyWebhookSecret(request, "TELEGRAM_WEBHOOK_SECRET", "x-telegram-bot-api-secret-token");
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  let update: TelegramUpdate = {};
  try { update = await request.json() as TelegramUpdate; } catch { /* ignore malformed body */ }
  const message = update.message;
  const chatId = message?.chat?.id == null ? "" : String(message.chat.id);
  const text = message?.text?.trim() ?? "";
  const container = getAdminContainer();

  await container.activityLog.record({
    agent: "Telegram",
    unit: "System",
    message: text ? "Received Telegram command/message." : "Received Telegram update.",
    type: "info",
  });

  if (!chatId || !text) return NextResponse.json({ ok: true });
  if (!allowedChat(chatId)) {
    await container.activityLog.record({
      agent: "Telegram",
      unit: "Security",
      message: "Rejected Telegram message from non-allowlisted chat.",
      type: "alert",
    });
    return NextResponse.json({ ok: true });
  }

  try {
    if (text === "/agents" || text === "/status") {
      await sendTelegram(chatId, tceAgentStatusText());
    } else if (text === "/help" || text === "/start") {
      await sendTelegram(chatId, "TCE AI Manager\n/agents - trạng thái 15 agent\n/status - registry\nGửi nội dung bất kỳ để Manager route tới đúng agent.");
    } else {
      const result = await runTceAgent(text.replace(/^\/ask\s*/i, ""));
      await sendTelegram(chatId, `[${result.agent} · ${result.mode} · ${result.permission}]\n${result.reply}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Telegram agent execution failed";
    await container.activityLog.record({ agent: "Telegram", unit: "System", message: reason, type: "alert" });
    await sendTelegram(chatId, "TCE AI Manager gặp lỗi an toàn. Không có mutation nào được thực hiện.").catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}