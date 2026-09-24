export type CustomerCarePhase = "pre_service" | "in_service" | "post_service" | "general";

const PRE_SERVICE = [
  "book", "booking", "reserve", "reservation", "arrival", "arrive", "check in", "check-in",
  "đặt phòng", "đặt bàn", "đặt chỗ", "nhận phòng", "đến", "sắp tới", "trước khi đến",
  "réservation", "arrivée", "avant mon séjour",
];

const IN_SERVICE = [
  "staying", "currently at", "in my room", "during my stay", "today at the hotel",
  "đang ở", "đang lưu trú", "trong phòng", "hiện tại", "hôm nay tại", "đang dùng dịch vụ",
  "pendant mon séjour", "je suis à", "dans ma chambre",
];

const POST_SERVICE = [
  "checked out", "after my stay", "after checkout", "review", "feedback", "left the hotel",
  "đã trả phòng", "sau khi ở", "sau khi sử dụng", "đánh giá", "phản hồi sau", "đã rời",
  "après mon séjour", "après le départ", "avis",
];

function includesAny(text: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => text.includes(candidate));
}

export function inferCustomerCarePhase(
  content: string,
  explicit?: CustomerCarePhase | null,
): CustomerCarePhase {
  if (explicit && ["pre_service", "in_service", "post_service", "general"].includes(explicit)) {
    return explicit;
  }
  const normalized = content.trim().toLowerCase();
  if (!normalized) return "general";
  if (includesAny(normalized, IN_SERVICE)) return "in_service";
  if (includesAny(normalized, POST_SERVICE)) return "post_service";
  if (includesAny(normalized, PRE_SERVICE)) return "pre_service";
  return "general";
}
