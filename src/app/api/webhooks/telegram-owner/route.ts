import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { telegramOwnerChannelStatus } from "@/server/notifications/telegram-owner";
import {
  bindTelegramOperationsGroup,
  buildSupplyCallbackMessage,
  getTelegramOperationsChatId,
  handleSupplyCallback,
} from "@/server/notifications/telegram-operations";

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

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

async function telegram(method: string, body: Record<string, unknown>) {
  const token = botToken();
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed HTTP ${response.status}`);
  return response.json();
}

async function reply(chatId: string | number, text: string) {
  await telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

async function answerCallback(callbackQueryId: string, text: string) {
  await telegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}

async function editMessage(chatId: string | number, messageId: number, text: string, state: string, reviewId: string) {
  const replyMarkup = state === "DONE"
    ? { inline_keyboard: [] }
    : { inline_keyboard: [[{ text: "✅ Done / Hoàn thành", callback_data: `supply_done:${reviewId}` }]] };
  await telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string; type?: string; title?: string };
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
    message?: {
      message_id?: number;
      chat?: { id?: number | string; type?: string; title?: string };
    };
  };
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true, ignored: "empty_update" });

  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || "";

  if (update.callback_query?.id && update.callback_query.data) {
    const callback = update.callback_query;
    const callbackId = callback.id;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const configuredOpsChatId = await getTelegramOperationsChatId().catch(() => "");
    if (chatId == null || !configuredOpsChatId || String(chatId) !== configuredOpsChatId) {
      await answerCallback(callbackId, "This group is not the active TCE Operations group.");
      return NextResponse.json({ ok: true, ignored: "callback_non_ops_group" });
    }

    const match = callback.data.match(/^supply_(ack|done):([0-9a-f-]{36})$/i);
    if (!match) {
      await answerCallback(callbackId, "Unsupported action.");
      return NextResponse.json({ ok: true, ignored: "unsupported_callback" });
    }

    const action = match[1].toLowerCase() as "ack" | "done";
    const reviewId = match[2];
    const result = await handleSupplyCallback({ reviewId, action, from: callback.from });
    if (!result.ok) {
      await answerCallback(callbackId, "Request not found.");
      return NextResponse.json({ ok: true, ignored: result.reason });
    }

    await answerCallback(
      callback.id,
      result.state === "DONE" ? "Marked as completed / Đã hoàn thành" : "Task accepted / Đã nhận việc"
    );

    if (messageId != null) {
      const text = await buildSupplyCallbackMessage(reviewId, result.state, result.actor);
      await editMessage(chatId, messageId, text, result.state, reviewId);
    }

    return NextResponse.json({ ok: true, action, state: result.state });
  }

  const chatId = update.message?.chat?.id;
  if (chatId == null) return NextResponse.json({ ok: true, ignored: "no_chat" });

  const text = (update.message?.text || "").trim();
  const senderId = update.message?.from?.id == null ? "" : String(update.message.from.id);
  const chatType = update.message?.chat?.type || "";
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  if (/^\/bind_ops\b/i.test(text)) {
    const isGroup = chatType === "group" || chatType === "supergroup";
    if (!isGroup) {
      await reply(chatId, "Please run /bind_ops inside the Telegram group you want to use for TCE Operations.\nVui lòng chạy /bind_ops trong nhóm Telegram vận hành.");
      return NextResponse.json({ ok: true, ignored: "bind_not_group" });
    }
    if (!ownerChatId || senderId !== ownerChatId) {
      await reply(chatId, "Only the TCE Owner can bind this group.\nChỉ Owner TCE được phép liên kết nhóm này.");
      return NextResponse.json({ ok: true, ignored: "bind_non_owner" });
    }
    await bindTelegramOperationsGroup(chatId);
    await reply(chatId, [
      "✅ TCE OPERATIONS GROUP CONNECTED",
      "Nhóm vận hành TCE đã được kết nối.",
      "",
      "New room QR requests will be posted here automatically.",
      "Các yêu cầu QR từ phòng sẽ tự động gửi vào nhóm này.",
      "",
      "Use the buttons under each request:",
      "• 🙋 Take task / Nhận việc",
      "• ✅ Done / Hoàn thành",
    ].join("\n"));
    return NextResponse.json({ ok: true, bound: true });
  }

  if (String(chatId) !== ownerChatId) {
    return NextResponse.json({ ok: true, ignored: "non_owner_chat" });
  }

  if (/^\/start\b/i.test(text) || /^\/help\b/i.test(text)) {
    await reply(chatId, [
      "TUAN OS Telegram Owner Channel đã kết nối.",
      "Lệnh:",
      "/status — trạng thái kênh và runtime policy",
      "/approvals — mở Approval Center",
      "/ack <TASK_ID> — ghi nhận Tuấn đã thấy cảnh báo; không tự approve mutation",
      "",
      "Để tạo nhóm vận hành: tạo Telegram Group, thêm @tuanosenterprise_bot, rồi chính Owner gửi /bind_ops trong group.",
      "",
      "L3/financial/security vẫn phải approve tại hệ thống chính thức.",
    ].join("\n"));
  } else if (/^\/status\b/i.test(text)) {
    const status = telegramOwnerChannelStatus();
    const opsChatId = await getTelegramOperationsChatId().catch(() => "");
    await reply(chatId, [
      "TUAN OS — Owner Channel",
      `Telegram Owner: ${status.enabled ? "ACTIVE" : "HOLD"}`,
      `TCE Operations Group: ${opsChatId ? "ACTIVE" : "NOT BOUND"}`,
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
