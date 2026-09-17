import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { assertCustomerChannelEnabled } from "@/server/channels/channel-policy";
import { getReceptionistMode, isPilotConversationAllowed, isPilotOutboundEnabled } from "@/server/ai-receptionist/config";

type WaTextMessage = { id?: string; from?: string; type?: string; text?: { body?: string } };
type WaContact = { wa_id?: string; profile?: { name?: string } };
type WaValue = { messages?: WaTextMessage[]; contacts?: WaContact[] };
type WaChange = { field?: string; value?: WaValue };
type WaEntry = { changes?: WaChange[] };
type WaWebhook = { object?: string; entry?: WaEntry[] };

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sendWhatsApp(recipientId: string, text: string): Promise<string | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId || !isPilotOutboundEnabled() || !isPilotConversationAllowed("whatsapp", recipientId) || !["limited_auto", "live"].includes(getReceptionistMode())) return null;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v23.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: recipientId, type: "text", text: { body: text.slice(0, 3900) } }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { messages?: Array<{ id?: string }> } | null;
  if (!response.ok) throw new Error(`WhatsApp Send API failed: ${response.status}`);
  return body?.messages?.[0]?.id ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && expected && token === expected && challenge) return new Response(challenge, { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try { assertCustomerChannelEnabled("whatsapp"); } catch { return NextResponse.json({ error: "WhatsApp channel closed" }, { status: 423 }); }
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let payload: WaWebhook;
  try { payload = JSON.parse(raw) as WaWebhook; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (payload.object !== "whatsapp_business_account") return NextResponse.json({ ok: true });

  const service = getAdminContainer().aiReceptionist;
  let processed = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};
      const nameByWaId = new Map((value.contacts ?? []).map((contact) => [contact.wa_id ?? "", contact.profile?.name ?? ""]));
      for (const message of value.messages ?? []) {
        const senderId = message.from?.trim();
        const text = message.type === "text" ? message.text?.body?.trim() : "";
        if (!senderId || !text || !message.id) continue;
        try {
          const result = await service.ingestGuestMessage({
            channel: "whatsapp",
            externalConversationId: senderId,
            externalMessageId: message.id,
            customerName: nameByWaId.get(senderId) || undefined,
            customerContact: senderId,
            content: text,
            acquisitionSource: "whatsapp",
            utmSource: "whatsapp",
            testerUserId: null,
          });
          if (!result.duplicate && result.outboundMessageId) {
            try {
              const externalMessageId = await sendWhatsApp(senderId, result.reply);
              if (externalMessageId) await service.markOutboundDelivery(result.outboundMessageId, { status: "sent", externalMessageId });
            } catch (error) {
              await service.markOutboundDelivery(result.outboundMessageId, { status: "failed", detail: safeErrorMessage(error) });
              throw error;
            }
          }
          processed += 1;
        } catch (error) {
          await getAdminContainer().activityLog.record({ agent: "WhatsApp", unit: "TCE AI", message: `WhatsApp inbound HOLD: ${safeErrorMessage(error)}`, type: "alert" });
        }
      }
    }
  }
  return NextResponse.json({ ok: true, processed });
}
