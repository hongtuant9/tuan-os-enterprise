import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { telegramOwnerChannelStatus } from "@/server/notifications/telegram-owner";
import {
  bindTelegramOperationsGroup,
  buildSupplyCallbackMessage,
  getTelegramOperationsChatId,
  handleSupplyCallback,
} from "@/server/notifications/telegram-operations-compact";
import {
  buildMorningDepartmentMessage,
  handleMorningDepartmentCallback,
} from "@/server/notifications/telegram-morning-operations";
import {
  bindTelegramOperatorGroup,
  ensureFinanceOperatorQuestions,
  getTelegramOperatorChatId,
  handleTelegramOperatorReply,
} from "@/server/notifications/telegram-operator";

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

async function isGroupCreator(chatId: string | number, userId: string) {
  try {
    const result = await telegram("getChatMember", { chat_id: chatId, user_id: userId }) as { result?: { status?: string } } | null;
    return result?.result?.status === "creator";
  } catch {
    return false;
  }
}

async function answerCallback(callbackQueryId: string, text: string) {
  await telegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}

async function editMessage(chatId: string | number, messageId: number, text: string, state: string, reviewId: string) {
  const replyMarkup = state === "DONE"
    ? { inline_keyboard: [] }
    : { inline_keyboard: [[{ text: "✅ Hoàn thành", callback_data: `supply_done:${reviewId}` }]] };
  await telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function editMorningMessage(chatId: string | number, messageId: number, text: string, state: string, reviewId: string) {
  const replyMarkup = state === "DONE"
    ? { inline_keyboard: [] }
    : { inline_keyboard: [[{ text: "🏁 Hoàn thành", callback_data: `morning_done:${reviewId}` }]] };
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
    message_id?: number;
    text?: string;
    chat?: { id?: number | string; type?: string; title?: string };
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
    reply_to_message?: { message_id?: number; text?: string };
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
    console.log("[telegram-ops] callback_received", { data: callback.data, chatId: callback.message?.chat?.id, messageId: callback.message?.message_id, fromId: callback.from?.id });
    const callbackId = callback.id!;
    const callbackData = callback.data!;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const configuredOpsChatId = await getTelegramOperationsChatId().catch(() => "");
    if (chatId == null || !configuredOpsChatId || String(chatId) !== configuredOpsChatId) {
      await answerCallback(callbackId, "This group is not the active TCE Operations group.");
      return NextResponse.json({ ok: true, ignored: "callback_non_ops_group" });
    }

    const supplyMatch = callbackData.match(/^supply_(ack|done):([0-9a-f-]{36})$/i);
    const morningMatch = callbackData.match(/^morning_(ack|done):([0-9a-f-]{36})$/i);
    if (!supplyMatch && !morningMatch) {
      await answerCallback(callbackId, "Thao tác không được hỗ trợ.");
      return NextResponse.json({ ok: true, ignored: "unsupported_callback" });
    }

    const match = supplyMatch ?? morningMatch!;
    const action = match[1].toLowerCase() as "ack" | "done";
    const reviewId = match[2];
    const callbackKind = supplyMatch ? "supply" : "morning";

    try {
      const result = callbackKind === "supply"
        ? await handleSupplyCallback({ reviewId, action, from: callback.from })
        : await handleMorningDepartmentCallback({ reviewId, action, from: callback.from });

      if (!result.ok) {
        console.warn("[telegram-ops] callback_review_not_found", { reviewId, action, callbackKind, reason: result.reason });
        await answerCallback(callbackId, "Không tìm thấy công việc này.");
        return NextResponse.json({ ok: true, ignored: result.reason });
      }

      await answerCallback(
        callbackId,
        result.state === "DONE" ? "Đã hoàn thành" : callbackKind === "morning" ? "Đã xác nhận" : "Đã nhận việc"
      );
      console.log("[telegram-ops] callback_runtime_updated", { reviewId, action, callbackKind, state: result.state, actor: result.actor, stateAt: result.stateAt });

      if (messageId != null) {
        try {
          if (callbackKind === "supply") {
            const text = await buildSupplyCallbackMessage(reviewId, result.state, result.actor, result.stateAt);
            await editMessage(chatId, messageId, text, result.state, reviewId);
          } else {
            const text = await buildMorningDepartmentMessage(reviewId, result.state, result.actor, result.stateAt);
            await editMorningMessage(chatId, messageId, text, result.state, reviewId);
          }
          console.log("[telegram-ops] callback_message_updated", { reviewId, action, callbackKind, state: result.state, messageId });
        } catch (editError) {
          console.error("[telegram-ops] callback_message_update_failed", { reviewId, action, callbackKind, messageId, error: editError instanceof Error ? editError.message : String(editError) });
        }
      }

      return NextResponse.json({ ok: true, action, callbackKind, state: result.state });
    } catch (callbackError) {
      console.error("[telegram-ops] callback_failed", { reviewId, action, callbackKind, error: callbackError instanceof Error ? callbackError.message : String(callbackError) });
      try { await answerCallback(callbackId, "Không thể xử lý, vui lòng thử lại."); } catch {}
      return NextResponse.json({ ok: false, error: "callback_failed" }, { status: 200 });
    }
  }

  const chatId = update.message?.chat?.id;
  if (chatId == null) return NextResponse.json({ ok: true, ignored: "no_chat" });

  const text = (update.message?.text || "").trim();
  const senderId = update.message?.from?.id == null ? "" : String(update.message.from.id);
  const chatType = update.message?.chat?.type || "";
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  if (/^\/bind_operator\b/i.test(text)) {
    const isGroup = chatType === "group" || chatType === "supergroup";
    if (!isGroup) {
      await reply(chatId, "Vui lòng chạy /bind_operator trong nhóm “Tuấn & Quản Lý Vận Hành_ AI Agent Opreator”.");
      return NextResponse.json({ ok: true, ignored: "bind_operator_not_group" });
    }
    const ownerAuthorized = Boolean(ownerChatId && senderId === ownerChatId) || await isGroupCreator(chatId, senderId);
    if (!ownerAuthorized) {
      await reply(chatId, "Chỉ Tuấn hoặc người tạo nhóm được phép liên kết nhóm AI Agent Operator.");
      return NextResponse.json({ ok: true, ignored: "bind_operator_non_owner" });
    }
    await bindTelegramOperatorGroup(chatId, update.message?.chat?.title || null);
    const seeded = await ensureFinanceOperatorQuestions().catch(() => ({ checked: false, sent: 0 }));
    await reply(chatId, [
      "✅ TUAN OS — AI AGENT OPERATOR CONNECTED",
      "Nhóm này là kênh Human-in-the-loop chính thức.",
      "",
      "Quy tắc:",
      "• TUAN OS sẽ hỏi khi runtime thiếu dữ liệu cần Owner xác nhận.",
      "• Tuấn Reply trực tiếp đúng câu hỏi.",
      "• Chỉ reply của Owner mới được ghi VERIFIED vào canonical runtime.",
      "• Tin nhắn rời không gắn câu hỏi sẽ không tự biến thành fact.",
      "• Approval tài chính/security vẫn theo Approval Gate riêng.",
      "",
      `Câu hỏi dữ liệu khởi tạo ngay sau liên kết: ${seeded.sent}`,
    ].join("\n"));
    return NextResponse.json({ ok: true, operatorBound: true });
  }

  if (/^\/bind_ops\b/i.test(text)) {
    const isGroup = chatType === "group" || chatType === "supergroup";
    if (!isGroup) {
      await reply(chatId, "Please run /bind_ops inside the Telegram group you want to use for TCE Operations.\nVui lòng chạy /bind_ops trong nhóm Telegram vận hành.");
      return NextResponse.json({ ok: true, ignored: "bind_not_group" });
    }
    const ownerAuthorized = Boolean(ownerChatId && senderId === ownerChatId) || await isGroupCreator(chatId, senderId);
    if (!ownerAuthorized) {
      await reply(chatId, "Only the TCE Owner or Telegram group creator can bind this group.\nChỉ Owner TCE hoặc người tạo nhóm Telegram được phép liên kết nhóm này.");
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

  const operatorChatId = await getTelegramOperatorChatId().catch(() => "");
  const replyToMessageId = update.message?.reply_to_message?.message_id;
  if (operatorChatId && String(chatId) === operatorChatId && replyToMessageId && text) {
    try {
      const result = await handleTelegramOperatorReply({
        chatId,
        replyToMessageId,
        text,
        actor: update.message?.from,
        ownerTelegramId: ownerChatId,
      });
      if (result.ok) {
        const shownValue = result.valueNumeric != null
          ? new Intl.NumberFormat("vi-VN").format(Number(result.valueNumeric))
          : result.valueText || "Đã ghi nhận";
        await reply(chatId, [
          "✅ TUAN OS — ĐÃ XÁC NHẬN DỮ LIỆU",
          `Đơn vị: ${result.businessUnit}`,
          `Trường: ${result.fieldCode}`,
          `Giá trị: ${shownValue}`,
          result.effectiveFrom ? `Hiệu lực: ${result.effectiveFrom}` : "",
          "Nguồn: OWNER_TELEGRAM → Supabase canonical runtime",
        ].filter(Boolean).join("\n"));
        return NextResponse.json({ ok: true, operatorFact: result.questionCode });
      }
      if (result.reason === "owner_confirmation_required") {
        await reply(chatId, "Đã nhận phản hồi của quản lý. Dữ liệu chưa được VERIFIED; cần Tuấn Reply trực tiếp câu hỏi để xác nhận.");
        return NextResponse.json({ ok: true, operatorFact: "NEED_OWNER_CONFIRMATION" });
      }
      if (result.reason === "parse_failed") {
        await reply(chatId, "Tôi chưa đọc chắc được giá trị. Tuấn vui lòng trả lời ngắn gọn theo đúng đơn vị được hỏi, ví dụ: “10 triệu/tháng”.");
        return NextResponse.json({ ok: true, operatorFact: "PARSE_FAILED" });
      }
    } catch (error) {
      console.error("[telegram-operator] reply_failed", { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ ok: false, error: "operator_reply_failed" }, { status: 200 });
    }
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
      "Nhóm AI Agent Operator: thêm @tuanosenterprise_bot rồi Owner gửi /bind_operator trong đúng nhóm.",
      "Nhóm vận hành QR/phòng (nếu dùng riêng): /bind_ops.",
      "",
      "L3/financial/security vẫn phải approve tại hệ thống chính thức.",
    ].join("\n"));
  } else if (/^\/status\b/i.test(text)) {
    const status = telegramOwnerChannelStatus();
    const opsChatId = await getTelegramOperationsChatId().catch(() => "");
    const operatorChatId = await getTelegramOperatorChatId().catch(() => "");
    await reply(chatId, [
      "TUAN OS — Owner Channel",
      `Telegram Owner: ${status.enabled ? "ACTIVE" : "HOLD"}`,
      `AI Agent Operator Group: ${operatorChatId ? "ACTIVE" : "NOT BOUND"}`,
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
