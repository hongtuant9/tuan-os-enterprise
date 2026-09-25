import type { CustomerCarePhase } from "@/data/ai-receptionist";

export type OtaEmailChannel = "booking" | "agoda" | "airbnb" | "expedia";

export type ParsedOtaEmail = {
  channel: OtaEmailChannel | null;
  reservationReference: string | null;
  eventType: "guest_message" | "guest_request" | "other";
  actionable: boolean;
  relayVerified: boolean;
  guestText: string | null;
  checkInText: string | null;
  checkOutText: string | null;
  specialRequest: string | null;
  carePhase: CustomerCarePhase;
  reason: string;
};

function normalize(value: string): string {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function channelFrom(from: string, subject: string, replyTo: string): OtaEmailChannel | null {
  const haystack = `${from} ${subject} ${replyTo}`.toLowerCase();
  if (haystack.includes("booking.com") || haystack.includes("@guest.booking.com")) return "booking";
  if (haystack.includes("agoda")) return "agoda";
  if (haystack.includes("airbnb")) return "airbnb";
  if (haystack.includes("expedia") || haystack.includes("expediapartnercentral")) return "expedia";
  return null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return null;
}

function reservationReference(channel: OtaEmailChannel | null, text: string): string | null {
  if (!channel) return null;
  const common = [
    /(?:confirmation number|confirmation no\.?|mã số đặt phòng|reservation(?: id| number)?|booking(?: id| number)?)[\s:#-]*([A-Z0-9-]{6,24})/i,
  ];
  const specific: Record<OtaEmailChannel, RegExp[]> = {
    booking: [
      /(?:mã số đặt phòng|confirmation number)[\s:#-]*(\d{6,12})/i,
      /[?&]res_id=(\d{6,12})/i,
    ],
    agoda: [
      /(?:agoda booking id|booking id|mã số đặt phòng)[\s:#-]*(\d{6,16})/i,
    ],
    airbnb: [
      /(?:confirmation code|mã xác nhận)[\s:#-]*([A-Z0-9]{8,16})/i,
      /hosting\/thread\/(\d{6,20})/i,
    ],
    expedia: [
      /(?:itinerary|reservation|booking)(?: number| id)?[\s:#-]*([A-Z0-9-]{6,24})/i,
      /[?&]cid=([a-f0-9-]{20,64})/i,
    ],
  };
  return firstMatch(text, [...specific[channel], ...common]);
}

function isVerifiedGuestRelay(
  channel: OtaEmailChannel | null,
  input: { from: string; replyTo: string; subject: string; body: string },
): boolean {
  if (!channel) return false;
  const from = input.from.toLowerCase();
  const replyTo = input.replyTo.toLowerCase();
  const text = `${input.subject}\n${input.body.slice(0, 6000)}`.toLowerCase();

  if (channel === "booking") {
    const relayAddress = replyTo.endsWith("@guest.booking.com") || from.includes("@guest.booking.com");
    const template = /(please type your reply above this line|vui lòng nhập phản hồi phía trên dòng này|new message from a guest|tin nhắn mới từ khách|đã nhắn:)/i.test(text);
    return relayAddress && template;
  }

  if (channel === "agoda") {
    const relayAddress = replyTo.endsWith("@agoda-messaging.com") && !replyTo.startsWith("notifications@");
    const template = /(thắc mắc mới từ|inquiry by|reply from|replying to this email.*sent directly to the guest|khách hiện tại)/i.test(text);
    return relayAddress && template;
  }

  if (channel === "airbnb") {
    const relayAddress = replyTo.endsWith("@reply.airbnb.com");
    const template = /(hosting\/thread\/|bạn cũng có thể phản hồi bằng cách trả lời trực tiếp email này|you can also reply directly to this email)/i.test(text);
    return relayAddress && template;
  }

  const relayAddress = replyTo.endsWith("@m.expediapartnercentral.com");
  const template = /(sent you a message|tin nhắn từ .*khách của expedia|gửi tin nhắn cho quý vị|messagecenter|\btrả lời\b|\breply\b)/i.test(text);
  return relayAddress && template;
}

function extractGuestText(channel: OtaEmailChannel | null, body: string): string | null {
  if (!channel) return null;
  const text = normalize(body);
  if (!text) return null;

  const patterns: Record<OtaEmailChannel, RegExp[]> = {
    booking: [
      /(?:đã nhắn|said|wrote|message from guest|tin nhắn mới từ khách)\s*[:：]\s*([\s\S]{1,1800}?)(?=\n\s*(?:\[?trả lời|\[?reply|đồng ý|subject to availability|reservation details|chi tiết đặt phòng|©|$))/i,
    ],
    agoda: [
      /(?:mã số đặt phòng|booking id)\s*[:：]?\s*[A-Z0-9-]{6,24}\s*\n+([\s\S]{1,1800}?)(?=\n\s*(?:nội dung trên được tự động dịch|did you know|replying to this email|$))/i,
      /(?:thắc mắc mới từ[^\n]*\n[\s\S]{0,900}?)(?:mã số đặt phòng|booking id)\s*[:：]?\s*[A-Z0-9-]{6,24}\s*\n+([\s\S]{1,1800}?)(?=\n\s*(?:nội dung trên được tự động dịch|did you know|replying to this email|$))/i,
      /(?:khách hiện tại)[\s\S]{0,700}?(?:mã số đặt phòng|booking id)\s*[:：]?\s*[A-Z0-9-]{6,24}\s+([\s\S]{1,1800}?)(?=(?:\n\s*(?:nội dung trên được tự động dịch|did you know|replying to this email))|$)/i,
    ],
    airbnb: [
      /(?:người đặt|guest|booker)\s*\n+([\s\S]{1,1800}?)(?=\n\s*(?:được dịch tự động|automatically translated|\[?trả lời|\[?reply|nhận phòng|check-in|$))/i,
    ],
    expedia: [
      /(?:sent you a message|gửi tin nhắn cho quý vị)\s*\n+\s*["“]([\s\S]{1,1800}?)["”]\s*(?=\n+\s*(?:\[?reply|\[?trả lời|$))/i,
      /(?:tin nhắn từ[^\n]*khách của expedia[\s\S]{0,1000}?)["“]([\s\S]{1,1800}?)["”]\s*(?=\n+\s*(?:\[?reply|\[?trả lời|$))/i,
    ],
  };

  return firstMatch(text, patterns[channel])?.slice(0, 1800) ?? null;
}

function classifyGuestMessage(guestText: string | null): ParsedOtaEmail["eventType"] {
  if (!guestText) return "other";
  return /(request|requested|yêu cầu|có thể|could you|can i|can we|would it be possible|thắc mắc)/i.test(guestText)
    ? "guest_request"
    : "guest_message";
}

function labeledValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const pattern = new RegExp(`(?:${label})\\s*[:：]?\\s*\\n?\\s*([^\\n]{3,120})`, "i");
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return null;
}

function bookingDates(text: string): { checkInText: string | null; checkOutText: string | null } {
  return {
    checkInText: labeledValue(text, ["check-in", "nhận phòng"]),
    checkOutText: labeledValue(text, ["check-out", "trả phòng"]),
  };
}

function specialRequest(text: string): string | null {
  const match = text.match(/(?:requested|đã yêu cầu)\s*[:：]\s*([^\n]{2,800})/i);
  return match?.[1] ? normalize(match[1]) : null;
}

export function parseOtaEmail(input: {
  from: string;
  replyTo?: string | null;
  subject: string;
  body?: string | null;
  snippet?: string | null;
}): ParsedOtaEmail {
  const body = normalize(input.body || input.snippet || "");
  const subject = normalize(input.subject || "");
  const replyTo = normalize(input.replyTo || "");
  const channel = channelFrom(input.from || "", subject, replyTo);
  const combined = `${subject}\n${body}`;
  const relayVerified = isVerifiedGuestRelay(channel, {
    from: input.from || "",
    replyTo,
    subject,
    body,
  });
  const guestText = relayVerified ? extractGuestText(channel, body) : null;
  const eventType = classifyGuestMessage(guestText);
  const ref = reservationReference(channel, combined);
  const dates = bookingDates(combined);
  const request = specialRequest(combined);
  const actionable = Boolean(channel && relayVerified && guestText);

  return {
    channel,
    reservationReference: ref,
    eventType,
    actionable,
    relayVerified,
    guestText,
    checkInText: dates.checkInText,
    checkOutText: dates.checkOutText,
    specialRequest: request,
    carePhase: "general",
    reason: !channel
      ? "unrecognized_ota_sender"
      : !relayVerified
        ? "not_verified_guest_relay"
        : !guestText
          ? "guest_relay_text_not_extracted"
          : "verified_guest_message",
  };
}
