import { parseOtaEmail } from "@/server/channels/ota-email-parser";
import type { AiReceptionistService } from "@/server/services/ai-receptionist.service";

type GmailMessageList = { messages?: Array<{ id?: string }> };
type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  headers?: GmailHeader[];
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: GmailPart;
};

export type OtaEmailWorkerResult = {
  checkedAt: string;
  configured: boolean;
  scanned: number;
  actionable: number;
  drafted: number;
  duplicates: number;
  contextOnly: number;
  failed: number;
  autoSent: number;
  autoSendHeld: number;
};


function headerValues(message: GmailMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of message.payload?.headers ?? []) {
    const name = item.name?.trim().toLowerCase();
    const value = item.value?.trim();
    if (name && value) out[name] = value;
  }
  return out;
}

function extractAddress(value: string): string {
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const plain = value.match(/([A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return plain?.[1]?.trim().toLowerCase() ?? "";
}

function autoReplyChannels(): Set<string> {
  const raw = process.env.TCE_OTA_EMAIL_AUTOREPLY_CHANNELS?.trim().toLowerCase() || "";
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function approvedReplyAddress(channel: string, address: string): boolean {
  const normalized = address.toLowerCase();
  if (channel === "booking") {
    return normalized.endsWith("@guest.booking.com") || normalized.endsWith("@property.booking.com");
  }
  if (channel === "agoda") {
    return normalized.endsWith("@agoda-messaging.com") && !normalized.startsWith("notifications@");
  }
  if (channel === "airbnb") {
    return normalized.endsWith("@reply.airbnb.com");
  }
  if (channel === "expedia") {
    return normalized.endsWith("@m.expediapartnercentral.com");
  }
  return false;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeSubject(subject: string): string {
  const cleaned = subject.replace(/[\r\n]+/g, " ").trim();
  return /^re:/i.test(cleaned) ? cleaned : `Re: ${cleaned}`;
}

async function gmailSendReply(input: {
  token: string;
  threadId?: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): Promise<string> {
  const headers = [
    `To: ${input.to}`,
    `Subject: ${safeSubject(input.subject)}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);
  headers.push("", input.body.trim());
  const requestBody: { raw: string; threadId?: string } = {
    raw: encodeBase64Url(headers.join("\r\n")),
  };
  if (input.threadId) requestBody.threadId = input.threadId;

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload?.id) {
    throw new Error(`gmail_send_failed:${response.status}:${payload?.error?.message?.slice(0, 120) ?? "unknown"}`);
  }
  return payload.id;
}

function configured(): boolean {
  return Boolean(
    process.env.TCE_OTA_GMAIL_CLIENT_ID?.trim() &&
    process.env.TCE_OTA_GMAIL_CLIENT_SECRET?.trim() &&
    process.env.TCE_OTA_GMAIL_REFRESH_TOKEN?.trim()
  );
}

function decodeBase64Url(value?: string): string {
  if (!value) return "";
  try {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectBody(part?: GmailPart): { plain: string[]; html: string[] } {
  const result = { plain: [] as string[], html: [] as string[] };
  if (!part) return result;
  const body = decodeBase64Url(part.body?.data);
  if (body && part.mimeType === "text/plain") result.plain.push(body);
  if (body && part.mimeType === "text/html") result.html.push(body);
  for (const child of part.parts ?? []) {
    const nested = collectBody(child);
    result.plain.push(...nested.plain);
    result.html.push(...nested.html);
  }
  return result;
}

function header(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers ?? [];
  return headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function bodyText(message: GmailMessage): string {
  const bodies = collectBody(message.payload);
  if (bodies.plain.length) return bodies.plain.join("\n").slice(0, 12000);
  if (bodies.html.length) return stripHtml(bodies.html.join("\n")).slice(0, 12000);
  return message.snippet?.trim() ?? "";
}

function inferPageEntity(text: string): "tce" | "lavender" | "ruby" | "cozy" | "unknown" {
  const normalized = text.toLowerCase();
  if (normalized.includes("ruby homestay")) return "ruby";
  if (normalized.includes("lavender") || normalized.includes("tam coc lavender")) return "lavender";
  if (normalized.includes("cozy garden")) return "cozy";
  if (normalized.includes("tam coc experience")) return "tce";
  return "lavender";
}

async function oauthAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.TCE_OTA_GMAIL_CLIENT_ID!.trim(),
    client_secret: process.env.TCE_OTA_GMAIL_CLIENT_SECRET!.trim(),
    refresh_token: process.env.TCE_OTA_GMAIL_REFRESH_TOKEN!.trim(),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; error?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(`gmail_oauth_failed:${response.status}:${payload?.error ?? "unknown"}`);
  }
  return payload.access_token;
}

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`gmail_api_failed:${response.status}`);
  return await response.json() as T;
}

export async function runOtaEmailWorker(service: AiReceptionistService): Promise<OtaEmailWorkerResult> {
  const result: OtaEmailWorkerResult = {
    checkedAt: new Date().toISOString(),
    configured: configured(),
    scanned: 0,
    actionable: 0,
    drafted: 0,
    duplicates: 0,
    contextOnly: 0,
    failed: 0,
    autoSent: 0,
    autoSendHeld: 0,
  };
  if (!result.configured) return result;

  const token = await oauthAccessToken();
  const query = process.env.TCE_OTA_GMAIL_QUERY?.trim()
    || "newer_than:2d (from:(@guest.booking.com) OR from:(@property.booking.com) OR from:(@agoda-messaging.com) OR from:(@airbnb.com) OR from:(@m.expediapartnercentral.com)) -in:spam -in:trash -in:sent";
  const list = await gmailGet<GmailMessageList>(
    token,
    `messages?${new URLSearchParams({ q: query, maxResults: "50" }).toString()}`
  );

  for (const item of list.messages ?? []) {
    if (!item.id) continue;
    result.scanned += 1;
    try {
      const message = await gmailGet<GmailMessage>(token, `messages/${encodeURIComponent(item.id)}?format=full`);
      const from = header(message, "From");
      const subject = header(message, "Subject");
      const body = bodyText(message);
      const parsed = parseOtaEmail({ from, subject, body, snippet: message.snippet });
      if (!parsed.channel) {
        result.contextOnly += 1;
        continue;
      }
      if (!parsed.actionable || !parsed.guestText || !parsed.reservationReference) {
        result.contextOnly += 1;
        continue;
      }

      result.actionable += 1;
      const pageEntity = inferPageEntity(`${subject}\n${body.slice(0, 2500)}`);
      const headers = headerValues(message);
      const ingest = await service.ingestGuestMessage({
        channel: parsed.channel,
        externalConversationId: `${parsed.channel}:${parsed.reservationReference}`,
        externalMessageId: `gmail:${item.id}`,
        content: parsed.guestText,
        scenarioTag: "OTA_EMAIL_INGRESS",
        acquisitionSource: `${parsed.channel}_email`,
        pageEntity,
        carePhase: parsed.carePhase,
        reservationReference: parsed.reservationReference,
        reservationContext: {
          checkInText: parsed.checkInText,
          checkOutText: parsed.checkOutText,
          specialRequest: parsed.specialRequest,
        },
        providerMessageType: `email_${parsed.eventType}`,
        forceAssistMode: true,
        testerUserId: null,
      });
      if (ingest.duplicate) {
        result.duplicates += 1;
        continue;
      }

      result.drafted += 1;
      const replyTo = extractAddress(headers["reply-to"] || headers["from"] || "");
      const autoSendRequested = autoReplyChannels().has(parsed.channel);
      const autoSendAllowed = autoSendRequested
        && !ingest.reviewId
        && approvedReplyAddress(parsed.channel, replyTo)
        && Boolean(ingest.outboundMessageId);

      if (!autoSendAllowed) {
        result.autoSendHeld += 1;
        continue;
      }

      try {
        const sentId = await gmailSendReply({
          token,
          threadId: message.threadId,
          to: replyTo,
          subject,
          body: ingest.reply,
          inReplyTo: headers["message-id"],
          references: headers["references"] || headers["message-id"],
        });
        if (ingest.outboundMessageId) {
          await service.markOutboundDelivery(ingest.outboundMessageId, {
            status: "sent",
            externalMessageId: `gmail:${sentId}`,
            detail: `OTA email relay sent via approved ${parsed.channel} reply address`,
          });
        }
        result.autoSent += 1;
      } catch {
        if (ingest.outboundMessageId) {
          await service.markOutboundDelivery(ingest.outboundMessageId, {
            status: "failed",
            detail: "OTA email relay send failed",
          });
        }
        result.failed += 1;
      }
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
