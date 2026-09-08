import { createHash } from "node:crypto";

export type BookingDraftStatus =
  | "draft"
  | "checking"
  | "creating"
  | "created"
  | "verified"
  | "failed_safe"
  | "cancelled";

export type BookingDraftInput = {
  conversationId: string;
  propertyId?: string | null;
  guestName: string;
  guestContact?: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  roomCount: number;
  roomClassId: string;
  roomClassName: string;
  quotedPrice?: number | null;
  priceSource?: string | null;
};
export function validateBookingDraftInput(input: BookingDraftInput): void {
  if (!input.conversationId || !input.guestName.trim()) {
    throw new Error("Booking draft thiếu conversation hoặc tên khách.");
  }
  if (!input.checkIn || !input.checkOut || input.checkOut <= input.checkIn) {
    throw new Error("Ngày nhận/trả phòng không hợp lệ.");
  }
  if (input.adults < 1 || input.roomCount < 1) {
    throw new Error("Số khách hoặc số phòng không hợp lệ.");
  }
  if (!input.roomClassId || !input.roomClassName.trim()) {
    throw new Error("Phải chọn hạng phòng trước khi chuẩn bị booking.");
  }
  if (input.quotedPrice != null) {
    if (input.quotedPrice <= 0 || !input.priceSource?.trim()) {
      throw new Error("Giá chỉ được lưu khi có nguồn giá VERIFIED.");
    }
  }
}

export function makeBookingIdempotencyKey(input: BookingDraftInput): string {
  validateBookingDraftInput(input);
  const identity = [input.conversationId, input.checkIn, input.checkOut,
    input.roomClassId, input.roomCount, input.guestContact ?? input.guestName]
    .join("|").toLowerCase();
  return `ai-booking-${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}
const ALLOWED_TRANSITIONS: Record<BookingDraftStatus, BookingDraftStatus[]> = {
  draft: ["checking", "cancelled", "failed_safe"],
  checking: ["creating", "failed_safe", "cancelled"],
  creating: ["created", "failed_safe"],
  created: ["verified", "failed_safe"],
  verified: [],
  failed_safe: [],
  cancelled: [],
};

export function assertBookingTransition(from: BookingDraftStatus, to: BookingDraftStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Booking transition không hợp lệ: ${from} -> ${to}.`);
  }
}

export function canDraftConfirmation(status: BookingDraftStatus, verificationStatus: string): boolean {
  return status === "verified" && verificationStatus === "verified";
}

export function failureSafePatch(reason: string, evidence: Record<string, unknown> = {}) {
  return {
    status: "failed_safe" as const,
    verification_status: "failed" as const,
    verification_evidence: { reason, ...evidence },
  };
}
