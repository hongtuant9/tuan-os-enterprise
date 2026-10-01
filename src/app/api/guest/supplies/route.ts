import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRoomSupplyContext } from "@/server/hospitality/room-supply-qr";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["water", "toilet_paper", "bath_towel", "face_towel", "shampoo", "shower_gel", "other"]);

function asPositiveInt(value: unknown, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(6, Math.floor(n)));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const room = findRoomSupplyContext(token);
    if (!room) return NextResponse.json({ ok: false, error: "INVALID_ROOM_TOKEN" }, { status: 404 });

    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems
      .map((item: unknown) => {
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        const type = typeof obj.type === "string" ? obj.type.trim() : "";
        if (!ALLOWED.has(type)) return null;
        return { type, quantity: asPositiveInt(obj.quantity) };
      })
      .filter(Boolean) as Array<{ type: string; quantity: number }>;

    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : "";
    if (items.length === 0) return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });

    const db = createAdminClient();
    const recentSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from("ai_conversations")
      .select("id")
      .eq("channel", "website")
      .contains("metadata", { room_token: token, source: "QR_ROOM" })
      .gte("created_at", recentSince)
      .limit(5);

    if ((recent?.length ?? 0) >= 5) {
      return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
    }

    const now = new Date().toISOString();
    const requestId = crypto.randomUUID();
    const label: Record<string, string> = {
      water: "Nước uống",
      toilet_paper: "Giấy vệ sinh",
      bath_towel: "Khăn tắm",
      face_towel: "Khăn mặt",
      shampoo: "Dầu gội",
      shower_gel: "Sữa tắm",
      other: "Khác",
    };
    const requestText = items.map((item) => `${label[item.type] ?? item.type} × ${item.quantity}`).join(", ") + (note ? ` · Ghi chú: ${note}` : "");

    const { data: conversation, error: conversationError } = await db
      .from("ai_conversations")
      .insert({
        channel: "website",
        external_conversation_id: `qr-supplies:${requestId}`,
        customer_name: `Khách phòng ${room.room}`,
        language: "vi",
        intent: "guest_message",
        status: "needs_manager",
        last_message_at: now,
        metadata: {
          request_id: requestId,
          source: "QR_ROOM",
          primary_intent: "NEED_SUPPLIES",
          room_token: token,
          room: room.room,
          property: room.property,
          items,
          note: note || null,
          request_status: "NEW",
          requested_at: now,
          privacy: "NO_PII_COLLECTED",
        },
      })
      .select("id")
      .single();

    if (conversationError || !conversation) throw conversationError ?? new Error("CONVERSATION_INSERT_FAILED");

    const { error: reviewError } = await db.from("ai_manager_reviews").insert({
      conversation_id: conversation.id,
      review_type: "service_request",
      title: `Yêu cầu vật dụng · ${room.property} · ${room.room}`,
      guest_request: requestText,
      reason: "Khách gửi yêu cầu trực tiếp từ QR trong phòng.",
      evidence: {
        source: "QR_ROOM",
        request_id: requestId,
        room: room.room,
        property: room.property,
        items,
        requested_at: now,
      },
      recommendation: "Lễ tân xác nhận yêu cầu và chuyển buồng phòng/giao vật dụng. Khi đổi khăn, thu lại khăn bẩn tương ứng.",
      risk_level: "medium",
      status: "pending",
    });

    if (reviewError) {
      await db.from("ai_conversations").update({
        metadata: {
          request_id: requestId,
          source: "QR_ROOM",
          primary_intent: "NEED_SUPPLIES",
          room_token: token,
          room: room.room,
          property: room.property,
          items,
          note: note || null,
          request_status: "NEW",
          requested_at: now,
          privacy: "NO_PII_COLLECTED",
          reception_queue_status: "ERROR",
        },
      }).eq("id", conversation.id);
      throw reviewError;
    }

    return NextResponse.json({ ok: true, requestId, room: room.room, property: room.property });
  } catch (error) {
    console.error("[guest-supplies]", error);
    return NextResponse.json({ ok: false, error: "REQUEST_FAILED" }, { status: 500 });
  }
}
