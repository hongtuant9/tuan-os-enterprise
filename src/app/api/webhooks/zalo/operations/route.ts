import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseZaloOpsEvent, processZaloOpsEvent } from "@/server/integrations/zalo/operations-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signatureConfigured() {
  return Boolean(
    process.env.ZALO_APP_ID?.trim() &&
    process.env.ZALO_OA_SECRET_KEY?.trim() &&
    process.env.TCE_ZALO_WEBHOOK_SIGNATURE_MODE?.trim()
  );
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : {};
}

function nested(record: UnknownRecord, key: string): UnknownRecord {
  return asRecord(record[key]);
}

function verifySignature(rawBody: string, req: NextRequest, payload: unknown): boolean {
  const mode = process.env.TCE_ZALO_WEBHOOK_SIGNATURE_MODE?.trim();
  if (mode !== "sha256_appid_data_timestamp_secret") return false;

  const appId = process.env.ZALO_APP_ID?.trim();
  const secret = process.env.ZALO_OA_SECRET_KEY?.trim();
  const received = req.headers.get("x-zevent-signature")?.trim().toLowerCase();
  const root = asRecord(payload);
  const data = nested(root, "data");
  const timestamp = String(root.timestamp ?? root.time ?? data.timestamp ?? "");
  if (!appId || !secret || !received || !timestamp) return false;

  // Zalo community/support references this composition for X-ZEvent-Signature.
  // Keep endpoint fail-closed until API Explorer/webhook test confirms the exact production event format.
  const expected = createHash("sha256").update(appId + rawBody + timestamp + secret).digest("hex").toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (process.env.TCE_ZALO_BRIDGE_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json({ ok: false, error: "zalo_bridge_disabled" }, { status: 503 });
  }
  if (!signatureConfigured()) {
    return NextResponse.json({ ok: false, error: "zalo_signature_not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!verifySignature(rawBody, req, payload)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  try {
    const event = parseZaloOpsEvent(payload);
    const result = await processZaloOpsEvent(event);
    return NextResponse.json({
      ok: true,
      caseId: result.caseId,
      route: result.route,
      duplicate: result.duplicate,
      taskId: result.taskId,
      responseStatus: result.responseStatus,
      responseText: result.responseText,
      outboundSent: false,
      outboundReason: "shadow_mode_outbound_adapter_not_verified",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "zalo bridge error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "zalo-operations-bridge",
    bridgeEnabled: process.env.TCE_ZALO_BRIDGE_ENABLED?.trim().toLowerCase() === "true",
    signatureConfigured: signatureConfigured(),
    mode: "shadow",
    outboundEnabled: false,
  });
}
