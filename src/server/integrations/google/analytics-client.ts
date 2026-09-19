import "server-only";
import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleOAuthTokenStore, GoogleAnalyticsReadScopeError } from "@/server/integrations/google/token-store";

const MEASUREMENT_ID = "G-QC8L09B1LV";
const SOURCE_KEY = "ga4-traffic";

type Ga4Snapshot = {
  propertyId: string;
  measurementId: string;
  observedAt: string;
  period: { startDate: string; endDate: string };
  totals: {
    sessions: number;
    engagedSessions: number;
    totalUsers: number;
    keyEvents: number;
  };
  sources: Array<{ source: string; medium: string; sessions: number; engagedSessions: number; totalUsers: number; keyEvents: number }>;
};

function numberValue(value?: string | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function discoverPropertyId(auth: Awaited<ReturnType<GoogleOAuthTokenStore["getSystemAuthorizedClientForAnalyticsRead"]>>): Promise<string | null> {
  const admin = google.analyticsadmin({ version: "v1beta", auth });
  const summaries = await admin.accountSummaries.list({ pageSize: 200 });
  for (const account of summaries.data.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      if (!property.property) continue;
      const streams = await admin.properties.dataStreams.list({ parent: property.property, pageSize: 200 });
      const matched = (streams.data.dataStreams ?? []).find((stream) => stream.webStreamData?.measurementId === MEASUREMENT_ID);
      if (matched) return property.property.replace(/^properties\//, "");
    }
  }
  return null;
}

export async function collectGa4TrafficSnapshot(): Promise<{ ok: boolean; status: "SYNCED" | "NEEDS_REAUTH" | "NOT_FOUND" | "ERROR"; snapshot?: Ga4Snapshot; error?: string }> {
  const db = createAdminClient();
  const tokenStore = new GoogleOAuthTokenStore();
  let auth;
  try {
    auth = await tokenStore.getSystemAuthorizedClientForAnalyticsRead();
  } catch (error) {
    if (error instanceof GoogleAnalyticsReadScopeError) {
      return { ok: false, status: "NEEDS_REAUTH", error: "analytics.readonly scope missing" };
    }
    return { ok: false, status: "ERROR", error: error instanceof Error ? error.message.slice(0, 220) : "Google auth unavailable" };
  }

  try {
    const existing = await db.from("sync_records").select("data").eq("source_key", SOURCE_KEY).eq("external_id", "current").maybeSingle();
    const existingProperty = existing.data?.data && typeof existing.data.data === "object" && !Array.isArray(existing.data.data)
      ? String((existing.data.data as Record<string, unknown>).propertyId ?? "").trim()
      : "";
    const propertyId = existingProperty || await discoverPropertyId(auth);
    if (!propertyId) {
      await db.from("sync_sources").update({ status: "error", last_error: `GA4 property for ${MEASUREMENT_ID} not found` }).eq("key", SOURCE_KEY);
      return { ok: false, status: "NOT_FOUND", error: "Matching GA4 property not found" };
    }

    const dataApi = google.analyticsdata({ version: "v1beta", auth });
    const report = await dataApi.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
        limit: "100",
      },
    });

    const rows = (report.data.rows ?? []).map((row) => ({
      source: row.dimensionValues?.[0]?.value ?? "(unknown)",
      medium: row.dimensionValues?.[1]?.value ?? "(unknown)",
      sessions: numberValue(row.metricValues?.[0]?.value),
      engagedSessions: numberValue(row.metricValues?.[1]?.value),
      totalUsers: numberValue(row.metricValues?.[2]?.value),
      keyEvents: numberValue(row.metricValues?.[3]?.value),
    }));
    const totals = rows.reduce((acc, row) => ({
      sessions: acc.sessions + row.sessions,
      engagedSessions: acc.engagedSessions + row.engagedSessions,
      totalUsers: acc.totalUsers + row.totalUsers,
      keyEvents: acc.keyEvents + row.keyEvents,
    }), { sessions: 0, engagedSessions: 0, totalUsers: 0, keyEvents: 0 });
    const snapshot: Ga4Snapshot = {
      propertyId,
      measurementId: MEASUREMENT_ID,
      observedAt: new Date().toISOString(),
      period: { startDate: "7daysAgo", endDate: "today" },
      totals,
      sources: rows,
    };

    const now = new Date().toISOString();
    await db.from("sync_records").upsert({
      source_key: SOURCE_KEY,
      external_id: "current",
      target_table: null,
      target_id: null,
      data: snapshot,
      synced_at: now,
      updated_at: now,
    }, { onConflict: "source_key,external_id" });
    await db.from("sync_sources").update({ status: "idle", last_synced_at: now, last_error: null }).eq("key", SOURCE_KEY);
    return { ok: true, status: "SYNCED", snapshot };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 220) : "GA4 collection failed";
    await db.from("sync_sources").update({ status: "error", last_error: message }).eq("key", SOURCE_KEY);
    return { ok: false, status: "ERROR", error: message };
  }
}
