import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const SYNC_KEY = "telegram-operations-group";

type SupplyItem = { type: string; quantity: number };

type SupplyRequestMessage = {
  reviewId: string;
  requestId: string;
  property: string;
  room: string;
  items: SupplyItem[];
  note?: string | null;
  requestedAt: string;
};

const LABELS: Record<string, string> = {
  water: "Water / Nước uống",
  toilet_paper: "Toilet paper / Giấy vệ sinh",
  bath_towel: "Bath towel / Khăn tắm",
  face_towel: "Face towel / Khăn mặt",
  shampoo: "Shampoo / Dầu gội",
  shower_gel: "Shower gel / Sữa tắm",
  other: "Other / Khác",
};

function token() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

function actorLabel(from?: { username?: string; first_name?: string; last_name?: string; id?: number | string }) {
  if (!from) return "Unknown";
  if (from.username) return "@" + from.username;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return name || String(from.id ?? "Unknown");
}

export async function getTelegramOperationsChatId() {
  const db = createAdminClient();
  const { data, error } = await db
    .from("sync_sources")
    .select("last_cursor,status")
    .eq("key", SYNC_KEY)
    .maybeSingle();
  if (error) throw error;
  return data?.last_cursor?.trim() || "";
}

export async function bindTelegramOperationsGroup(chatId: string | number) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await db.from("sync_sources").upsert({
    key: SYNC_KEY,
    name: "TCE Telegram Operations Group",
    description: "Telegram group bound by Owner for realtime hospitality operations notifications and task acknowledgements.",
    supports_incremental: false,
    schedule_enabled: false,
    status: "idle",
    last_synced_at: now,
    last_cursor: String(chatId),
    last_error: null,
  }, { onConflict: "key" });
  if (error) throw error;
  return String(chatId);
}

function buildSupplyText(input: SupplyRequestMessage, state = "NEW", actor?: string) {
  const lines = input.items.map((item) => `• ${LABELS[item.type] ?? item.type} × ${item.quantity}`);
  return [
    "🛎 TCE — GUEST SUPPLY REQUEST",
    "Yêu cầu vật dụng từ khách",
    "",
    `🏠 Property / Cơ sở: ${input.property}`,
    `🚪 Room / Phòng: ${input.room}`,
    `📦 Request / Yêu cầu:`,
    ...lines,
    input.note ? `📝 Note / Ghi chú: ${input.note}` : "",
    `🕒 Requested / Thời gian: ${new Date(input.requestedAt).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })}`,
    `📌 Status / Trạng thái: ${state}${actor ? " — " + actor : ""}`,
    "",
    `ID: ${input.requestId.slice(0, 8)}`,
  ].filter(Boolean).join("\n");
}

export async function sendSupplyRequestToTelegram(input: SupplyRequestMessage) {
  const botToken = token();
  const chatId = await getTelegramOperationsChatId();
  if (!botToken || !chatId) return { sent: false as const, reason: "operations_group_not_bound" as const };

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildSupplyText(input),
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "🙋 Take task / Nhận việc", callback_data: `supply_ack:${input.reviewId}` },
          { text: "✅ Done / Hoàn thành", callback_data: `supply_done:${input.reviewId}` },
        ]],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Telegram operations send failed HTTP ${response.status}`);
  const payload = await response.json() as { result?: { message_id?: number } };
  return { sent: true as const, messageId: payload.result?.message_id ?? null };
}

export async function handleSupplyCallback(input: {
  reviewId: string;
  action: "ack" | "done";
  from?: { username?: string; first_name?: string; last_name?: string; id?: number | string };
}) {
  const db = createAdminClient();
  const { data: review, error: reviewError } = await db
    .from("ai_manager_reviews")
    .select("id,conversation_id,title,guest_request,evidence,status")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) return { ok: false as const, reason: "review_not_found" as const };

  const { data: conversation, error: conversationError } = await db
    .from("ai_conversations")
    .select("id,status,metadata")
    .eq("id", review.conversation_id)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return { ok: false as const, reason: "conversation_not_found" as const };

  const metadata = conversation.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
    ? { ...(conversation.metadata as Record<string, unknown>) }
    : {};
  const actor = actorLabel(input.from);
  const now = new Date().toISOString();

  if (input.action === "ack") {
    if (metadata.request_status === "DONE" || conversation.status === "closed") {
      return { ok: true as const, state: "DONE", actor, alreadyDone: true };
    }
    metadata.request_status = "ACKNOWLEDGED";
    metadata.acknowledged_by = actor;
    metadata.acknowledged_at = now;
    const { error: convUpdateError } = await db.from("ai_conversations")
      .update({ metadata })
      .eq("id", conversation.id);
    if (convUpdateError) throw convUpdateError;
    const { error: reviewUpdateError } = await db.from("ai_manager_reviews")
      .update({ manager_note: `ACKNOWLEDGED via Telegram by ${actor} at ${now}` })
      .eq("id", review.id);
    if (reviewUpdateError) throw reviewUpdateError;
    return { ok: true as const, state: "ACKNOWLEDGED", actor };
  }

  metadata.request_status = "DONE";
  metadata.completed_by = actor;
  metadata.completed_at = now;
  const { error: convUpdateError } = await db.from("ai_conversations")
    .update({ metadata, status: "closed" })
    .eq("id", conversation.id);
  if (convUpdateError) throw convUpdateError;
  const { error: reviewUpdateError } = await db.from("ai_manager_reviews")
    .update({
      status: "approved",
      manager_note: `DONE via Telegram by ${actor} at ${now}`,
      decided_at: now,
    })
    .eq("id", review.id);
  if (reviewUpdateError) throw reviewUpdateError;
  return { ok: true as const, state: "DONE", actor };
}

export async function buildSupplyCallbackMessage(reviewId: string, state: string, actor: string) {
  const db = createAdminClient();
  const { data: review } = await db
    .from("ai_manager_reviews")
    .select("evidence")
    .eq("id", reviewId)
    .maybeSingle();
  const evidence = review?.evidence && typeof review.evidence === "object" && !Array.isArray(review.evidence)
    ? review.evidence as Record<string, unknown>
    : {};
  return buildSupplyText({
    reviewId,
    requestId: String(evidence.request_id || reviewId),
    property: String(evidence.property || "TCE"),
    room: String(evidence.room || "Unknown"),
    items: Array.isArray(evidence.items) ? evidence.items as SupplyItem[] : [],
    note: typeof evidence.note === "string" ? evidence.note : null,
    requestedAt: String(evidence.requested_at || new Date().toISOString()),
  }, state, actor);
}
