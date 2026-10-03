import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbError = { code?: string; message?: string } | null;
type DbResult = { data: unknown; error: DbError };
type DbQuery = PromiseLike<DbResult> & {
  select(columns?: string): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  gte(column: string, value: unknown): DbQuery;
  limit(value: number): DbQuery;
  insert(row: Record<string, unknown>): PromiseLike<DbResult>;
};
type UntypedDb = { from(name: string): DbQuery };

function dbOf(client: ReturnType<typeof createAdminClient>): UntypedDb {
  return client as unknown as UntypedDb;
}

const ALLOWED_SOURCES = new Set([
  "google_search",
  "google_maps",
  "tripadvisor",
  "walked_past",
  "hotel_homestay",
  "friend",
  "facebook_instagram",
  "other",
  "skip",
]);

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function safeQrId(value: unknown): string {
  const text = safeString(value, 64)?.toLowerCase() ?? "general";
  return /^[a-z0-9_-]+$/.test(text) ? text : "general";
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 8_000) {
      return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const body = await request.json();
    const source = safeString(body?.source, 40);
    const anonymousId = safeString(body?.anonymousId, 128);
    const qrId = safeQrId(body?.qrId);

    if (!source || !ALLOWED_SOURCES.has(source)) {
      return NextResponse.json({ ok: false, error: "INVALID_SOURCE" }, { status: 400 });
    }
    if (!anonymousId || !/^[a-zA-Z0-9._:-]{8,128}$/.test(anonymousId)) {
      return NextResponse.json({ ok: false, error: "INVALID_ANONYMOUS_ID" }, { status: 400 });
    }

    const db = dbOf(createAdminClient());
    const recentSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await db
      .from("marketing_attribution_events")
      .select("id")
      .eq("anonymous_id", anonymousId)
      .eq("evidence_source", "COZY_QR_SELF_REPORT")
      .gte("occurred_at", recentSince)
      .limit(5);

    if (recentError) throw recentError;
    const recentCount = Array.isArray(recent) ? recent.length : 0;
    if (recentCount >= 5) {
      return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
    }

    const now = new Date().toISOString();
    const externalEventKey = `cozy_qr_source:${anonymousId}:${qrId}`;
    const selfReportedSource = source === "skip" ? null : source;

    const row = {
      external_event_key: externalEventKey,
      occurred_at: now,
      event_type: "website_visit",
      touch_type: "UNKNOWN",
      source: "qr",
      medium: "qr",
      utm_source: safeString(body?.utmSource, 120) ?? "qr",
      utm_medium: safeString(body?.utmMedium, 120) ?? "qr",
      utm_campaign: safeString(body?.utmCampaign, 180) ?? "cozy_table_source",
      utm_content: safeString(body?.utmContent, 180) ?? qrId,
      utm_term: safeString(body?.utmTerm, 180),
      gclid: safeString(body?.gclid, 256),
      gbraid: safeString(body?.gbraid, 256),
      wbraid: safeString(body?.wbraid, 256),
      landing_page: "/cozy/source",
      self_reported_source: selfReportedSource,
      anonymous_id: anonymousId,
      attribution_status: source === "skip" ? "UNATTRIBUTED" : "SELF_REPORTED",
      verification_status: source === "skip" ? "NEED_VERIFY" : "PARTIAL",
      evidence_source: "COZY_QR_SELF_REPORT",
      metadata: {
        business_unit: "cozy_garden",
        qr_id: qrId,
        privacy: "NO_PII_COLLECTED",
        source_capture_version: "v1",
        destination_status: "KIOTVIET_ORDER_URL_NEED_VERIFY",
        safe_destination: "https://tamcocexperience.com/cozy-garden/#favourites",
      },
    };

    const { error } = await db.from("marketing_attribution_events").insert(row);
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          destination: "https://tamcocexperience.com/cozy-garden/#favourites",
        });
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      duplicate: false,
      destination: "https://tamcocexperience.com/cozy-garden/#favourites",
    });
  } catch (error) {
    console.error("[cozy-source-attribution]", error instanceof Error ? error.message : "UNKNOWN");
    return NextResponse.json({ ok: false, error: "CAPTURE_FAILED" }, { status: 500 });
  }
}
