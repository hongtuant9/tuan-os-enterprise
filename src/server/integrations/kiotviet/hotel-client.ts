import "server-only";
import { isKiotVietDirectBookingWriteEnabled } from "@/server/ai-receptionist/config";

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

  listRoomClasses(): Promise<KiotVietRequestResult> {
    return this.request("/public/room-class");
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

    return this.request("/public/order", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Idempotency-Key": payload.idempotencyKey,
      },
    });
  }
}
