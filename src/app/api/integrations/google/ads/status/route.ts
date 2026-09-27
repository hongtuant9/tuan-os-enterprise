import { NextResponse } from "next/server";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import {
  getSystemGoogleAdsClient,
  GoogleAdsApiError,
} from "@/server/integrations/google/ads-client";

function configuredCustomerId(): string | null {
  const value = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/\D/g, "");
  return value && /^\d{10}$/.test(value) ? value : null;
}

export async function GET() {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(session.role, "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const customerId = configuredCustomerId();
  if (!customerId) {
    return NextResponse.json({
      configured: false,
      connected: false,
      reason: "GOOGLE_ADS_CUSTOMER_ID chưa được cấu hình.",
    });
  }

  try {
    const client = await getSystemGoogleAdsClient();
    const result = await client.search(
      customerId,
      "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1"
    );

    return NextResponse.json({
      configured: true,
      connected: true,
      customerId,
      writeEnabled:
        (process.env.GOOGLE_ADS_WRITE_ENABLED ?? "false").toLowerCase() === "true",
      apiVersion: process.env.GOOGLE_ADS_API_VERSION?.trim() || "v25",
      resultCount: result.results?.length ?? 0,
    });
  } catch (error) {
    const status = error instanceof GoogleAdsApiError ? error.status : 502;
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        customerId,
        error: error instanceof Error ? error.message : "Google Ads API connection failed",
      },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }
}
