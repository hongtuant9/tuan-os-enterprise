import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cozyTableDestination, parseCozyTableNumber } from "@/server/marketing-command-center/cozy-table-qr";

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

const GOOGLE_REPORTED_SOURCES = new Set(["google_search", "google_maps", "skip"]);

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function safeQrId(value: unknown): string {
  const text = safeString(value, 64)?.toLowerCase() ?? "general";
  return /^[a-z0-9_-]+$/.test(text) ? text : "general";
}

function fifteenMinuteBucket(now = Date.now()) {
  return Math.floor(now / (15 * 60 * 1000));
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
    const tableNumber = parseCozyTableNumber(String(body?.tableNumber ?? ""));
    const destination = tableNumber ? cozyTableDestination(tableNumber) : null;
    const qrId = destination?.qrId ?? safeQrId(body?.qrId);

    if (!source || !ALLOWED_SOURCES.has(source)) {
      return NextResponse.json({ ok: false, error: "INVALID_SOURCE" }, { status: 400 });
    }
    if (!anonymousId || !/^[a-zA-Z0-9._:-]{8,128}$/.test(anonymousId)) {
      return NextResponse.json({ ok: false, error: "INVALID_ANONYMOUS_ID" }, { status: 400 });
    }
    if (!destination) {
      return NextResponse.json({ ok: false, error: "INVALID_TABLE" }, { status: 400 });
    }

    const gclid = safeString(body?.gclid, 256);
    const gbraid = safeString(body?.gbraid, 256);
    const wbraid = safeString(body?.wbraid, 256);
    const hasPaidClick = Boolean(gclid || gbraid || wbraid);
    const alignedPaidSource = hasPaidClick && GOOGLE_REPORTED_SOURCES.has(source);
    const contradictoryPaidSource = hasPaidClick && !GOOGLE_REPORTED_SOURCES.has(source);

    const db = dbOf(createAdminClient());
    const recentSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await db
      .from("marketing_attribution_events")
      .select("id")
      .eq("anonymous_id", anonymousId)
      .eq("evidence_source", alignedPaidSource ? "COZY_QR_TRACKED_CLICK" : "COZY_QR_SELF_REPORT")
      .gte("occurred_at", recentSince)
      .limit(5);

    if (recentError) throw recentError;
    const recentCount = Array.isArray(recent) ? recent.length : 0;
    if (recentCount >= 5) {
      return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
    }

    const now = new Date().toISOString();
    const externalEventKey = `cozy_table_scan:${anonymousId}:${qrId}:${fifteenMinuteBucket()}`;
    const selfReportedSource = source === "skip" ? null : source;
    const attributionStatus = contradictoryPaidSource
      ? "NEED_VERIFY"
      : alignedPaidSource
        ? "ASSISTED_VERIFIED"
        : source === "skip"
          ? "UNATTRIBUTED"
          : "SELF_REPORTED";
    const verificationStatus = alignedPaidSource || source !== "skip" ? "PARTIAL" : "NEED_VERIFY";
    const evidenceSource = contradictoryPaidSource
      ? "COZY_QR_CONTRADICTORY_SOURCE"
      : alignedPaidSource
        ? "COZY_QR_TRACKED_CLICK"
        : "COZY_QR_SELF_REPORT";

    const originalUtmSource = safeString(body?.utmSource, 120);
    const originalUtmMedium = safeString(body?.utmMedium, 120);
    const originalUtmCampaign = safeString(body?.utmCampaign, 180);
    const originalUtmContent = safeString(body?.utmContent, 180);

    const row = {
      external_event_key: externalEventKey,
      occurred_at: now,
      event_type: "website_visit",
      touch_type: alignedPaidSource ? "ASSISTED" : "UNKNOWN",
      source: alignedPaidSource ? "google_ads" : "qr",
      medium: alignedPaidSource ? "paid_search" : "table_qr",
      utm_source: originalUtmSource ?? (alignedPaidSource ? "google" : "qr"),
      utm_medium: originalUtmMedium ?? (alignedPaidSource ? "cpc" : "table_qr"),
      utm_campaign: originalUtmCampaign ?? "cozy_table_source",
      utm_content: originalUtmContent ?? qrId,
      utm_term: safeString(body?.utmTerm, 180),
      gclid,
      gbraid,
      wbraid,
      landing_page: `/cozy/source?table=${tableNumber}`,
      self_reported_source: selfReportedSource,
      anonymous_id: anonymousId,
      attribution_status: attributionStatus,
      verification_status: verificationStatus,
      evidence_source: evidenceSource,
      metadata: {
        business_unit: "cozy_garden",
        qr_id: qrId,
        table_number: tableNumber,
        attribution_id: anonymousId,
        privacy: "NO_PII_COLLECTED",
        source_capture_version: "v2",
        qr_campaign: "cozy_table_source",
        kiotviet_table_status: destination.status,
        kiotviet_destination: destination.kiotVietUrl,
        order_join_status: "NEED_VERIFY",
        join_strategy: "ATTRIBUTION_ID_PLUS_TABLE_PLUS_TIME",
      },
    };

    const { error } = await db.from("marketing_attribution_events").insert(row);
    if (error && error.code !== "23505") throw error;

    if (destination.status !== "ACTIVE" || !destination.kiotVietUrl) {
      return NextResponse.json({
        ok: true,
        duplicate: error?.code === "23505",
        status: "HOLD",
        tableNumber,
        destination: null,
        message: "TABLE_NOT_CONFIGURED_IN_KIOTVIET",
      });
    }

    return NextResponse.json({
      ok: true,
      duplicate: error?.code === "23505",
      status: "ACTIVE",
      tableNumber,
      destination: destination.kiotVietUrl,
    });
  } catch (error) {
    console.error("[cozy-source-attribution]", error instanceof Error ? error.message : "UNKNOWN");
    return NextResponse.json({ ok: false, error: "CAPTURE_FAILED" }, { status: 500 });
  }
}
