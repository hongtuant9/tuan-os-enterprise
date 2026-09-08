import type { Json } from "@/lib/supabase/types";

export type EcosystemIntent = "stay" | "eat" | "experience" | "explore" | "support" | "general";

export type EcosystemRoute = {
  primaryIntent: EcosystemIntent;
  secondaryIntents: EcosystemIntent[];
  routedAgent: "AI_RECEPTIONIST" | "AI_BOOKING" | "COZY_AGENT" | "AI_CONCIERGE" | "AI_UPSELL";
  journeyEntry: "HOMESTAY" | "COZY" | "EXPERIENCE" | "EXPLORE" | "GENERAL";
  upsellOffers: string[];
};

const INTENT_PATTERNS: Array<[EcosystemIntent, RegExp]> = [
  ["experience", /(coffee experience|cooking class|lớp nấu ăn|học nấu ăn|trải nghiệm|experience|làm cà phê|make coffee)/i],
  ["eat", /(cozy|restaurant|cafe|coffee|cà phê|menu|food|đồ ăn|món|ăn tối|ăn trưa|ăn sáng|drink|smoothie|juice|fried rice|noodles|shakshuka)/i],
  ["explore", /(tour|tràng an|trang an|hang múa|mua cave|bích động|bich dong|xe đạp|bicycle|xe máy|motorbike|taxi|transfer|pickup|airport|ga ninh bình|đi đâu|lịch trình|itinerary|tham quan)/i],
  ["stay", /(lavender|ruby|homestay|phòng|đặt phòng|booking|room|stay|check[ -]?in|check[ -]?out|còn phòng|available|overnight)/i],
  ["support", /(khiếu nại|complaint|help|hỗ trợ|lost|quên đồ|sự cố|problem|issue)/i],
];

export function classifyEcosystemMessage(content: string): EcosystemRoute {
  const intents = INTENT_PATTERNS.filter(([, pattern]) => pattern.test(content)).map(([intent]) => intent);
  const primaryIntent = intents[0] ?? "general";
  const secondaryIntents = [...new Set(intents.slice(1))];

  const routedAgent = primaryIntent === "stay"
    ? "AI_BOOKING"
    : primaryIntent === "eat"
      ? "COZY_AGENT"
      : primaryIntent === "experience" || primaryIntent === "explore"
        ? "AI_CONCIERGE"
        : "AI_RECEPTIONIST";

  const journeyEntry = primaryIntent === "stay"
    ? "HOMESTAY"
    : primaryIntent === "eat"
      ? "COZY"
      : primaryIntent === "experience"
        ? "EXPERIENCE"
        : primaryIntent === "explore"
          ? "EXPLORE"
          : "GENERAL";

  const upsellOffers = primaryIntent === "stay"
    ? ["BREAKFAST", "COZY_GARDEN"]
    : primaryIntent === "eat"
      ? ["STAY_NEARBY", "LOCAL_PLAN"]
      : primaryIntent === "experience"
        ? ["COZY_GARDEN", "STAY_NEARBY"]
        : primaryIntent === "explore"
          ? ["COZY_GARDEN", "STAY_NEARBY"]
          : [];

  return { primaryIntent, secondaryIntents, routedAgent, journeyEntry, upsellOffers };
}

const VERIFIED_COZY_ITEMS = [
  ["Coconut Coffee", "45.000 VND"],
  ["Egg Coffee", "45.000 VND"],
  ["Salt Coffee", "45.000 VND"],
  ["Beef Fried Noodles", "60.000 VND"],
  ["Chicken Fried Rice", "55.000 VND"],
  ["Tofu in Tomato Sauce", "65.000 VND"],
] as const;

export function buildEcosystemSafeReply(content: string, route: EcosystemRoute): string | null {
  if (route.primaryIntent === "eat") {
    const asksMenu = /(menu|món|food|ăn gì|what.*eat|coffee|cà phê|drink|đồ uống|giá|price)/i.test(content);
    if (asksMenu) {
      const items = VERIFIED_COZY_ITEMS.map(([name, price]) => `${name} ${price}`).join("; " );
      return `Cozy Garden có các món/đồ uống đã được xác minh như: ${items}. Em có thể gợi ý theo nhu cầu đồ uống, món chính hoặc món chay đã được xác minh. Nếu anh/chị cũng cần chỗ ở gần Tam Cốc hoặc lịch trình tham quan, em có thể hỗ trợ tiếp.`;
    }
    return "Em có thể hỗ trợ Cozy Garden về món ăn, đồ uống và thông tin đã được xác minh. Nếu anh/chị đang lên kế hoạch cho cả chuyến đi, em cũng có thể hỗ trợ chỗ ở và lịch trình Tam Cốc phù hợp.";
  }

  if (route.primaryIntent === "experience") {
    return "Tam Coc Experience có nhóm trải nghiệm tại Cozy Garden như Coffee Experience và Cooking Class, nhưng giá, thời lượng và sức chứa hiện chưa được xác minh đầy đủ để AI tự cam kết. Em có thể tư vấn hướng lựa chọn và chuyển yêu cầu cụ thể để quản lý xác nhận. Sau trải nghiệm, em cũng có thể gợi ý bữa ăn tại Cozy Garden hoặc chỗ ở gần đó.";
  }

  if (route.primaryIntent === "explore") {
    return "Em có thể hỗ trợ lên kế hoạch tham quan Tam Cốc, Tràng An, Hang Múa và các nhu cầu di chuyển. Giá tour/xe/transfer chỉ được báo khi nguồn dịch vụ đã được xác minh. Em có thể trước hết giúp anh/chị xây lịch trình phù hợp số ngày, điểm muốn đi và nơi đang lưu trú.";
  }

  return null;
}


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

function detectLanguage(content: string): "vi" | "en" {
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(content)) return "vi";
  if (/\b(hello|hi|room|booking|stay|check[ -]?in|check[ -]?out|breakfast|guest|people|price|available)\b/i.test(content)) return "en";
  return "vi";
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
  const route = classifyEcosystemMessage(trimmed);
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
    language: detectLanguage(trimmed),
    primary_intent: route.primaryIntent,
    secondary_intents: route.secondaryIntents,
    routed_agent: route.routedAgent,
    journey_entry: route.journeyEntry,
    upsell_offers: route.upsellOffers,
  };

  const evidence = {
    engine: "PRIVATE_PILOT_RULE_ENGINE_V2_ECOSYSTEM",
    source: "guest_direct_message",
    evaluated_at: new Date().toISOString(),
  } satisfies Record<string, Json>;

  const asksCheckIn = /(check[ -]?in|nhận phòng)/i.test(trimmed);
  const asksCheckOut = /(check[ -]?out|trả phòng)/i.test(trimmed);
  const asksBreakfast = /(breakfast|bữa sáng|ăn sáng)/i.test(trimmed);
  if ((asksCheckIn || asksCheckOut || asksBreakfast) && metadataPatch.property_hint !== "Lavender Homestay") {
    return {
      reply: metadataPatch.property_hint === "Ruby Homestay"
        ? "Thông tin này hiện mới được xác nhận cho Lavender Homestay. Em chuyển Quản lý xác nhận chính sách áp dụng cho Ruby trước khi trả lời chính thức."
        : "Anh/chị đang hỏi chính sách của Lavender Homestay hay Ruby Homestay ạ?",
      conversationStatus: metadataPatch.property_hint === "Ruby Homestay" ? "needs_manager" : "waiting_guest",
      metadataPatch, evidence,
    };
  }
  if (asksCheckIn || asksCheckOut) {
    const parts: string[] = [];
    if (asksCheckIn) parts.push("Giờ nhận phòng chuẩn của Lavender Homestay là từ 14:00");
    if (asksCheckOut) parts.push("giờ trả phòng là trước 11:30");
    return {
      reply: `${parts.join(", ")}. Đây là thông tin đã được xác nhận trong Master Data.`,
      conversationStatus: "active", metadataPatch, evidence,
    };
  }

  if (asksBreakfast) {
    return {
      reply: "Bữa sáng phục vụ 07:00–09:30 và cần đặt trước 21:00 ngày hôm trước. Agoda/Booking.com là Room Only; Expedia/Airbnb/Tripadvisor gồm bữa sáng. Nếu đặt ngoài gói, giá tại khu vực chung là 75.000 VND/người. Các lựa chọn khác chỉ được xác nhận khi đã được duyệt.",
      conversationStatus: "active", metadataPatch, evidence,
    };
  }

  const ecosystemReply = buildEcosystemSafeReply(trimmed, route);
  const needsSpecificServiceVerification =
    (route.primaryIntent === "experience" || route.primaryIntent === "explore") &&
    /(giá|price|bao lâu|duration|sức chứa|capacity|đặt|book|booking|thuê|rent|có .* không|bán|offer|provide|available)/i.test(trimmed);
  const asksCozyPromotion = route.primaryIntent === "eat" &&
    /(voucher|discount|ưu đãi|khuyến mại|giảm|trong khuôn viên|ở đâu|vị trí)/i.test(trimmed);

  if (ecosystemReply && !needsSpecificServiceVerification && !asksCozyPromotion) {
    return {
      reply: ecosystemReply,
      conversationStatus: "active",
      metadataPatch,
      evidence: { ...evidence, routing: route as unknown as Json, cross_sell_rule_source: "11_CROSS_SELL_AI" },
    };
  }

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

  const bookingIntent = /(phòng|đặt|booking|room|stay|cuối tuần|homestay|giá|price|available|còn phòng)/i.test(trimmed);
  if (!bookingIntent) {
    return {
      reply:
        "Em là AI của Tam Coc Experience. Em có thể hỗ trợ chỗ ở Lavender/Ruby, Cozy Garden, món ăn/đồ uống, trải nghiệm, lịch trình Tam Cốc, tour/di chuyển và các dịch vụ đã được xác minh. Anh/chị đang cần hỗ trợ nội dung nào ạ?",
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
