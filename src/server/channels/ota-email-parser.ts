import type { CustomerCarePhase } from "@/data/ai-receptionist";

export type OtaEmailChannel = "booking" | "agoda" | "airbnb" | "expedia";

export type ParsedOtaEmail = {
  channel: OtaEmailChannel | null;
  reservationReference: string | null;
  eventType: "guest_message" | "guest_request" | "booking_confirmation" | "arrival_reminder" | "review" | "other";
  actionable: boolean;
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

function channelFrom(from: string, subject: string): OtaEmailChannel | null {
  const haystack = `${from} ${subject}`.toLowerCase();
  if (haystack.includes("booking.com") || haystack.includes("@guest.booking.com") || haystack.includes("@property.booking.com")) return "booking";
  if (haystack.includes("agoda")) return "agoda";
  if (haystack.includes("airbnb")) return "airbnb";
  if (haystack.includes("expedia") || haystack.includes("expediapartnercentral")) return "expedia";
  return null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
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
      /(?:booking\.com)[^\n()]{0,80}\((\d{6,12})\)/i,
    ],
    agoda: [
      /agoda booking id[\s:#-]*(\d{6,16})/i,
      /(?:booking id|mã số đặt phòng)[\s:#-]*(\d{6,16})/i,
    ],
    airbnb: [
      /(?:confirmation code|mã xác nhận)[\s:#-]*([A-Z0-9]{8,16})/i,
      /\b(H[A-Z0-9]{8,15})\b/,
      /hosting\/thread\/(\d{6,20})/i,
    ],
    expedia: [
      /(?:itinerary|reservation|booking)(?: number| id)?[\s:#-]*([A-Z0-9-]{6,24})/i,
      /(?:expedia|affiliate network)[^\n()]{0,100}\((\d{6,16})\)/i,
      /[?&]cid=([a-f0-9-]{20,64})/i,
    ],
  };
  return firstMatch(text, [...specific[channel], ...common]);
}

function classify(subject: string, body: string): ParsedOtaEmail["eventType"] {
  const text = `${subject}\n${body.slice(0, 2500)}`.toLowerCase();
  if (/(new review|nhận xét mới|đánh giá mới)/i.test(text)) return "review";
  if (/(confirmed|đã xác nhận đặt phòng|booking id|new booking from|reservation confirmed)/i.test(text)) return "booking_confirmation";
  if (/(sắp đến|arrival|arriving|check-in reminder|nhắc nhở đặt phòng)/i.test(text)) return "arrival_reminder";
  if (/(special request|request|requested:|yêu cầu|needs something|subject to availability|thay đổi ngày)/i.test(text)) return "guest_request";
  if (/(message|tin nhắn|đã nhắn|said:|reply now|về: đặt phòng|người đặt|gửi tin nhắn cho quý vị|thắc mắc mới từ)/i.test(text)) return "guest_message";
  return "other";
}

function extractGuestText(subject: string, body: string, eventType: ParsedOtaEmail["eventType"]): string | null {
  const text = normalize(body);
  if (!text) return null;
  if (eventType !== "guest_message" && eventType !== "guest_request") return null;

  const bounded = [
    /(?:đã nhắn|said|wrote|message from guest|tin nhắn mới từ khách)\s*[:：]\s*([\s\S]{1,1800}?)(?=\n\s*(?:đồng ý|subject to availability|reservation details|chi tiết đặt phòng|©|$))/i,
    /(?:gửi tin nhắn cho quý vị)\s*["“]\s*([\s\S]{1,1800}?)\s*["”](?=\s*(?:\n|$))/i,
    /(?:người đặt)\s*\n+([\s\S]{1,1800}?)(?=\n\s*(?:được dịch tự động|\[trả lời\]|nhận phòng|check-in|$))/i,
    /(?:thắc mắc mới từ[^\n]*\n(?:[^\n]*\n){0,3})([\s\S]{1,1800}?)(?=\n\s*(?:nội dung trên được tự động dịch|did you know|replying to this email|$))/i,
    /(?:requested:)\s*([^\n]{1,800})/i,
  ];
  for (const marker of bounded) {
    const match = text.match(marker);
    if (match?.[1]) {
      return normalize(match[1]).slice(0, 1800);
    }
  }

  return null;
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
  let checkInText = labeledValue(text, ["check-in", "nhận phòng"]);
  let checkOutText = labeledValue(text, ["check-out", "trả phòng"]);

  if (!checkInText || !checkOutText) {
    const agodaStay = text.match(/\n\s*([^\n]{3,60}?)\s+-\s+([^\n]{3,60}?)\s*\n/i);
    if (agodaStay) {
      checkInText = checkInText ?? normalize(agodaStay[1]);
      checkOutText = checkOutText ?? normalize(agodaStay[2]);
    }
  }

  return { checkInText, checkOutText };
}

function specialRequest(text: string): string | null {
  const match = text.match(/(?:requested|đã yêu cầu)\s*[:：]\s*([^\n]{2,800})/i);
  return match?.[1] ? normalize(match[1]) : null;
}

function carePhase(eventType: ParsedOtaEmail["eventType"]): CustomerCarePhase {
  if (eventType === "arrival_reminder" || eventType === "booking_confirmation") return "pre_service";
  if (eventType === "review") return "post_service";
  return "general";
}

export function parseOtaEmail(input: {
  from: string;
  subject: string;
  body?: string | null;
  snippet?: string | null;
}): ParsedOtaEmail {
  const body = normalize(input.body || input.snippet || "");
  const subject = normalize(input.subject || "");
  const channel = channelFrom(input.from || "", subject);
  const combined = `${subject}\n${body}`;
  const eventType = classify(subject, body);
  const ref = reservationReference(channel, combined);
  const guestText = extractGuestText(subject, body, eventType);
  const dates = bookingDates(combined);
  const request = specialRequest(combined);
  const actionable = Boolean(channel && ref && guestText && (eventType === "guest_message" || eventType === "guest_request"));

  return {
    channel,
    reservationReference: ref,
    eventType,
    actionable,
    guestText,
    checkInText: dates.checkInText,
    checkOutText: dates.checkOutText,
    specialRequest: request,
    carePhase: carePhase(eventType),
    reason: !channel
      ? "unrecognized_ota_sender"
      : !ref
        ? "reservation_reference_missing"
        : !guestText
          ? "no_actionable_guest_message"
          : "actionable_guest_message",
  };
}
