import "server-only";

import type { Auth } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

const DEFAULT_API_VERSION = "v25";

export class GoogleAdsApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(status: number, message: string, requestId?: string) {
    super(message);
    this.name = "GoogleAdsApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

function normalizeCustomerId(value: string): string {
  const normalized = value.replace(/\D/g, "");
  if (!/^\d{10}$/.test(normalized)) {
    throw new Error("Google Ads customer ID phải có đúng 10 chữ số.");
  }
  return normalized;
}

function apiVersion(): string {
  return process.env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_API_VERSION;
}
function isWriteEnabled(): boolean {
  return (process.env.GOOGLE_ADS_WRITE_ENABLED ?? "false").toLowerCase() === "true";
}

export type GoogleAdsSearchResponse = {
  results?: Array<Record<string, unknown>>;
  nextPageToken?: string;
  totalResultsCount?: string;
};

type MutationOperation = Record<string, unknown>;

export class GoogleAdsClient {
  constructor(private readonly auth: Auth.OAuth2Client) {}

  private async headers(): Promise<Record<string, string>> {
    const token = await this.auth.getAccessToken();
    if (!token.token) throw new Error("Không lấy được Google OAuth access token.");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    };

    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
    return headers;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(
      `https://googleads.googleapis.com/${apiVersion()}/${path.replace(/^\//, "")}`,
      {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );

    const requestId = response.headers.get("request-id") ?? undefined;
    if (!response.ok) {
      let message = `Google Ads API HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as {
          error?: { message?: string; status?: string };
        };
        if (payload.error?.status || payload.error?.message) {
          message += `: ${payload.error.status ?? "ERROR"}${payload.error.message ? ` — ${payload.error.message}` : ""}`;
        }
      } catch {
        // Không log raw body để tránh lộ dữ liệu ngoài dự kiến.
      }
      throw new GoogleAdsApiError(response.status, message, requestId);
    }
    return (await response.json()) as T;
  }

  async search(customerId: string, query: string): Promise<GoogleAdsSearchResponse> {
    const cid = normalizeCustomerId(customerId);
    if (!query.trim()) throw new Error("GAQL query không được để trống.");
    return this.request<GoogleAdsSearchResponse>(
      `customers/${cid}/googleAds:search`,
      { query }
    );
  }

  private async mutate(
    customerId: string,
    resource: "campaignBudgets" | "adGroupCriteria" | "campaignCriteria" | "conversionActions",
    operations: MutationOperation[]
  ): Promise<Record<string, unknown>> {
    if (!isWriteEnabled()) {
      throw new Error("Google Ads write đang khóa. Cần Approval Gate và GOOGLE_ADS_WRITE_ENABLED=true.");
    }
    if (operations.length === 0) throw new Error("Mutation cần ít nhất một operation.");
    const cid = normalizeCustomerId(customerId);
    return this.request<Record<string, unknown>>(
      `customers/${cid}/${resource}:mutate`,
      { operations, partialFailure: false, validateOnly: false }
    );
  }

  mutateCampaignBudgets(customerId: string, operations: MutationOperation[]) {
    return this.mutate(customerId, "campaignBudgets", operations);
  }

  mutateAdGroupCriteria(customerId: string, operations: MutationOperation[]) {
    return this.mutate(customerId, "adGroupCriteria", operations);
  }

  mutateCampaignCriteria(customerId: string, operations: MutationOperation[]) {
    return this.mutate(customerId, "campaignCriteria", operations);
  }

  mutateConversionActions(customerId: string, operations: MutationOperation[]) {
    return this.mutate(customerId, "conversionActions", operations);
  }
}

export async function getSystemGoogleAdsClient(): Promise<GoogleAdsClient> {
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
  return new GoogleAdsClient(auth);
}
