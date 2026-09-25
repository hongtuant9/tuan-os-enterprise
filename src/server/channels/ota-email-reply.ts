import "server-only";
import { google } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import type { GmailMailboxEntity } from "@/server/integrations/google/gmail-mailboxes";

type OtaRelayChannel = "booking" | "agoda" | "airbnb" | "expedia";

function replyGateOpen(): boolean {
  return process.env.TCE_OTA_EMAIL_REPLY_GATE_APPROVED?.trim().toLowerCase() === "true";
}

function approvedReplyAddress(channel: OtaRelayChannel, address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (channel === "booking") return normalized.endsWith("@guest.booking.com");
  if (channel === "agoda") {
    return normalized.endsWith("@agoda-messaging.com") && !normalized.startsWith("notifications@");
  }
  if (channel === "airbnb") return normalized.endsWith("@reply.airbnb.com");
  // Expedia relay remains closed until its reply round-trip UAT passes.
  return false;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendManualOtaReply(input: {
  entity: GmailMailboxEntity;
  channel: OtaRelayChannel;
  to: string;
  body: string;
  reservationReference?: string | null;
}): Promise<{ externalMessageId: string; fromMailbox: string }> {
  if (!replyGateOpen()) {
    throw new Error("Cổng gửi OTA đang khóa. Chỉ được nhận dữ liệu và kiểm thử nội bộ.");
  }
  if (!input.body.trim()) throw new Error("Nội dung trả lời không được để trống.");
  if (!approvedReplyAddress(input.channel, input.to)) {
    throw new Error("Địa chỉ relay của OTA chưa được xác minh hoặc kênh này chưa PASS UAT gửi.");
  }

  const mailbox = await new GoogleOAuthTokenStore().getAuthorizedClientForGmailEntity(input.entity);
  const gmail = google.gmail({ version: "v1", auth: mailbox.auth });
  const ref = input.reservationReference?.trim();
  const subject = `Re: ${input.channel.toUpperCase()} guest message${ref ? ` · ${ref}` : ""}`;
  const raw = [
    `To: ${input.to.trim()}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body.trim(),
  ].join("\r\n");

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeBase64Url(raw) },
  });
  if (!data.id) throw new Error("Gmail không trả về message id sau khi gửi.");

  return {
    externalMessageId: data.id,
    fromMailbox: mailbox.googleEmail,
  };
}
