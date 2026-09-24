import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { assertCustomerChannelEnabled } from "@/server/channels/channel-policy";
import {
  getReceptionistMode,
  isPilotConversationAllowed,
  isPilotOutboundEnabled,
} from "@/server/ai-receptionist/config";

type InstagramMessage = {
  mid?: string;
  text?: string;
};

type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: InstagramMessage;
};

type InstagramEntry = {
  id?: string;
  time?: number;
  messaging?: InstagramMessagingEvent[];
};

type InstagramWebhook = {
  object?: string;
  entry?: InstagramEntry[];
};

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function instagramPageEntity(): "tce" | "lavender" | "ruby" | "cozy" | "unknown" {
  const value = process.env.INSTAGRAM_PAGE_ENTITY?.trim().toLowerCase();
  if (value === "tce" || value === "lavender" || value === "ruby" || value === "cozy") return value;
  return "tce";
}

async function sendInstagram(recipientId: string, text: string): Promise<string | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const accountId = process.env.INSTAGRAM_USER_ID?.trim();
  if (
    !token ||
    !accountId ||
    !isPilotOutboundEnabled() ||
    !isPilotConversationAllowed("instagram", recipientId) ||
    !["limited_auto", "live"].includes(getReceptionistMode())
  ) {
    return null;
  }

  const version = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || "v26.0";
  const response = await fetch(
    `https://graph.instagram.com/${version}/${encodeURIComponent(accountId)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text.slice(0, 1900) },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  const body = await response.json().catch(() => null) as {
    message_id?: string;
    error?: { type?: string; code?: number; error_subcode?: number };
  } | null;

  if (!response.ok) {
    const error = body?.error;
    const detail = [
      error?.code != null ? `code=${error.code}` : null,
      error?.error_subcode != null ? `subcode=${error.error_subcode}` : null,
      error?.type ? `type=${error.type}` : null,
    ].filter(Boolean).join(" ");
    throw new Error(`Instagram Send API failed: ${response.status}${detail ? ` ${detail}` : ""}`);
  }

  return body?.message_id ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.INSTAGRAM_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    assertCustomerChannelEnabled("instagram");
  } catch {
    return NextResponse.json({ error: "Instagram channel closed" }, { status: 423 });
  }

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: InstagramWebhook;
  try {
    payload = JSON.parse(raw) as InstagramWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "instagram") return NextResponse.json({ ok: true });

  const service = getAdminContainer().aiReceptionist;
  let processed = 0;

  for (const entry of payload.entry ?? []) {
    const accountId = entry.id?.trim();
    const configuredAccountId = process.env.INSTAGRAM_USER_ID?.trim();
    if (!accountId || (configuredAccountId && accountId !== configuredAccountId)) {
      await getAdminContainer().activityLog.record({
        agent: "Instagram",
        unit: "TCE AI",
        message: "Instagram webhook account mismatch detected; event kept fail-closed.",
        type: "alert",
      });
      continue;
    }

    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id?.trim();
      const text = event.message?.text?.trim();
      const messageId = event.message?.mid?.trim();
      if (!senderId || !text || !messageId) continue;

      try {
        const result = await service.ingestGuestMessage({
          channel: "instagram",
          externalConversationId: senderId,
          externalMessageId: messageId,
          customerContact: senderId,
          content: text,
          acquisitionSource: "instagram",
          utmSource: "instagram",
          providerMessageType: "text",
          pageEntity: instagramPageEntity(),
          testerUserId: null,
        });

        if (!result.duplicate && result.outboundMessageId) {
          try {
            const externalMessageId = await sendInstagram(senderId, result.reply);
            if (externalMessageId) {
              await service.markOutboundDelivery(result.outboundMessageId, {
                status: "sent",
                externalMessageId,
              });
            }
          } catch (error) {
            await service.markOutboundDelivery(result.outboundMessageId, {
              status: "failed",
              detail: safeErrorMessage(error),
            });
            throw error;
          }
        }

        processed += 1;
      } catch (error) {
        await getAdminContainer().activityLog.record({
          agent: "Instagram",
          unit: "TCE AI",
          message: `Instagram inbound HOLD: ${safeErrorMessage(error)}`,
          type: "alert",
        });
      }
    }

  }

  return NextResponse.json({ ok: true, processed });
}
