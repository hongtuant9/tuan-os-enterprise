import "server-only";

export type KiotVietFnbResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
};

type TokenCache = { value: string; expiresAt: number } | null;

const TOKEN_URL = "https://api.fnb.kiotviet.vn/identity/connect/token";
const API_BASE = "https://publicfnb.kiotapi.com";
const RETAIL_API_BASE = "https://public.kiotapi.com";

export class KiotVietFnbClient {
  private readonly clientId = process.env.KIOTVIET_FNB_CLIENT_ID || process.env.KIOTVIET_CLIENT_ID;
  private readonly clientSecret = process.env.KIOTVIET_FNB_CLIENT_SECRET || process.env.KIOTVIET_CLIENT_SECRET;
  private readonly retailer = process.env.KIOTVIET_FNB_RETAILER || process.env.KIOTVIET_RETAILER;
  private tokenCache: TokenCache = null;

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.retailer);
  }

  configState() {
    return {
      clientId: Boolean(this.clientId),
      clientSecret: Boolean(this.clientSecret),
      retailer: Boolean(this.retailer),
    };
  }

  private async token(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) return this.tokenCache.value;
    if (!this.clientId || !this.clientSecret) throw new Error("KIOTVIET FNB credentials chưa cấu hình.");
    const body = new URLSearchParams({
      scope: "PublicApi.Access.FNB",
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error("KiotViet F&B token HTTP " + res.status);
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("KiotViet F&B token thiếu access_token.");
    const ttlMs = Math.max(60, Number(data.expires_in ?? 3600) - 60) * 1000;
    this.tokenCache = { value: data.access_token, expiresAt: Date.now() + ttlMs };
    return data.access_token;
  }

  private async requestBase<T>(base: string, path: string): Promise<KiotVietFnbResult<T>> {
    if (!this.retailer) throw new Error("KIOTVIET_FNB_RETAILER chưa cấu hình.");
    const accessToken = await this.token();
    const res = await fetch(base + path, {
      headers: {
        Accept: "application/json",
        Retailer: this.retailer,
        Authorization: "Bearer " + accessToken,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data: T | null = null;
    if (text) {
      try { data = JSON.parse(text) as T; } catch { data = null; }
    }
    return { ok: res.ok, status: res.status, data };
  }

  private request<T>(path: string): Promise<KiotVietFnbResult<T>> {
    return this.requestBase<T>(API_BASE, path);
  }

  listInvoices(query = "") {
    return this.request("/invoices" + (query ? "?" + query : ""));
  }

  listBranches() {
    return this.request("/branches?pageSize=100&currentItem=0");
  }

  listProducts(query = "") {
    return this.request("/products" + (query ? "?" + query : ""));
  }

  /**
   * Read-only compatibility probe only.
   * KiotViet documents purchaseorders for Retail Public API, not F&B Public API.
   * Never infer write compatibility from docs alone; worker must see HTTP 200 first.
   */
  probeRetailPurchaseOrders() {
    return this.requestBase(RETAIL_API_BASE, "/purchaseorders?pageSize=1&currentItem=0");
  }
}
