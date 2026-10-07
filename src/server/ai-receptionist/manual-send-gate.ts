export type ManualSendGateInput = {
  enabled: boolean;
  channel: string;
  replyTo: string;
  replyMailboxPresent: boolean;
  threadIdPresent: boolean;
  mailboxPurpose?: "ota_guest_care" | "direct_guest_care" | null;
  mailboxMatchesCanonical?: boolean;
};

export function evaluateManualSendGate(input: ManualSendGateInput): { ready: boolean; reason: string } {
  if (!input.enabled) {
    return { ready: false, reason: "Manual Send chưa được bật ở runtime; cần mở cổng sau khi QA/approval đạt yêu cầu." };
  }

  const replyTo = input.replyTo.trim().toLowerCase();
  if (!input.replyMailboxPresent || !replyTo || !input.threadIdPresent) {
    return { ready: false, reason: "Thiếu địa chỉ trả lời hoặc Gmail thread đã xác minh; cần đồng bộ lại email nguồn trước khi gửi." };
  }

  if (input.channel === "email") {
    const validDirectAddress =
      /^[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(replyTo)
      && !/^(?:no-?reply|notifications?|mailer-daemon|postmaster)@/i.test(replyTo);
    const directReady =
      input.mailboxPurpose === "direct_guest_care"
      && input.mailboxMatchesCanonical === true
      && validDirectAddress;
    return directReady
      ? { ready: true, reason: "Manual Send sẵn sàng qua Gmail chăm sóc khách trực tiếp." }
      : { ready: false, reason: "Email trực tiếp chưa đạt mailbox/reply-address gate." };
  }

  const approved =
    (input.channel === "booking" && replyTo.endsWith("@guest.booking.com"))
    || (input.channel === "agoda" && replyTo.endsWith("@agoda-messaging.com") && !replyTo.startsWith("notifications@"))
    || (input.channel === "airbnb" && replyTo.endsWith("@reply.airbnb.com"))
    || (input.channel === "expedia" && replyTo.endsWith("@m.expediapartnercentral.com"));

  return approved
    ? { ready: true, reason: "Manual Send sẵn sàng qua OTA email relay." }
    : { ready: false, reason: "Kênh/relay address chưa đạt allowlist Manual Send." };
}
