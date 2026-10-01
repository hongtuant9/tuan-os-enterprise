import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const SYNC_KEY = "telegram-operations-group";

type SupplyItem = { type: string; quantity: number };
type Actor = { username?: string; first_name?: string; last_name?: string; id?: number | string };
type State = "NEW" | "ACKNOWLEDGED" | "DONE";

export type SupplyRequestMessage = {
  reviewId: string;
  requestId: string;
  property: string;
  room: string;
  items: SupplyItem[];
  note?: string | null;
  requestedAt: string;
};

const LABELS: Record<string, string> = {
  water: "Nước",
  toilet_paper: "Giấy vệ sinh",
  bath_towel: "Khăn tắm",
  face_towel: "Khăn mặt",
  shampoo: "Dầu gội",
  shower_gel: "Sữa tắm",
  other: "Khác",
};

const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const shortProperty = (v: string) => v.replace(/\s+Homestay$/i, "").trim();
const shortRoom = (v: string) => v.split("_")[0] || v;
const qty = (v: number) => String(Math.max(0, Number(v) || 0)).padStart(2, "0");

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function date(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function actorName(from?: Actor) {
  if (!from) return "Nhân viên";
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (from.username) return "@" + from.username;
  return String(from.id ?? "Nhân viên");
}

function messageText(input: SupplyRequestMessage, state: State = "NEW", actor?: string, stateAt?: string) {
  const request = input.items
    .map((item) => `${LABELS[item.type] ?? item.type} (${qty(item.quantity)})`)
    .join("  |  ");

  let status = "Đang chờ phục vụ";
  if (state === "ACKNOWLEDGED") status = `${actor || "Nhân viên"} _ đang làm${stateAt ? ` (${time(stateAt)})` : ""}`;
  if (state === "DONE") status = `Hoàn thành${stateAt ? ` (${time(stateAt)})` : ""}`;

  return [
    `🏠 ${shortProperty(input.property)} | ${shortRoom(input.room)}`,
    `📦 Yêu cầu: ${request}`,
    input.note ? `📝 Ghi chú: ${input.note}` : "",
    `🕒 Yêu cầu lúc: ${time(input.requestedAt)}, ${date(input.requestedAt)}`,
    `📌 Trạng thái: ${status}`,
  ].filter(Boolean).join("\n");
}

export async function getTelegramOperationsChatId() {
  const db = createAdminClient();
  const { data, error } = await db.from("sync_sources")
    .select("last_cursor")
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
    name: "Vận Hành _Homestay_Group",
    description: "Kênh giao tiếp vận hành chính thức của Homestay cho Lễ tân, Buồng phòng và Quản lý.",
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

export async function sendSupplyRequestToTelegram(input: SupplyRequestMessage) {
  const token = botToken();
  const chatId = await getTelegramOperationsChatId();
  if (!token || !chatId) return { sent: false as const, reason: "operations_group_not_bound" as const };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: messageText(input),
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "🙋 Nhận việc", callback_data: `supply_ack:${input.reviewId}` },
          { text: "✅ Hoàn thành", callback_data: `supply_done:${input.reviewId}` },
        ]],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`Telegram operations send failed HTTP ${response.status}`);
  const payload = await response.json() as { result?: { message_id?: number } };
  return { sent: true as const, messageId: payload.result?.message_id ?? null };
}

export async function handleSupplyCallback(input: { reviewId: string; action: "ack" | "done"; from?: Actor }) {
  const db = createAdminClient();
  const { data: review, error: reviewError } = await db.from("ai_manager_reviews")
    .select("id,conversation_id")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) return { ok: false as const, reason: "review_not_found" as const };

  const { data: conversation, error: conversationError } = await db.from("ai_conversations")
    .select("id,status,metadata")
    .eq("id", review.conversation_id)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return { ok: false as const, reason: "conversation_not_found" as const };

  const metadata: { [key: string]: Json | undefined } =
    conversation.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
      ? { ...(conversation.metadata as { [key: string]: Json | undefined }) }
      : {};

  const actor = actorName(input.from);
  const now = new Date().toISOString();

  if (input.action === "ack") {
    if (metadata.request_status === "DONE" || conversation.status === "closed") {
      return { ok: true as const, state: "DONE" as const, actor, stateAt: String(metadata.completed_at || now), alreadyDone: true };
    }
    if (metadata.request_status === "ACKNOWLEDGED") {
      return {
        ok: true as const,
        state: "ACKNOWLEDGED" as const,
        actor: String(metadata.acknowledged_by || actor),
        stateAt: String(metadata.acknowledged_at || now),
      };
    }

    metadata.request_status = "ACKNOWLEDGED";
    metadata.acknowledged_by = actor;
    metadata.acknowledged_at = now;

    const { error } = await db.from("ai_conversations").update({ metadata }).eq("id", conversation.id);
    if (error) throw error;
    await db.from("ai_manager_reviews")
      .update({ manager_note: `ACKNOWLEDGED via Telegram by ${actor} at ${now}` })
      .eq("id", review.id);

    return { ok: true as const, state: "ACKNOWLEDGED" as const, actor, stateAt: now };
  }

  if (metadata.request_status === "DONE" || conversation.status === "closed") {
    return {
      ok: true as const,
      state: "DONE" as const,
      actor: String(metadata.completed_by || actor),
      stateAt: String(metadata.completed_at || now),
      alreadyDone: true,
    };
  }

  metadata.request_status = "DONE";
  metadata.completed_by = actor;
  metadata.completed_at = now;

  const { error } = await db.from("ai_conversations")
    .update({ metadata, status: "closed" })
    .eq("id", conversation.id);
  if (error) throw error;

  await db.from("ai_manager_reviews")
    .update({
      status: "approved",
      manager_note: `DONE via Telegram by ${actor} at ${now}`,
      decided_at: now,
    })
    .eq("id", review.id);

  return { ok: true as const, state: "DONE" as const, actor, stateAt: now };
}

export async function buildSupplyCallbackMessage(
  reviewId: string,
  state: "ACKNOWLEDGED" | "DONE",
  actor: string,
  stateAt?: string
) {
  const db = createAdminClient();
  const { data: review } = await db.from("ai_manager_reviews")
    .select("evidence")
    .eq("id", reviewId)
    .maybeSingle();

  const evidence = review?.evidence && typeof review.evidence === "object" && !Array.isArray(review.evidence)
    ? review.evidence as Record<string, unknown>
    : {};

  return messageText({
    reviewId,
    requestId: String(evidence.request_id || reviewId),
    property: String(evidence.property || "TCE"),
    room: String(evidence.room || "Unknown"),
    items: Array.isArray(evidence.items) ? evidence.items as SupplyItem[] : [],
    note: typeof evidence.note === "string" ? evidence.note : null,
    requestedAt: String(evidence.requested_at || new Date().toISOString()),
  }, state, actor, stateAt);
}
