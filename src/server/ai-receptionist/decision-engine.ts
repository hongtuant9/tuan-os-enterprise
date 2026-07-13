import type { Json } from "@/lib/supabase/types";

export type PilotDecision = {
  reply: string;
  conversationStatus: "active" | "waiting_guest" | "needs_manager";
  metadataPatch: Record<string, Json>;
  evidence: Record<string, Json>;
  review?: {
    reviewType: "missing_data" | "policy_exception" | "service_request" | "booking_exception";
    title: string;
    reason: string;
    missingFields: string[];
    recommendation: string;
    proposedReply: string;
    riskLevel: "low" | "medium" | "high";
  };
};

const GAP_RULES: Array<{
  field: string;
  title: string;
  pattern: RegExp;
  reviewType: PilotDecision["review"] extends infer R
    ? R extends { reviewType: infer T }
      ? T
      : never
    : never;
}> = [
  {
    field: "check_in_cutoff",
    title: "Xác nhận giờ nhận phòng",
    pattern: /(check[ -]?in|nhận phòng|đến muộn|đến sớm)/i,
    reviewType: "missing_data",
  },
  {
    field: "check_out_cutoff",
    title: "Xác nhận giờ trả phòng",
    pattern: /(check[ -]?out|trả phòng|rời phòng)/i,
    reviewType: "missing_data",
  },
  {
    field: "breakfast_policy",
    title: "Xác nhận chính sách bữa sáng",
    pattern: /(breakfast|bữa sáng|ăn sáng)/i,
    reviewType: "missing_data",
  },
  {
    field: "child_policy",
    title: "Xác nhận chính sách trẻ em",
    pattern: /(trẻ em|trẻ nhỏ|em bé|child|children|baby)/i,
    reviewType: "policy_exception",
  },
  {
    field: "early_late_extra_fee",
    title: "Xác nhận phụ thu nhận sớm, trả muộn hoặc thêm người",
    pattern: /(phụ thu|nhận sớm|trả muộn|thêm người|extra guest|early check|late check)/i,
    reviewType: "policy_exception",
  },
  {
    field: "taxi_price_rule",
    title: "Xác nhận dịch vụ taxi",
    pattern: /(taxi|đón sân bay|đón ga|airport transfer|pickup|pick up)/i,
    reviewType: "service_request",
  },
  {
    field: "bicycle_motorbike_policy",
    title: "Xác nhận dịch vụ xe đạp hoặc xe máy",
    pattern: /(xe đạp|xe máy|bicycle|motorbike|scooter)/i,
    reviewType: "service_request",
  },
  {
    field: "cooking_class_status",
    title: "Xác nhận lớp học nấu ăn",
    pattern: /(cooking class|lớp học nấu ăn|học nấu ăn)/i,
    reviewType: "service_request",
  },
  {
    field: "sellable_experiences",
    title: "Xác nhận trải nghiệm được phép bán",
    pattern: /(tour|trải nghiệm|experience|hang múa|tràng an|tam cốc)/i,
    reviewType: "service_request",
  },
  {
    field: "cozy_voucher_rule",
    title: "Xác nhận ưu đãi Cozy Garden",
    pattern: /(voucher|giảm 10|discount|ưu đãi|khuyến mại)/i,
    reviewType: "policy_exception",
  },
  {
    field: "room_asset_allowlist",
    title: "Xác nhận ảnh được phép gửi",
    pattern: /(ảnh phòng|hình phòng|photo|picture|image)/i,
    reviewType: "missing_data",
  },
  {
    field: "cozy_location_claim",
    title: "Xác nhận vị trí Cozy Garden",
    pattern: /(cozy garden.*(ở đâu|vị trí|trong khuôn viên)|trong khuôn viên.*cozy)/i,
    reviewType: "missing_data",
  },
];

function normalizePhone(content: string): string | null {
  const match = content.match(/(?:\+?84|0)\d{8,10}/);
  return match?.[0] ?? null;
}

function extractGuestCount(content: string): number | null {
  const match = content.match(/(\d+)\s*(?:người|khách|adults?|people|persons?)/i);
  return match ? Number(match[1]) : null;
}

function extractDateRange(content: string): { checkIn: string | null; checkOut: string | null } {
  const isoDates = content.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  if (isoDates.length >= 2) return { checkIn: isoDates[0]!, checkOut: isoDates[1]! };

  const shortDates = [...content.matchAll(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\b/g)];
  if (shortDates.length < 2) return { checkIn: null, checkOut: null };

  const year = new Date().getFullYear();
  const toIso = (match: RegExpMatchArray) => {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    return `${match[3] ?? year}-${month}-${day}`;
  };
  return { checkIn: toIso(shortDates[0]), checkOut: toIso(shortDates[1]) };
}

function detectProperty(content: string): string | null {
  if (/lavender/i.test(content)) return "Lavender Homestay";
  if (/ruby/i.test(content)) return "Ruby Homestay";
  return null;
}

export function decidePilotMessage(
  content: string,
  existingMetadata: Record<string, Json>,
  customerName?: string,
  customerContact?: string
): PilotDecision {
  const trimmed = content.trim();
  const dates = extractDateRange(trimmed);
  const metadataPatch: Record<string, Json> = {
    customer_name: customerName ?? (existingMetadata.customer_name as string | undefined) ?? null,
    customer_contact:
      customerContact ?? normalizePhone(trimmed) ?? (existingMetadata.customer_contact as string | undefined) ?? null,
    check_in: dates.checkIn ?? existingMetadata.check_in ?? null,
    check_out: dates.checkOut ?? existingMetadata.check_out ?? null,
    guest_count: extractGuestCount(trimmed) ?? existingMetadata.guest_count ?? null,
    property_hint: detectProperty(trimmed) ?? existingMetadata.property_hint ?? null,
    last_guest_message: trimmed,
  };

  const evidence = {
    engine: "PRIVATE_PILOT_RULE_ENGINE_V1",
    source: "guest_direct_message",
    evaluated_at: new Date().toISOString(),
  } satisfies Record<string, Json>;

  const matchedGap = GAP_RULES.find((rule) => rule.pattern.test(trimmed));
  if (matchedGap) {
    return {
      reply:
        "Em đã ghi nhận yêu cầu. Nội dung này hiện chưa có dữ liệu đã được xác nhận đầy đủ, nên em đang chuyển Quản lý Homestay kiểm tra trước khi trả lời chính thức cho anh/chị.",
      conversationStatus: "needs_manager",
      metadataPatch,
      evidence,
      review: {
        reviewType: matchedGap.reviewType,
        title: matchedGap.title,
        reason: `Trường dữ liệu ${matchedGap.field} đang UNKNOWN hoặc NEED_VERIFY trong giai đoạn Private Pilot.`,
        missingFields: [matchedGap.field],
        recommendation:
          "Quản lý Homestay xác nhận thông tin áp dụng, phạm vi cơ sở, điều kiện và thời hạn; ghi chú rõ để AI tiếp tục hội thoại.",
        proposedReply:
          "Em đang kiểm tra lại thông tin với Quản lý Homestay và sẽ phản hồi anh/chị ngay khi có xác nhận.",
        riskLevel: matchedGap.reviewType === "policy_exception" ? "high" : "medium",
      },
    };
  }

  const bookingIntent = /(phòng|đặt phòng|booking|room|stay|cuối tuần|homestay)/i.test(trimmed);
  if (!bookingIntent) {
    return {
      reply:
        "Em là AI Lễ tân của Tam Coc Experience. Em có thể hỗ trợ tư vấn phòng tại Lavender hoặc Ruby, hướng dẫn di chuyển và các dịch vụ phù hợp. Anh/chị đang cần hỗ trợ nội dung nào ạ?",
      conversationStatus: "active",
      metadataPatch,
      evidence,
    };
  }

  const missing: string[] = [];
  if (!metadataPatch.check_in) missing.push("ngày nhận phòng");
  if (!metadataPatch.check_out) missing.push("ngày trả phòng");
  if (!metadataPatch.guest_count) missing.push("số khách");
  if (!metadataPatch.property_hint) missing.push("cơ sở Lavender hoặc Ruby");
  if (!metadataPatch.customer_name) missing.push("tên người đặt");
  if (!metadataPatch.customer_contact) missing.push("số điện thoại hoặc thông tin liên hệ");

  if (missing.length > 0) {
    return {
      reply: `Để kiểm tra chính xác phòng trống và giá, anh/chị vui lòng bổ sung: ${missing.join(
        ", "
      )}. Em sẽ tiếp tục tư vấn ngay khi nhận đủ thông tin.`,
      conversationStatus: "waiting_guest",
      metadataPatch,
      evidence,
    };
  }

  return {
    reply:
      "Em đã nhận đủ thông tin cơ bản. Hệ thống đang ở chế độ thử nghiệm và kết nối đọc phòng trống/giá KiotViet chưa được nghiệm thu, nên em chuyển Quản lý Homestay xác nhận trước khi cam kết với anh/chị.",
    conversationStatus: "needs_manager",
    metadataPatch,
    evidence,
    review: {
      reviewType: "booking_exception",
      title: "Xác nhận yêu cầu đặt phòng trong Private Pilot",
      reason: "Chưa có kết quả phòng trống và giá live đã được xác minh từ KiotViet Hotel.",
      missingFields: ["kiotviet_live_availability", "kiotviet_live_price"],
      recommendation:
        "Quản lý Homestay kiểm tra phòng trống và giá trên KiotViet, sau đó duyệt, từ chối hoặc yêu cầu AI hỏi thêm khách.",
      proposedReply:
        "Em đang kiểm tra phòng trống và mức giá hiện hành với Quản lý Homestay. Em sẽ phản hồi anh/chị ngay sau khi có xác nhận.",
      riskLevel: "high",
    },
  };
}
