import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { getReceptionistMode, isPilotOutboundEnabled } from "@/server/ai-receptionist/config";

type MetaMessage = { mid?: string; text?: string };
type MetaMessaging = { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: MetaMessage };
type MetaEntry = { id?: string; messaging?: MetaMessaging[] };
type MetaWebhook = { object?: string; entry?: MetaEntry[] };

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message.slice(0, 300);
  }
  return "Unknown error";
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sendMessenger(recipientId: string, text: string): Promise<void> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!token || !isPilotOutboundEnabled() || !["limited_auto", "live"].includes(getReceptionistMode())) return;
  const version = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v23.0";
  const response = await fetch(`https://graph.facebook.com/${version}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text: text.slice(0, 1900) } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Facebook Send API failed: ${response.status}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.FACEBOOK_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && expected && token === expected && challenge) return new Response(challenge, { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let payload: MetaWebhook;
  try { payload = JSON.parse(raw) as MetaWebhook; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (payload.object !== "page") return NextResponse.json({ ok: true });

  const service = getAdminContainer().aiReceptionist;
  let processed = 0;
  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id?.trim();
      const text = event.message?.text?.trim();
      if (!senderId || !text || !event.message?.mid) continue;
      try {
        const result = await service.ingestGuestMessage({
          channel: "facebook",
          externalConversationId: senderId,
          externalMessageId: event.message.mid,
          customerName: undefined,
          customerContact: undefined,
          content: text,
          acquisitionSource: "facebook_messenger",
          utmSource: "facebook",
          testerUserId: null,
        });
        if (!result.duplicate) await sendMessenger(senderId, result.reply);
        processed += 1;
      } catch (error) {
        await getAdminContainer().activityLog.record({
          agent: "Facebook Messenger",
          unit: "TCE AI",
          message: `Facebook inbound HOLD: ${safeErrorMessage(error)}`,
          type: "alert",
        });
      }
    }
  }
  return NextResponse.json({ ok: true, processed });
}
