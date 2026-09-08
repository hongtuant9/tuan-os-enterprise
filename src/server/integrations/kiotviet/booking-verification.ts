export type BookingReference = { uuid?: string; code?: string };

export function extractBookingReference(data: unknown): BookingReference {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  const candidates = [root, root.data, root.result, root.booking, root.order].filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object");
  for (const item of candidates) {
    const uuid = typeof item.uuid === "string" ? item.uuid : typeof item.bookingUuid === "string" ? item.bookingUuid : undefined;
    const code = typeof item.code === "string" ? item.code : typeof item.bookingCode === "string" ? item.bookingCode : undefined;
    if (uuid || code) return { uuid, code };
  }
  return {};
}

export function bookingVerificationQuery(ref: BookingReference): string {
  if (ref.uuid) return new URLSearchParams({ uuid: ref.uuid }).toString();
  if (ref.code) return new URLSearchParams({ code: ref.code }).toString();
  throw new Error("KiotViet create response không có UUID/code để verify.");
}
