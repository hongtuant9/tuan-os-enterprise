import "server-only";
import { isKiotVietDirectBookingWriteEnabled } from "@/server/ai-receptionist/config";
import { assertAvailabilityStillAvailable, sanitizeDirectBookingPayload, validateAvailabilityGuard, type AvailabilityGuard } from "./booking-safety";
import { bookingVerificationQuery, extractBookingReference } from "./booking-verification";

export type KiotVietRequestResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  requestId: string | null;
};

export type SafeDirectBookingPayload = Record<string, unknown> & {
  conversationId: string;
  idempotencyKey: string;
  note: string;
  availabilityGuard: AvailabilityGuard;
};

const DEFAULT_BASE_URL = "https://api-integration-hotel.kiotviet.vn";
export class KiotVietHotelClient {
  private readonly baseUrl = (process.env.KIOTVIET_HOTEL_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  private readonly publicApiKey = process.env.KIOTVIET_HOTEL_PUBLIC_API_KEY;

  isConfigured(): boolean {
    return Boolean(this.publicApiKey);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<KiotVietRequestResult<T>> {
    if (!this.publicApiKey) {
      throw new Error("KIOTVIET_HOTEL_PUBLIC_API_KEY chưa được cấu hình.");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        PublicApiKey: this.publicApiKey,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const requestId = response.headers.get("x-request-id");
    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    return { ok: response.ok, status: response.status, data, requestId };
  }

  listBranches(): Promise<KiotVietRequestResult> {
    return this.request("/public/branches");
  }

  listRoomClasses(query = ""): Promise<KiotVietRequestResult> {
    return this.request(`/public/room-class${query ? `?${query}` : ""}`);
  }

  listOrders(query = ""): Promise<KiotVietRequestResult> {
    return this.request(`/public/order/list${query ? `?${query}` : ""}`);
  }

  getOrder(query: string): Promise<KiotVietRequestResult> {
    return this.request(`/public/order?${query}`);
  }

  listSaleChannels(): Promise<KiotVietRequestResult> {
    return this.request("/public/sale-channels");
  }

  private async assertSecondAvailability(guard: AvailabilityGuard): Promise<KiotVietRequestResult> {
    validateAvailabilityGuard(guard);
    const query = new URLSearchParams({
      startDate: guard.checkIn,
      endDate: guard.checkOut,
      pageSize: "100",
      pageIndex: "1",
    }).toString();
    const result = await this.listRoomClasses(query);
    if (!result.ok) {
      throw new Error(`KiotViet availability lần 2 thất bại HTTP ${result.status}. Booking không được tạo.`);
    }
    assertAvailabilityStillAvailable(result.data, guard);
    return result;
  }

  async verifyCreatedDirectBooking(created: unknown): Promise<{ ok: boolean; bookingUuid?: string; bookingCode?: string; evidence: Record<string, unknown> }> {
    const ref = extractBookingReference(created);
    const result = await this.getOrder(bookingVerificationQuery(ref));
    if (!result.ok) return { ok: false, evidence: { http_status: result.status, request_id: result.requestId } };
    const verifiedRef = extractBookingReference(result.data);
    const bookingUuid = verifiedRef.uuid ?? ref.uuid;
    const bookingCode = verifiedRef.code ?? ref.code;
    return { ok: Boolean(bookingUuid || bookingCode), bookingUuid, bookingCode, evidence: { http_status: result.status, request_id: result.requestId, source: "GET_ORDER" } };
  }

  async createSafeDirectBooking(payload: SafeDirectBookingPayload): Promise<KiotVietRequestResult> {
    if (!isKiotVietDirectBookingWriteEnabled()) {
      throw new Error("KiotViet write đang khóa. Chỉ mở sau khi Private Pilot được nghiệm thu.");
    }
    if (!payload.conversationId || !payload.idempotencyKey) {
      throw new Error("Booking AI phải có conversationId và idempotencyKey.");
    }
    if (!payload.note.includes("AI")) {
      throw new Error("Booking AI phải có ghi chú nhận diện nguồn tạo.");
    }

    await this.assertSecondAvailability(payload.availabilityGuard);

    const kiotVietPayload = sanitizeDirectBookingPayload(payload);
    return this.request("/public/order", {
      method: "POST",
      body: JSON.stringify(kiotVietPayload),
      headers: {
        "Idempotency-Key": payload.idempotencyKey,
      },
    });
  }
}
