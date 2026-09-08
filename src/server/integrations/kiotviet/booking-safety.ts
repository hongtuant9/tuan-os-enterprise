export type AvailabilityGuard = {
  branchId: number;
  roomClassId: string;
  checkIn: string;
  checkOut: string;
  roomCount: number;
};

export type AvailabilityEvidence = {
  branchId: number;
  roomClassId: string;
  available: number;
  required: number;
};

export function validateAvailabilityGuard(guard: AvailabilityGuard): void {
  if (!guard.branchId || !guard.roomClassId || !guard.checkIn || !guard.checkOut || guard.roomCount < 1) {
    throw new Error("Thiếu dữ liệu để kiểm tra availability lần 2 trước khi tạo booking.");
  }
  if (guard.checkOut <= guard.checkIn) {
    throw new Error("Ngày trả phòng phải sau ngày nhận phòng.");
  }
}

export function assertAvailabilityStillAvailable(
  data: unknown,
  guard: AvailabilityGuard
): AvailabilityEvidence {
  validateAvailabilityGuard(guard);
  const payload = data as { result?: { data?: Array<Record<string, unknown>> } } | null;
  const rooms = payload?.result?.data ?? [];
  const matched = rooms.find((room) =>
    Number(room.branchId) === guard.branchId && String(room.id ?? "") === guard.roomClassId
  );
  const available = Number(matched?.totalAvailableRoom ?? 0);
  if (!matched || available < guard.roomCount) {
    throw new Error("Availability lần 2 không còn đủ phòng. Booking không được tạo.");
  }
  return {
    branchId: guard.branchId,
    roomClassId: guard.roomClassId,
    available,
    required: guard.roomCount,
  };
}

export function sanitizeDirectBookingPayload<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const sanitized = { ...payload };
  delete sanitized.conversationId;
  delete sanitized.idempotencyKey;
  delete sanitized.availabilityGuard;
  return sanitized;
}
