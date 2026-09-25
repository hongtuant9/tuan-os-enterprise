import { createHmac, timingSafeEqual } from "node:crypto";
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

function verifySignature(raw: string, timestamp: string | null, signature: string | null): boolean {
  const secret = process.env.TCE_WEBSITE_BRIDGE_SECRET?.trim();
  if (!secret || !timestamp || !signature?.startsWith("sha256=")) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
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
