import "server-only";

export type KiotVietRetailFinanceResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
};

type TokenCache = { value: string; expiresAt: number } | null;

const TOKEN_URL = "https://id.kiotviet.vn/connect/token";
const API_BASE = "https://public.kiotapi.com";

export type KiotVietFinanceProfile = "fnb" | "hotel";

export class KiotVietRetailFinanceClient {
  private tokenCache: TokenCache = null;
  private readonly profile: KiotVietFinanceProfile;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly retailer: string | undefined;

  constructor(profile: KiotVietFinanceProfile) {
    this.profile = profile;
    if (profile === "fnb") {
      this.clientId =
        process.env.KIOTVIET_FNB_FINANCE_CLIENT_ID ||
        process.env.KIOTVIET_CLIENT_ID;
      this.clientSecret =
        process.env.KIOTVIET_FNB_FINANCE_CLIENT_SECRET ||
        process.env.KIOTVIET_CLIENT_SECRET;
      this.retailer =
        process.env.KIOTVIET_FNB_FINANCE_RETAILER ||
        process.env.KIOTVIET_RETAILER;
    } else {
      this.clientId = process.env.KIOTVIET_HOTEL_FINANCE_CLIENT_ID;
      this.clientSecret = process.env.KIOTVIET_HOTEL_FINANCE_CLIENT_SECRET;
      this.retailer = process.env.KIOTVIET_HOTEL_FINANCE_RETAILER;
    }
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.retailer);
  }

  configState() {
    return {
      profile: this.profile,
      clientId: Boolean(this.clientId),
      clientSecret: Boolean(this.clientSecret),
      retailer: Boolean(this.retailer),
    };
  }

  private async token() {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.value;
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error("KiotViet finance Retail credentials chưa cấu hình.");
    }
    const body = new URLSearchParams({
      scope: "PublicApi.Access",
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error("KiotViet Retail finance token HTTP " + response.status);
    }
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new Error("KiotViet Retail finance token thiếu access_token.");
    }
    const ttlMs = Math.max(60, Number(payload.expires_in ?? 3600) - 60) * 1000;
    this.tokenCache = {
      value: payload.access_token,
      expiresAt: Date.now() + ttlMs,
    };
    return payload.access_token;
  }

  private async request<T>(path: string): Promise<KiotVietRetailFinanceResult<T>> {
    if (!this.retailer) {
      throw new Error("KiotViet Retail finance retailer chưa cấu hình.");
    }
    const accessToken = await this.token();
    const response = await fetch(API_BASE + path, {
      headers: {
        Accept: "application/json",
        Retailer: this.retailer,
        Authorization: "Bearer " + accessToken,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await response.text();
    let data: T | null = null;
    if (raw) {
      try {
        data = JSON.parse(raw) as T;
      } catch {
        data = null;
      }
    }
    return { ok: response.ok, status: response.status, data };
  }

  listCashflow(query = "") {
    return this.request("/cashflow" + (query ? "?" + query : ""));
  }

  listPurchaseOrders(query = "") {
    return this.request("/purchaseorders" + (query ? "?" + query : ""));
  }

  listBranches() {
    return this.request("/branches?pageSize=100&currentItem=0");
  }
}
