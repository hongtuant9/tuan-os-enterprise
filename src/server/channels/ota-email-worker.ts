import { google } from "googleapis";
import { parseOtaEmail } from "@/server/channels/ota-email-parser";
import type { AiReceptionistService } from "@/server/services/ai-receptionist.service";
import { getReceptionistMode } from "@/server/ai-receptionist/config";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

type GmailHeader = { name?: string | null; value?: string | null };
type GmailPart = {
  mimeType?: string | null;
  body?: { data?: string | null };
  headers?: GmailHeader[] | null;
  parts?: GmailPart[] | null;
};
type GmailMessage = {
  id?: string | null;
  threadId?: string | null;
  snippet?: string | null;
  payload?: GmailPart | null;
};

export type OtaEmailWorkerResult = {
  checkedAt: string;
  backfill: boolean;
  configured: boolean;
  scanned: number;
  actionable: number;
  drafted: number;
  duplicates: number;
  contextOnly: number;
  failed: number;
  autoSent: number;
  autoSendHeld: number;
  contextStored: number;
  mailboxesConfigured: number;
  nextPageTokens: Record<string, string | null>;
};

export type OtaEmailWorkerOptions = {
  backfill?: boolean;
  pageTokens?: Record<string, string | null | undefined>;
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

function automaticReplyGateOpen(): boolean {
  if (process.env.TCE_OTA_EMAIL_REPLY_GATE_APPROVED?.trim().toLowerCase() !== "true") return false;
  if (process.env.TCE_OTA_EMAIL_AUTOREPLY_ENABLED?.trim().toLowerCase() !== "true") return false;
  if (!process.env.AI_RECEPTIONIST_OPENAI_API_KEY?.trim()) return false;
  const mode = getReceptionistMode();
  return mode === "limited_auto" || mode === "live";
}

function autoReplyChannels(): Set<string> {
  const raw = process.env.TCE_OTA_EMAIL_AUTOREPLY_CHANNELS?.trim().toLowerCase() || "";
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function approvedReplyAddress(channel: string, address: string): boolean {
  const normalized = address.toLowerCase();
  if (channel === "booking") {
    return normalized.endsWith("@guest.booking.com");
  }
  if (channel === "agoda") {
    return normalized.endsWith("@agoda-messaging.com") && !normalized.startsWith("notifications@");
  }
  if (channel === "airbnb") {
    return normalized.endsWith("@reply.airbnb.com");
  }
  if (channel === "expedia") {
    return false;
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

function decodeBase64Url(value?: string | null): string {
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

function collectBody(part?: GmailPart | null): { plain: string[]; html: string[] } {
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

async function sendReply(input: {
  gmail: ReturnType<typeof google.gmail>;
  threadId?: string | null;
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

  const { data } = await input.gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeBase64Url(headers.join("\r\n")),
      threadId: input.threadId || undefined,
    },
  });
  if (!data.id) throw new Error("gmail_send_missing_message_id");
  return data.id;
}

export async function runOtaEmailWorker(
  service: AiReceptionistService,
  options: OtaEmailWorkerOptions = {},
): Promise<OtaEmailWorkerResult> {
  const result: OtaEmailWorkerResult = {
    checkedAt: new Date().toISOString(),
    backfill: options.backfill === true,
    configured: false,
    scanned: 0,
    actionable: 0,
    drafted: 0,
    duplicates: 0,
    contextOnly: 0,
    failed: 0,
    autoSent: 0,
    autoSendHeld: 0,
    contextStored: 0,
    mailboxesConfigured: 0,
    nextPageTokens: {},
  };

  const allMailboxClients = await new GoogleOAuthTokenStore().getSystemAuthorizedClientsForGmail();
  const mailboxClients = allMailboxClients.filter((mailbox) => mailbox.entity !== "cozy");
  result.mailboxesConfigured = mailboxClients.length;
  result.configured = mailboxClients.length > 0;
  if (!result.configured) return result;

  const providerQuery = "(from:(booking.com) OR from:(agoda.com) OR from:(agoda-messaging.com) OR from:(airbnb.com) OR from:(expediapartnercentral.com) OR from:(expedia.com)) -in:spam -in:trash -in:sent";
  const query = options.backfill
    ? providerQuery
    : (process.env.TCE_OTA_GMAIL_QUERY?.trim() || `newer_than:2d ${providerQuery}`);
  const maxResults = options.backfill ? 100 : 50;

  for (const mailbox of mailboxClients) {
    const gmail = google.gmail({ version: "v1", auth: mailbox.auth });

    let messages: Array<{ id?: string | null }> = [];
    try {
      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
        pageToken: options.pageTokens?.[mailbox.entity] || undefined,
      });
      messages = list.data.messages ?? [];
      result.nextPageTokens[mailbox.entity] = list.data.nextPageToken ?? null;
    } catch {
      result.failed += 1;
      continue;
    }

    for (const item of messages) {
      if (!item.id) continue;
      result.scanned += 1;

      try {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: item.id,
          format: "full",
        });
        const message = data as GmailMessage;
        const from = header(message, "From");
        const subject = header(message, "Subject");
        const body = bodyText(message);
        const headers = headerValues(message);
        const replyTo = extractAddress(headers["reply-to"] || headers["from"] || "");
        const parsed = parseOtaEmail({ from, subject, body, snippet: message.snippet });

        if (!parsed.channel) {
          result.contextOnly += 1;
          continue;
        }

        if (!parsed.actionable || !parsed.guestText || !parsed.reservationReference) {
          const shouldStoreContext = Boolean(
            parsed.reservationReference
            || ["booking_confirmation", "arrival_reminder", "review", "guest_request", "guest_message"].includes(parsed.eventType)
          );
          if (!shouldStoreContext) {
            result.contextOnly += 1;
            continue;
          }

          const context = await service.ingestProviderContext({
            channel: parsed.channel,
            externalConversationId: `${parsed.channel}:${mailbox.entity}:${parsed.reservationReference ?? message.threadId ?? item.id}`,
            externalMessageId: `gmail:${mailbox.entity}:${item.id}`,
            content: [subject, body].filter(Boolean).join("\n\n").slice(0, 8000),
            pageEntity: mailbox.entity,
            carePhase: parsed.carePhase,
            reservationReference: parsed.reservationReference,
            reservationContext: {
              checkInText: parsed.checkInText,
              checkOutText: parsed.checkOutText,
              specialRequest: parsed.specialRequest,
            },
            providerMessageType: `email_${parsed.eventType}`,
            sourceMailbox: mailbox.googleEmail,
            replyMailbox: mailbox.googleEmail,
            providerThreadId: message.threadId ?? null,
            providerReplyTo: replyTo || null,
            historicalImport: options.backfill === true,
          });
          if (context.duplicate) {
            result.duplicates += 1;
          } else {
            result.contextStored += 1;
          }
          continue;
        }

        result.actionable += 1;
        const ingest = await service.ingestGuestMessage({
          channel: parsed.channel,
          externalConversationId: `${parsed.channel}:${mailbox.entity}:${parsed.reservationReference}`,
          externalMessageId: `gmail:${mailbox.entity}:${item.id}`,
          content: parsed.guestText,
          scenarioTag: "OTA_EMAIL_INGRESS",
          acquisitionSource: `${parsed.channel}_email`,
          pageEntity: mailbox.entity,
          carePhase: parsed.carePhase,
          reservationReference: parsed.reservationReference,
          reservationContext: {
            checkInText: parsed.checkInText,
            checkOutText: parsed.checkOutText,
            specialRequest: parsed.specialRequest,
          },
          providerMessageType: `email_${parsed.eventType}`,
          sourceMailbox: mailbox.googleEmail,
          replyMailbox: mailbox.googleEmail,
          providerThreadId: message.threadId ?? null,
          providerReplyTo: replyTo || null,
          historicalImport: options.backfill === true,
          forceAssistMode: true,
          testerUserId: null,
        });

        if (ingest.duplicate) {
          result.duplicates += 1;
          continue;
        }

        result.drafted += 1;
        const autoSendRequested = automaticReplyGateOpen() && autoReplyChannels().has(parsed.channel);
        const autoSendAllowed = autoSendRequested
          && mailbox.entity !== "cozy"
          && !ingest.reviewId
          && ingest.qaPass === true
          && ingest.usedGenerativeRenderer === true
          && approvedReplyAddress(parsed.channel, replyTo)
          && Boolean(ingest.outboundMessageId);

        if (!autoSendAllowed) {
          result.autoSendHeld += 1;
          continue;
        }

        try {
          const sentId = await sendReply({
            gmail,
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
              externalMessageId: `gmail:${mailbox.entity}:${sentId}`,
              detail: `OTA email relay sent via approved ${parsed.channel} reply address for ${mailbox.entity}`,
            });
          }
          result.autoSent += 1;
        } catch {
          if (ingest.outboundMessageId) {
            await service.markOutboundDelivery(ingest.outboundMessageId, {
              status: "failed",
              detail: `OTA email relay send failed for ${mailbox.entity}`,
            });
          }
          result.failed += 1;
        }
      } catch {
        result.failed += 1;
      }
    }
  }

  return result;
}
