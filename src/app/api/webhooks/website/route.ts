import { createHmac, createPublicKey, timingSafeEqual, verify as verifyCrypto } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { assertCustomerChannelReceiveEnabled } from "@/server/channels/channel-policy";

type WebsiteInboundPayload = {
  conversationId?: string;
  messageId?: string;
  message?: string;
  customerName?: string;
  customerContact?: string;
  pageEntity?: "tce" | "lavender" | "ruby" | "cozy" | "unknown";
  acquisitionSource?: string;
  utmSource?: string;
  utmCampaign?: string;
  referralSource?: string;
};

const MAX_BODY_BYTES = 32_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function safeString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function timestampValid(timestamp: string | null): timestamp is string {
  if (!timestamp) return false;
  const ts = Number(timestamp);
  return Number.isFinite(ts) && Math.abs(Date.now() - ts) <= MAX_CLOCK_SKEW_MS;
}

function verifyEd25519(raw: string, timestamp: string, signature: string | null): boolean {
  const publicKeyBase64 = process.env.TCE_WEBSITE_BRIDGE_PUBLIC_KEY?.trim();
  if (!publicKeyBase64 || !signature) return false;
  try {
    const rawKey = Buffer.from(publicKeyBase64, "base64");
    const sig = Buffer.from(signature, "base64");
    if (rawKey.length !== 32 || sig.length !== 64) return false;

    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const key = createPublicKey({
      key: Buffer.concat([spkiPrefix, rawKey]),
      format: "der",
      type: "spki",
    });
    return verifyCrypto(null, Buffer.from(`${timestamp}.${raw}`), key, sig);
  } catch {
    return false;
  }
}

function verifyHmac(raw: string, timestamp: string, signature: string | null): boolean {
  const secret = process.env.TCE_WEBSITE_BRIDGE_SECRET?.trim();
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifySignature(
  raw: string,
  timestamp: string | null,
  ed25519Signature: string | null,
  hmacSignature: string | null,
): boolean {
  if (!timestampValid(timestamp)) return false;
  if (verifyEd25519(raw, timestamp, ed25519Signature)) return true;
  return verifyHmac(raw, timestamp, hmacSignature);
}

export async function POST(request: Request) {
  try {
    assertCustomerChannelReceiveEnabled("website");
  } catch {
    return NextResponse.json({ error: "Website receive path is closed" }, { status: 423 });
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (!verifySignature(
    raw,
    request.headers.get("x-tce-timestamp"),
    request.headers.get("x-tce-signature-ed25519"),
    request.headers.get("x-tce-signature"),
  )) {
    return NextResponse.json({ error: "Invalid website bridge signature" }, { status: 401 });
  }

  let payload: WebsiteInboundPayload;
  try {
    payload = JSON.parse(raw) as WebsiteInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const conversationId = safeString(payload.conversationId, 200);
  const messageId = safeString(payload.messageId, 200);
  const message = safeString(payload.message, 4_000);

  if (!conversationId || !messageId || !message) {
    return NextResponse.json(
      { error: "conversationId, messageId and message are required" },
      { status: 400 },
    );
  }

  const pageEntity = payload.pageEntity && ["tce", "lavender", "ruby", "cozy", "unknown"].includes(payload.pageEntity)
    ? payload.pageEntity
    : "tce";

  try {
    const service = getAdminContainer().aiReceptionist;
    const result = await service.ingestGuestMessage({
      channel: "website",
      externalConversationId: conversationId,
      externalMessageId: messageId,
      customerName: safeString(payload.customerName, 160),
      customerContact: safeString(payload.customerContact, 240),
      content: message,
      acquisitionSource: safeString(payload.acquisitionSource, 120) ?? "website",
      utmSource: safeString(payload.utmSource, 120),
      utmCampaign: safeString(payload.utmCampaign, 180),
      referralSource: safeString(payload.referralSource, 180),
      pageEntity,
      providerMessageType: "website_message",
      forceAssistMode: true,
      testerUserId: null,
    });

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      received: true,
      replyGenerated: Boolean(result.reply),
      outboundSent: false,
    });
  } catch (error) {
    await getAdminContainer().activityLog.record({
      agent: "Website",
      unit: "TCE AI",
      message: `Website inbound HOLD: ${error instanceof Error ? error.message.slice(0, 250) : "Unknown error"}`,
      type: "alert",
    });

    return NextResponse.json(
      { error: "Website message could not be accepted" },
      { status: 500 },
    );
  }
}
