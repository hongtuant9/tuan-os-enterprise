import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type Actor = { username?: string; first_name?: string; last_name?: string; id?: number | string };

type AllocationInput = {
  raw: string;
  actor?: Actor;
};

type RoomAllocation = {
  roomDisplay: string;
  guests: number;
};

type BookingRow = {
  source_booking_code: string | null;
  check_in: string;
  check_out: string;
  adults: number | null;
  children: number | null;
  room_names: Json | null;
  booking_status: string | null;
};

function actorName(from?: Actor) {
  if (!from) return "Nhân viên";
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (from.username) return "@" + from.username;
  return String(from.id ?? "Nhân viên");
}

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function branchFromRoom(room: string) {
  if (/_La$/i.test(room)) return "Lavender";
  if (/_(Double|Dobule|Twin|Family)$/i.test(room)) return "Ruby";
  return "";
}

function normalizeBranch(value: string) {
  const v = value.trim().toLowerCase();
  if (v.startsWith("lav")) return "Lavender";
  if (v.startsWith("rub")) return "Ruby";
  return "";
}

function displayRoom(room: string) {
  return String(room || "").split("_")[0] || room;
}

function setupBundle(guests: number) {
  const base: Record<number, Record<string, number>> = {
    1: { water: 1, coffee: 1, tea: 0, toothbrush: 1, bath_towel: 1, face_towel: 1 },
    2: { water: 2, coffee: 1, tea: 1, toothbrush: 2, bath_towel: 2, face_towel: 2 },
    3: { water: 3, coffee: 2, tea: 1, toothbrush: 3, bath_towel: 3, face_towel: 3 },
    4: { water: 4, coffee: 2, tea: 2, toothbrush: 4, bath_towel: 4, face_towel: 4 },
    5: { water: 5, coffee: 3, tea: 2, toothbrush: 5, bath_towel: 5, face_towel: 5 },
    6: { water: 6, coffee: 4, tea: 2, toothbrush: 6, bath_towel: 6, face_towel: 6 },
  };
  return base[guests] || null;
}

function deltaText(fromGuests: number, toGuests: number) {
  if (fromGuests === toGuests) return "không thay đổi vật dụng";
  const before = setupBundle(fromGuests);
  const after = setupBundle(toGuests);
  if (!before || !after) return `điều chỉnh setup theo ${toGuests} khách`;

  const labels: Record<string, string> = {
    water: "nước",
    coffee: "cafe",
    tea: "trà",
    toothbrush: "bàn chải",
    bath_towel: "khăn tắm",
    face_towel: "khăn mặt",
  };
  const changes: string[] = [];
  for (const key of Object.keys(labels)) {
    const delta = Number(after[key] || 0) - Number(before[key] || 0);
    if (delta > 0) changes.push(`${labels[key]} +${delta}`);
    if (delta < 0) changes.push(`${labels[key]} ${delta}`);
  }
  const verb = toGuests > fromGuests ? "bổ sung" : "thu bớt";
  return `${verb}: ${changes.join(", ")}`;
}

function parseCommand(raw: string) {
  const tokens = raw.trim().split(/\s+/);
  if (tokens.length < 4) {
    return { ok: false as const, reason: "format" as const };
  }
  const target = tokens[1];
  const allocations: RoomAllocation[] = [];
  for (const token of tokens.slice(2)) {
    const match = token.match(/^(\d{3})=(\d+)$/);
    if (!match) return { ok: false as const, reason: "format" as const };
    allocations.push({ roomDisplay: match[1], guests: Number(match[2]) });
  }
  if (!allocations.length || allocations.some((x) => x.guests < 1 || x.guests > 6)) {
    return { ok: false as const, reason: "range" as const };
  }
  const unique = new Set(allocations.map((x) => x.roomDisplay));
  if (unique.size !== allocations.length) return { ok: false as const, reason: "duplicate" as const };
  return { ok: true as const, target, allocations };
}

async function fetchOrder(bookingCode: string) {
  let base = process.env.KIOTVIET_HOTEL_API_BASE_URL?.trim() || "https://api-integration-hotel.kiotviet.vn";
  base = base.replace(/\/$/, "");
  const key = process.env.KIOTVIET_HOTEL_PUBLIC_API_KEY?.trim() || process.env.KIOTVIET_CLIENT_SECRET?.trim() || "";
  if (!key) throw new Error("KIOTVIET_HOTEL_API_KEY_NOT_SET");
  const response = await fetch(`${base}/public/order?code=${encodeURIComponent(bookingCode)}`, {
    headers: { accept: "application/json", PublicApiKey: key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`KIOTVIET_ORDER_HTTP_${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const result = payload.result && typeof payload.result === "object" ? payload.result as Record<string, unknown> : payload;
  return result;
}

function roomCapacity(order: Record<string, unknown>, room: string) {
  const details = Array.isArray(order.orderDetails) ? order.orderDetails as Array<Record<string, unknown>> : [];
  const line = details.find((x) => String(x.roomName || "") === room);
  const productName = String(line?.productName || "").toLowerCase();
  if (productName.includes("double")) return { capacity: 2, type: "Double" };
  if (productName.includes("twin") || productName.includes("family")) return { capacity: 4, type: "Twin/Family" };
  return { capacity: null as number | null, type: "NEED_VERIFY" };
}

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, Json | undefined>) };
}

export async function recordRoomAllocation(input: AllocationInput) {
  const parsed = parseCommand(input.raw);
  if (!parsed.ok) {
    return {
      ok: false as const,
      reason: parsed.reason,
      message: "Cú pháp: /phanphong Lavender 103=3 201=2\nHoặc: /phanphong DP002818 104=2 101=3",
    };
  }

  const db = createAdminClient() as any;
  const today = localDate();
  const targetBranch = normalizeBranch(parsed.target);
  const targetBookingCode = /^DP\d+$/i.test(parsed.target) ? parsed.target.toUpperCase() : "";

  const { data: active, error: activeError } = await db
    .from("hospitality_bookings")
    .select("source_booking_code,check_in,check_out,adults,children,room_names,booking_status")
    .eq("booking_status", "CONFIRMED")
    .lte("check_in", today)
    .gte("check_out", today)
    .limit(200);
  if (activeError) throw activeError;

  const requestedNumbers = new Set(parsed.allocations.map((x) => x.roomDisplay));
  const activeRows = (active || []) as BookingRow[];
  const candidates = activeRows.filter((booking: BookingRow) => {
    if (targetBookingCode && booking.source_booking_code !== targetBookingCode) return false;
    const rooms = Array.isArray(booking.room_names) ? booking.room_names.map(String) : [];
    const filtered = targetBranch ? rooms.filter((room) => branchFromRoom(room) === targetBranch) : rooms;
    const display = new Set(filtered.map(displayRoom));
    return [...requestedNumbers].every((room) => display.has(room));
  });

  if (candidates.length !== 1) {
    return {
      ok: false as const,
      reason: candidates.length ? "ambiguous_booking" : "booking_not_found",
      message: candidates.length
        ? "Có nhiều booking phù hợp. Vui lòng dùng mã booking: /phanphong DPxxxxxx 103=3 201=2"
        : "Không tìm thấy booking đang lưu trú/check-in hôm nay chứa đủ các phòng đã nhập.",
    };
  }

  const booking = candidates[0];
  const bookingRooms = Array.isArray(booking.room_names) ? booking.room_names.map(String) : [];
  const branch = targetBranch || branchFromRoom(bookingRooms[0] || "");
  const canonicalRooms = bookingRooms.filter((room) => branchFromRoom(room) === branch);
  const requestedCanonical = parsed.allocations.map((allocation) => {
    const matches = canonicalRooms.filter((room) => displayRoom(room) === allocation.roomDisplay);
    return { ...allocation, room: matches[0] || "" };
  });

  if (requestedCanonical.some((x) => !x.room)) {
    return { ok: false as const, reason: "room_not_found", message: "Có phòng không khớp với booking đang hoạt động." };
  }

  if (requestedCanonical.length !== canonicalRooms.length) {
    return {
      ok: false as const,
      reason: "must_cover_all_rooms",
      message: `Booking ${booking.source_booking_code} có ${canonicalRooms.length} phòng. Vui lòng nhập phân bổ cho tất cả: ${canonicalRooms.map(displayRoom).join(", ")}.`,
    };
  }

  const bookingGuests = Number(booking.adults || 0) + Number(booking.children || 0);
  const allocatedGuests = requestedCanonical.reduce((sum, x) => sum + x.guests, 0);
  if (bookingGuests !== allocatedGuests) {
    return {
      ok: false as const,
      reason: "guest_total_mismatch",
      message: `Tổng phân bổ = ${allocatedGuests} khách nhưng booking = ${bookingGuests} khách. Chưa ghi nhận.`,
    };
  }

  const order = await fetchOrder(booking.source_booking_code || "");
  const capacityIssues: string[] = [];
  const roomMeta = requestedCanonical.map((x) => {
    const cap = roomCapacity(order, x.room);
    if (cap.capacity == null) capacityIssues.push(`${x.roomDisplay}: chưa xác minh được loại phòng`);
    else if (x.guests > cap.capacity) capacityIssues.push(`${x.roomDisplay}: ${x.guests} khách > sức chứa ${cap.capacity}`);
    return { ...x, ...cap };
  });
  if (capacityIssues.length) {
    return {
      ok: false as const,
      reason: "capacity_check_failed",
      message: ["⚠️ Chưa thể chốt phân phòng:", ...capacityIssues.map((x) => "• " + x), "Cần quản lý/Lễ tân kiểm tra trước khi đổi."].join("\n"),
    };
  }

  const setupKeys = roomMeta.map((x) => `${branch} Homestay|${x.room}`);
  const { data: setupRows } = await db
    .from("sync_records")
    .select("external_id,data")
    .eq("source_key", "housekeeping_room_setup")
    .in("external_id", setupKeys);

  const setupMap = new Map<string, Record<string, Json | undefined>>((setupRows || []).map((x: any) => [String(x.external_id), asRecord(x.data as Json)]));

  const actualIds = roomMeta.map((x) => `${booking.source_booking_code}|${x.room}`);
  const { data: previousActualRows } = await db
    .from("sync_records")
    .select("external_id,data")
    .eq("source_key", "room_actual_occupancy")
    .in("external_id", actualIds);
  const actualMap = new Map<string, Record<string, Json | undefined>>((previousActualRows || []).map((x: any) => [String(x.external_id), asRecord(x.data as Json)]));

  const now = new Date().toISOString();
  const actor = actorName(input.actor);
  const changes = roomMeta.map((room) => {
    const actual = actualMap.get(`${booking.source_booking_code}|${room.room}`);
    const setup = setupMap.get(`${branch} Homestay|${room.room}`) || setupMap.get(`${branch}|${room.room}`);
    const baseline = Number(actual?.guests ?? setup?.setup_guests ?? room.capacity ?? room.guests);
    return {
      ...room,
      previousGuests: Number.isFinite(baseline) ? baseline : room.guests,
      deltaText: deltaText(Number.isFinite(baseline) ? baseline : room.guests, room.guests),
    };
  });

  const upserts = changes.map((room) => ({
    source_key: "room_actual_occupancy",
    external_id: `${booking.source_booking_code}|${room.room}`,
    target_table: "hospitality_bookings",
    target_id: null,
    data: {
      booking_code: booking.source_booking_code,
      branch,
      room: room.room,
      room_display: room.roomDisplay,
      guests: room.guests,
      capacity: room.capacity,
      room_type: room.type,
      source: "TELEGRAM_FRONT_DESK",
      verification_status: "VERIFIED",
      recorded_by: actor,
      recorded_by_telegram_id: input.actor?.id == null ? null : String(input.actor.id),
      recorded_by_username: input.actor?.username || null,
      recorded_at: now,
      effective_date: today,
    },
    synced_at: now,
    updated_at: now,
  }));

  const { error: upsertError } = await db
    .from("sync_records")
    .upsert(upserts, { onConflict: "source_key,external_id" });
  if (upsertError) throw upsertError;

  const lines = [
    `🔄 THAY ĐỔI PHÂN BỔ KHÁCH | ${branch}`,
    `Booking: ${booking.source_booking_code} — ${bookingGuests} khách / ${canonicalRooms.length} phòng`,
    "",
    ...changes.map((room) =>
      `• ${room.roomDisplay}: ${room.previousGuests} → ${room.guests} khách — ${room.deltaText}`
    ),
    "",
    "🧹 Buồng phòng: kiểm tra và điều chỉnh setup theo phân bổ thực tế trên.",
    "✅ Hoàn thành khi: vật dụng/linen của các phòng đã đúng số khách thực tế.",
  ];

  const externalConversationId = `room-allocation:${booking.source_booking_code}:${Date.now()}`;
  const { data: conversation, error: conversationError } = await db
    .from("ai_conversations")
    .insert({
      channel: "other",
      external_conversation_id: externalConversationId,
      customer_name: `TCE Room Allocation - ${booking.source_booking_code}`,
      language: "vi",
      intent: "guest_message",
      status: "needs_manager",
      mode: "live",
      last_message_at: now,
      metadata: {
        source: "HOUSEKEEPING_ALLOCATION_ADJUSTMENT",
        booking_code: booking.source_booking_code,
        branch,
        body_lines: lines,
        task_status: "NOTIFIED",
        notified_at: now,
        allocations: changes.map((room) => ({
          room: room.room,
          room_display: room.roomDisplay,
          previous_guests: room.previousGuests,
          target_guests: room.guests,
        })),
      },
      source: "HOUSEKEEPING_ALLOCATION_ADJUSTMENT",
      primary_intent: "OPERATIONS_TASK",
      lead_status: "SUPPORT",
      routed_agent: "Manager Agent",
      human_handoff: true,
      verification_status: "VERIFIED",
    })
    .select("id")
    .single();
  if (conversationError) throw conversationError;

  const { data: review, error: reviewError } = await db
    .from("ai_manager_reviews")
    .insert({
      conversation_id: conversation.id,
      review_type: "service_request",
      title: `Điều chỉnh setup · ${branch} · ${booking.source_booking_code}`,
      guest_request: lines.join("\n"),
      reason: "Lễ tân cập nhật phân bổ khách thực tế sau check-in.",
      evidence: {
        source: "HOUSEKEEPING_ALLOCATION_ADJUSTMENT",
        booking_code: booking.source_booking_code,
        branch,
        body_lines: lines,
        task_status: "NOTIFIED",
        notified_at: now,
      },
      recommendation: "Buồng phòng xác nhận và hoàn thành điều chỉnh setup theo delta.",
      risk_level: "low",
      status: "pending",
    })
    .select("id")
    .single();
  if (reviewError) throw reviewError;

  return {
    ok: true as const,
    branch,
    bookingCode: booking.source_booking_code || "",
    bookingGuests,
    allocations: changes,
    taskReviewId: review.id,
    taskLines: lines,
    notifiedAt: now,
    confirmation: [
      `✅ Đã ghi nhận phân bổ thực tế — ${branch} | ${booking.source_booking_code}`,
      ...changes.map((room) => `• ${room.roomDisplay}: ${room.guests} khách`),
      "Đã tạo việc điều chỉnh setup cho Buồng phòng.",
    ].join("\n"),
  };
}

export async function attachRoomAllocationTelegramEvidence(input: {
  reviewId: string;
  chatId: string | number;
  messageId: number;
}) {
  const db = createAdminClient() as any;
  const { data: review, error } = await db
    .from("ai_manager_reviews")
    .select("conversation_id,evidence")
    .eq("id", input.reviewId)
    .single();
  if (error) throw error;

  const evidence = asRecord(review.evidence as Json);
  evidence.telegram_chat_id = String(input.chatId);
  evidence.telegram_message_id = input.messageId;

  const { error: reviewUpdateError } = await db
    .from("ai_manager_reviews")
    .update({ evidence })
    .eq("id", input.reviewId);
  if (reviewUpdateError) throw reviewUpdateError;

  const { data: conversation, error: conversationError } = await db
    .from("ai_conversations")
    .select("metadata")
    .eq("id", review.conversation_id)
    .single();
  if (conversationError) throw conversationError;
  const metadata = asRecord(conversation.metadata as Json);
  metadata.telegram_chat_id = String(input.chatId);
  metadata.telegram_message_id = input.messageId;

  const { error: conversationUpdateError } = await db
    .from("ai_conversations")
    .update({ metadata })
    .eq("id", review.conversation_id);
  if (conversationUpdateError) throw conversationUpdateError;
}
