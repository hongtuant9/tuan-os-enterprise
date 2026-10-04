import type { Json } from "@/lib/supabase/types";
import { detectGuestLanguage } from "./language";

export type EcosystemIntent = "stay" | "eat" | "experience" | "explore" | "support" | "general";

export type EcosystemRoute = {
  primaryIntent: EcosystemIntent;
  secondaryIntents: EcosystemIntent[];
  routedAgent: "AI_RECEPTIONIST" | "AI_BOOKING" | "COZY_AGENT" | "AI_CONCIERGE" | "AI_UPSELL";
  journeyEntry: "HOMESTAY" | "COZY" | "EXPERIENCE" | "EXPLORE" | "GENERAL";
  upsellOffers: string[];
};

const INTENT_PATTERNS: Array<[EcosystemIntent, RegExp]> = [
  ["experience", /(coffee experience|cooking class|lớp nấu ăn|học nấu ăn|trải nghiệm|experience|expérience|experiencia|erlebnis|esperienza|experiência|làm cà phê|make coffee)/i],
  ["eat", /(cozy|restaurant|restaurante|ristorante|cafe|café|coffee|cà phê|menu|food|repas|comida|essen|cibo|đồ ăn|món|ăn tối|ăn trưa|ăn sáng|drink|boisson|bebida|smoothie|juice|fried rice|noodles|shakshuka)/i],
  ["explore", /(tour|excursion|ausflug|passeio|tràng an|trang an|hang múa|mua cave|bích động|bich dong|xe đạp|bicycle|vélo|bicicleta|fahrrad|fiets|xe máy|motorbike|scooter|taxi|transfer|pickup|airport|aéroport|aeropuerto|flughafen|aeroporto|ga ninh bình|đi đâu|lịch trình|itinerary|itinéraire|tham quan)/i],
  ["stay", /(lavender|ruby|homestay|phòng|đặt phòng|booking|reservation|réservation|reserva|buchung|prenotazione|room|chambre|habitación|zimmer|camera|quarto|kamer|stay|séjour|estancia|aufenthalt|soggiorno|check[ -]?in|check[ -]?out|còn phòng|available|disponible|verfügbar|disponibile|overnight)/i],
  ["support", /(khiếu nại|complaint|réclamation|queja|beschwerde|reclamo|help|aide|ayuda|hilfe|hỗ trợ|lost|perdu|perdido|quên đồ|sự cố|problem|problème|problema|issue)/i],
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

export function buildEcosystemSafeReply(_content: string, route: EcosystemRoute): string | null {
  if (route.primaryIntent === "eat") {
    return "Em có thể giúp anh/chị chọn món hoặc đồ uống phù hợp. Em sẽ chỉ báo thông tin cụ thể khi dữ liệu hiện hành đã được xác nhận.";
  }
  if (route.primaryIntent === "experience") {
    return "Em có thể giúp anh/chị chọn trải nghiệm phù hợp và kiểm tra các thông tin cần thiết trước khi xác nhận.";
  }
  if (route.primaryIntent === "explore") {
    return "Em có thể giúp anh/chị lên kế hoạch tham quan và di chuyển dựa trên thời gian, điểm muốn đi và nơi đang lưu trú.";
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

function detectLanguage(content: string): string {
  return detectGuestLanguage(content).code;
}

function detectProperty(content: string): string | null {
  if (/lavender/i.test(content)) return "Lavender Homestay";
  if (/ruby/i.test(content)) return "Ruby Homestay";
  return null;
}

type RecruitmentField =
  | "position"
  | "full_name"
  | "phone"
  | "location"
  | "experience"
  | "start_date"
  | "shift_availability"
  | "english_level"
  | "interview_preference";

function recruitmentIntent(content: string, existingMetadata: Record<string, Json>): boolean {
  if (existingMetadata.recruitment_active === true) return true;
  if (/(ứng tuyển|ứng viên|tuyển dụng|xin việc|tìm việc|việc làm|apply|application|job|phỏng vấn xin việc|job interview)/i.test(content)) return true;
  return /(vị trí|công việc|tuyển).{0,30}(bar|phục vụ|bếp|pha chế)|(bar|phục vụ|bếp|pha chế).{0,30}(vị trí|công việc|tuyển)/i.test(content);
}

function recruitmentPosition(content: string): "BAR ĐA NĂNG / PHỤC VỤ" | "BẾP" | null {
  if (/(nhân viên bếp|làm bếp|phụ bếp|đầu bếp|kitchen|cook)/i.test(content)) return "BẾP";
  if (/(bar|phục vụ|pha chế|waiter|waitress|server|bartender)/i.test(content)) return "BAR ĐA NĂNG / PHỤC VỤ";
  return null;
}

function recruitmentQuestion(field: RecruitmentField, position: string | null): string {
  switch (field) {
    case "position":
      return "Bạn muốn ứng tuyển vị trí Bar đa năng/Phục vụ hay Nhân viên Bếp?";
    case "full_name":
      return "Bạn cho mình xin họ và tên nhé.";
    case "phone":
      return "Bạn cho mình xin số điện thoại để bộ phận tuyển dụng liên hệ nhé.";
    case "location":
      return "Hiện bạn đang ở khu vực nào?";
    case "experience":
      return position === "BẾP"
        ? "Bạn đã có kinh nghiệm bếp/phụ bếp chưa? Nếu có, bạn mô tả ngắn giúp mình nhé."
        : "Bạn đã có kinh nghiệm Bar/Phục vụ/Pha chế chưa? Nếu có, bạn mô tả ngắn giúp mình nhé.";
    case "start_date":
      return "Bạn có thể bắt đầu đi làm từ khi nào?";
    case "shift_availability":
      return "Bạn có thể làm ca nào hoặc khung giờ nào trong ngày?";
    case "english_level":
      return "Khả năng giao tiếp tiếng Anh cơ bản của bạn hiện ở mức nào: chưa có / cơ bản / khá?";
    case "interview_preference":
      return "Trong 24 giờ tới, bạn thuận tiện gọi điện hoặc phỏng vấn vào khung giờ nào?";
  }
}

function normalizedAnswer(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 500);
}

function decideRecruitmentMessage(
  content: string,
  existingMetadata: Record<string, Json>,
  customerName?: string,
  customerContact?: string
): PilotDecision {
  const trimmed = content.trim();
  const currentPosition = recruitmentPosition(trimmed)
    ?? (typeof existingMetadata.recruitment_position === "string" ? existingMetadata.recruitment_position : null);
  const expectedField = typeof existingMetadata.recruitment_next_field === "string"
    ? existingMetadata.recruitment_next_field as RecruitmentField
    : null;

  const patch: Record<string, Json> = {
    recruitment_active: true,
    primary_intent: "recruitment",
    routed_agent: "AI_RECEPTIONIST",
    journey_entry: "COZY",
    recruitment_source: existingMetadata.recruitment_source ?? "facebook_messenger",
    recruitment_status: "COLLECTING",
    last_guest_message: trimmed,
    language: detectLanguage(trimmed),
    recruitment_position: currentPosition,
    recruitment_full_name:
      customerName
      ?? (typeof existingMetadata.recruitment_full_name === "string" ? existingMetadata.recruitment_full_name : null),
    recruitment_phone:
      customerContact
      ?? normalizePhone(trimmed)
      ?? (typeof existingMetadata.recruitment_phone === "string" ? existingMetadata.recruitment_phone : null),
    recruitment_location:
      typeof existingMetadata.recruitment_location === "string" ? existingMetadata.recruitment_location : null,
    recruitment_experience:
      typeof existingMetadata.recruitment_experience === "string" ? existingMetadata.recruitment_experience : null,
    recruitment_start_date:
      typeof existingMetadata.recruitment_start_date === "string" ? existingMetadata.recruitment_start_date : null,
    recruitment_shift_availability:
      typeof existingMetadata.recruitment_shift_availability === "string" ? existingMetadata.recruitment_shift_availability : null,
    recruitment_english_level:
      typeof existingMetadata.recruitment_english_level === "string" ? existingMetadata.recruitment_english_level : null,
    recruitment_interview_preference:
      typeof existingMetadata.recruitment_interview_preference === "string" ? existingMetadata.recruitment_interview_preference : null,
  };

  if (expectedField) {
    const answer = normalizedAnswer(trimmed);
    if (expectedField === "position") patch.recruitment_position = recruitmentPosition(trimmed) ?? answer;
    if (expectedField === "full_name") patch.recruitment_full_name = answer;
    if (expectedField === "phone") patch.recruitment_phone = normalizePhone(trimmed) ?? answer;
    if (expectedField === "location") patch.recruitment_location = answer;
    if (expectedField === "experience") patch.recruitment_experience = answer;
    if (expectedField === "start_date") patch.recruitment_start_date = answer;
    if (expectedField === "shift_availability") patch.recruitment_shift_availability = answer;
    if (expectedField === "english_level") patch.recruitment_english_level = answer;
    if (expectedField === "interview_preference") patch.recruitment_interview_preference = answer;
  }

  if (!patch.recruitment_position) {
    patch.recruitment_next_field = "position";
    return {
      reply: recruitmentQuestion("position", null),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (!patch.recruitment_full_name) {
    patch.recruitment_next_field = "full_name";
    return {
      reply: recruitmentQuestion("full_name", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (!patch.recruitment_phone) {
    patch.recruitment_next_field = "phone";
    return {
      reply: recruitmentQuestion("phone", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (!patch.recruitment_location) {
    patch.recruitment_next_field = "location";
    return {
      reply: recruitmentQuestion("location", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (!patch.recruitment_experience) {
    patch.recruitment_next_field = "experience";
    return {
      reply: recruitmentQuestion("experience", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (!patch.recruitment_start_date) {
    patch.recruitment_next_field = "start_date";
    return {
      reply: recruitmentQuestion("start_date", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (!patch.recruitment_shift_availability) {
    patch.recruitment_next_field = "shift_availability";
    return {
      reply: recruitmentQuestion("shift_availability", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (
    patch.recruitment_position === "BAR ĐA NĂNG / PHỤC VỤ"
    && !patch.recruitment_english_level
  ) {
    patch.recruitment_next_field = "english_level";
    return {
      reply: recruitmentQuestion("english_level", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }
  if (!patch.recruitment_interview_preference) {
    patch.recruitment_next_field = "interview_preference";
    return {
      reply: recruitmentQuestion("interview_preference", String(patch.recruitment_position)),
      conversationStatus: "waiting_guest",
      metadataPatch: patch,
      evidence: { engine: "RECRUITMENT_INTAKE_V1", source: "candidate_direct_message", evaluated_at: new Date().toISOString() },
    };
  }

  patch.recruitment_next_field = null;
  patch.recruitment_status = "READY_FOR_INTERVIEW_REVIEW";
  patch.recruitment_completed_at = new Date().toISOString();

  return {
    reply:
      "Cảm ơn bạn, mình đã ghi nhận đủ thông tin và khung giờ phỏng vấn/gọi điện bạn mong muốn. Bộ phận tuyển dụng Cozy Garden sẽ liên hệ theo thông tin này. Đây chưa phải xác nhận nhận việc nhé.",
    conversationStatus: "needs_manager",
    metadataPatch: patch,
    evidence: {
      engine: "RECRUITMENT_INTAKE_V1",
      source: "candidate_direct_message",
      evaluated_at: new Date().toISOString(),
      auto_hire_decision: false,
    },
    review: {
      reviewType: "service_request",
      title: "Ứng viên Cozy Garden đã đủ thông tin để phỏng vấn",
      reason: "Ứng viên đã cung cấp đủ bộ thông tin cơ bản và khung giờ phỏng vấn/gọi điện mong muốn.",
      missingFields: [],
      recommendation: "Đối chiếu tiêu chí tuyển dụng hiện hành, xác nhận lịch phỏng vấn và liên hệ ứng viên trong 24 giờ.",
      proposedReply:
        "Cảm ơn bạn, Cozy Garden đã ghi nhận hồ sơ và sẽ liên hệ để xác nhận lịch phỏng vấn.",
      riskLevel: "low",
    },
  };
}

export function decidePilotMessage(
  content: string,
  existingMetadata: Record<string, Json>,
  customerName?: string,
  customerContact?: string
): PilotDecision {
  const trimmed = content.trim();
  if (recruitmentIntent(trimmed, existingMetadata)) {
    return decideRecruitmentMessage(trimmed, existingMetadata, customerName, customerContact);
  }
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

  const asksCheckIn = /(check[ -]?in|nhận phòng|arrivée|entrada|ankunft|arrivo|chegada|aankomst)/i.test(trimmed);
  const asksCheckOut = /(check[ -]?out|trả phòng|départ|salida|abreise|partenza|saída|vertrek)/i.test(trimmed);
  const asksBreakfast = /(breakfast|bữa sáng|ăn sáng|petit.?déjeuner|desayuno|frühstück|colazione|café da manhã|ontbijt)/i.test(trimmed);
  if (asksCheckIn || asksCheckOut || asksBreakfast) {
    return {
      reply: "Em sẽ kiểm tra thông tin hiện hành và trả lời ngắn gọn theo đúng chính sách đang áp dụng.",
      conversationStatus: "active",
      metadataPatch,
      evidence: { ...evidence, knowledge_required: true },
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
        "Để mình kiểm tra lại thông tin này cho chắc trước khi xác nhận với anh/chị nhé.",
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
          "Mình đang kiểm tra lại thông tin này và sẽ phản hồi ngay khi có xác nhận.",
        riskLevel: matchedGap.reviewType === "policy_exception" ? "high" : "medium",
      },
    };
  }

  const bookingIntent = /(phòng|đặt|booking|reservation|réservation|reserva|buchung|prenotazione|room|chambre|habitación|zimmer|camera|quarto|kamer|stay|séjour|estancia|aufenthalt|soggiorno|cuối tuần|homestay|giá|price|prix|precio|preis|prezzo|preço|prijs|available|disponible|verfügbar|disponibile|còn phòng)/i.test(trimmed);
  if (!bookingIntent) {
    return {
      reply:
        "Mình có thể hỗ trợ về chỗ ở, ăn uống, trải nghiệm và kế hoạch tham quan ở Tam Cốc. Anh/chị đang cần mình hỗ trợ phần nào trước?",
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
      reply: `Để mình kiểm tra tiếp, anh/chị cho mình xin ${missing[0]} nhé.`,
      conversationStatus: "waiting_guest",
      metadataPatch,
      evidence,
    };
  }

  return {
    reply:
      "Mình đã có đủ thông tin cơ bản. Cho mình kiểm tra phòng và mức giá hiện hành trước khi xác nhận với anh/chị nhé.",
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
        "Mình đang kiểm tra phòng trống và mức giá hiện hành, rồi sẽ xác nhận lại ngay với anh/chị.",
      riskLevel: "high",
    },
  };
}
