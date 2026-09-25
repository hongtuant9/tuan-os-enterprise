import type { CustomerCarePhase } from "@/data/ai-receptionist";

export type OtaEmailChannel = "booking" | "agoda" | "airbnb" | "expedia";

export type ParsedReservationContext = {
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestCount: number | null;
  adults: number | null;
  children: number | null;
  roomCount: number | null;
  checkInText: string | null;
  checkOutText: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  specialRequest: string | null;
  propertyName: string | null;
  reservationStatus: "confirmed" | "cancelled" | "unknown";
  source: "ota_guest_relay" | "channel_manager_notification" | "unknown";
};

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
  reservationContext: ParsedReservationContext;
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
    /(?:confirmation number|confirmation no\.?|mã số đặt phòng|reservation(?: id| number)?|booking(?: id| number)?)[\s:#-]*\[?([A-Z0-9-]{6,24})\]?/i,
    /\(([0-9]{6,16})\)\s*$/m,
  ];
  const specific: Record<OtaEmailChannel, RegExp[]> = {
    booking: [
      /(?:mã số đặt phòng|confirmation number|booking number)[\s:#-]*\[?(\d{6,12})\]?/i,
      /[?&]res_id=(\d{6,12})/i,
    ],
    agoda: [
      /(?:agoda booking id|booking id|mã số đặt phòng)[\s:#-]*\[?(\d{6,16})\]?/i,
      /new booking from agoda[^\n]*\((\d{6,16})\)/i,
    ],
    airbnb: [
      /(?:confirmation code|mã xác nhận)[\s:#-]*([A-Z0-9]{8,16})/i,
      /hosting\/thread\/(\d{6,20})/i,
    ],
    expedia: [
      /(?:itinerary|reservation|booking)(?: number| id)?[\s:#-]*\[?([A-Z0-9-]{6,24})\]?/i,
      /new booking from expedia[^\n]*\((\d{6,16})\)/i,
      /[?&]reservationIds=(\d{6,16})/i,
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

function strictBlockValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：]\\s*(?:\\n\\s*)?([^\\n]{1,180})`, "i");
    const match = text.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  return null;
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\b(\d{1,3})\b/);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseDateOnly(value: string | null): string | null {
  if (!value) return null;
  const cleaned = normalize(value)
    .replace(/\s+(?:from|until)\s+\d{1,2}:\d{2}.*$/i, "")
    .replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+/i, "")
    .trim();

  const vi = cleaned.match(/\b(\d{1,2})\s*(?:thg|tháng)\s*(\d{1,2})\s*,?\s*(20\d{2})\b/i);
  if (vi) return `${vi[3]}-${String(Number(vi[2])).padStart(2, "0")}-${String(Number(vi[1])).padStart(2, "0")}`;

  const iso = cleaned.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;

  const dmy = cleaned.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${String(Number(dmy[2])).padStart(2, "0")}-${String(Number(dmy[1])).padStart(2, "0")}`;

  const timestamp = Date.parse(`${cleaned} UTC`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function todayInVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function deriveCarePhase(checkInDate: string | null, checkOutDate: string | null): CustomerCarePhase {
  const today = todayInVietnam();
  if (checkInDate && checkOutDate) {
    if (today < checkInDate) return "pre_service";
    if (today >= checkInDate && today < checkOutDate) return "in_service";
    if (today >= checkOutDate) return "post_service";
  }
  if (checkInDate && today < checkInDate) return "pre_service";
  if (checkOutDate && today >= checkOutDate) return "post_service";
  return "general";
}

function extractContactBlock(text: string): { guestEmail: string | null; guestPhone: string | null } {
  const match = text.match(/(?:^|\n)\s*(?:Guest|Guest name)\s*[:：]\s*(?:\n\s*)?[^\n]+\n([\s\S]{0,500}?)(?=\n\s*(?:Check-in|Nhận phòng)\s*[:：])/i);
  const block = match?.[1] ?? "";
  const emails = [...block.matchAll(/([A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map((item) => item[1]!.trim());
  const preferredEmail = emails.find((email) => !/^cs_suppliers@agoda\.com$/i.test(email)) ?? emails[0] ?? null;
  const phoneLine = block.split("\n")
    .map((line) => line.trim())
    .find((line) => /^\+?[0-9][0-9 ()+-]{6,24}$/.test(line) && !line.includes("@"));
  return {
    guestEmail: preferredEmail,
    guestPhone: phoneLine ? normalize(phoneLine) : null,
  };
}

export function mergeOtaReservationContext(
  base: ParsedReservationContext,
  incoming: ParsedReservationContext,
): ParsedReservationContext {
  const preferIncoming = incoming.source === "channel_manager_notification";
  const pick = <T>(left: T | null, right: T | null): T | null =>
    preferIncoming ? (right ?? left) : (left ?? right);
  return {
    guestName: pick(base.guestName, incoming.guestName),
    guestEmail: pick(base.guestEmail, incoming.guestEmail),
    guestPhone: pick(base.guestPhone, incoming.guestPhone),
    guestCount: pick(base.guestCount, incoming.guestCount),
    adults: pick(base.adults, incoming.adults),
    children: pick(base.children, incoming.children),
    roomCount: pick(base.roomCount, incoming.roomCount),
    checkInText: pick(base.checkInText, incoming.checkInText),
    checkOutText: pick(base.checkOutText, incoming.checkOutText),
    checkInDate: pick(base.checkInDate, incoming.checkInDate),
    checkOutDate: pick(base.checkOutDate, incoming.checkOutDate),
    specialRequest: pick(base.specialRequest, incoming.specialRequest),
    propertyName: pick(base.propertyName, incoming.propertyName),
    reservationStatus: incoming.reservationStatus !== "unknown"
      ? incoming.reservationStatus
      : base.reservationStatus,
    source: preferIncoming ? incoming.source : (base.source !== "unknown" ? base.source : incoming.source),
  };
}

export function hasReservationContext(context: ParsedReservationContext): boolean {
  return Boolean(
    context.guestName
    || context.guestEmail
    || context.guestPhone
    || context.guestCount != null
    || context.roomCount != null
    || context.checkInDate
    || context.checkOutDate
    || context.specialRequest
  );
}

function extractSpecialRequest(text: string): string | null {
  const direct = strictBlockValue(text, ["Special requests?", "Yêu cầu đặc biệt", "Requested"]);
  if (direct && !/^none|n\/a|unspecified$/i.test(direct)) return direct;

  const remarks = text.match(/(?:^|\n)\s*Remarks\s*[:：]\s*\n([\s\S]{1,1200}?)(?=\n\s*[A-Z][A-Z /&-]{3,}\s*(?:\n|:)|$)/i)?.[1] ?? "";
  const items = remarks.split("\n")
    .map((line) => line.replace(/^\s*\+\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^(UNSPECIFIED|Special offers)$/i.test(line))
    .filter((line) => !/^Expedia collects payment/i.test(line));
  return items.length ? items.join("; ").slice(0, 800) : null;
}

function agodaDateRange(text: string): { checkInText: string | null; checkOutText: string | null } {
  const viRange = text.match(/\b(\d{1,2}\s*(?:thg|tháng)\s*\d{1,2}\s*,?\s*20\d{2})\s*[-–]\s*(\d{1,2}\s*(?:thg|tháng)\s*\d{1,2}\s*,?\s*20\d{2})\b/i);
  if (viRange) return { checkInText: normalize(viRange[1]!), checkOutText: normalize(viRange[2]!) };

  const ymdRange = text.match(/\b(20\d{2}[./-]\d{1,2}[./-]\d{1,2})\s*[-–]\s*(20\d{2}[./-]\d{1,2}[./-]\d{1,2})\b/);
  if (ymdRange) return { checkInText: normalize(ymdRange[1]!), checkOutText: normalize(ymdRange[2]!) };

  return { checkInText: null, checkOutText: null };
}

function agodaGuestName(subject: string, body: string): string | null {
  const subjectName = firstMatch(subject, [
    /^Reply from\s+(.+?)\s*\(/i,
    /^Inquiry by\s+(.+?)\s*\(/i,
  ]);
  if (subjectName) return subjectName;

  const primary = body.match(/(?:Tên khách chính\s*[:：]?\s*\n)([^\n]+)\s*\n([^\n]+)/i);
  if (primary?.[1] && primary?.[2]) return `${normalize(primary[1])} ${normalize(primary[2])}`;

  return firstMatch(body, [
    /(?:Thắc mắc mới từ|Tin nhắn mới từ)\s+([^\n]{2,120})/i,
  ]);
}

function normalizeAgodaGuestName(value: string | null): string | null {
  if (!value) return null;
  return normalize(value.replace(/\n+/g, " ")).replace(/\s{2,}/g, " ").trim() || null;
}

function agodaGuestCounts(text: string): { guestCount: number | null; adults: number | null; children: number | null; roomCount: number | null } {
  const adults = parsePositiveInt(firstMatch(text, [/(\d+)\s*(?:người lớn|adults?)/i]));
  const children = parsePositiveInt(firstMatch(text, [/(\d+)\s*(?:trẻ em|children|child)/i]));
  const roomCount = parsePositiveInt(firstMatch(text, [/(\d+)\s*(?:phòng|rooms?)/i]));
  return {
    guestCount: adults != null ? adults + (children ?? 0) : null,
    adults,
    children,
    roomCount,
  };
}

export function parseOtaReservationContext(input: {
  from: string;
  replyTo?: string | null;
  subject: string;
  body?: string | null;
  snippet?: string | null;
}): { channel: OtaEmailChannel | null; reservationReference: string | null; context: ParsedReservationContext } {
  const body = normalize(input.body || input.snippet || "");
  const subject = normalize(input.subject || "");
  const replyTo = normalize(input.replyTo || "");
  const channel = channelFrom(input.from || "", subject, replyTo);
  const combined = `${subject}\n${body}`;
  const ref = reservationReference(channel, combined);

  const rawGuestName = strictBlockValue(body, ["Guest name", "Guest"]);
  const genericGuestName = rawGuestName
    ? rawGuestName.replace(/\s+\([^()]{2,60}\)\s*$/, "").trim()
    : firstMatch(body, [
        /(?:new message from a guest\s*\n+)([^\n]{2,120})\s+(?:said|wrote)\s*:/i,
        /(?:thắc mắc mới từ|inquiry by)\s+([^\n]{2,120})/i,
      ]);
  const guestName = channel === "agoda"
    ? normalizeAgodaGuestName(agodaGuestName(subject, body) || genericGuestName)
    : genericGuestName;

  const genericCheckInText = strictBlockValue(body, ["Check-in", "Nhận phòng"]);
  const genericCheckOutText = strictBlockValue(body, ["Check-out", "Trả phòng"]);
  const agodaRange = channel === "agoda" ? agodaDateRange(body) : { checkInText: null, checkOutText: null };
  const rawCheckInText = channel === "agoda" ? (agodaRange.checkInText ?? genericCheckInText) : genericCheckInText;
  const rawCheckOutText = channel === "agoda" ? (agodaRange.checkOutText ?? genericCheckOutText) : genericCheckOutText;
  const checkInDate = parseDateOnly(rawCheckInText);
  const checkOutDate = parseDateOnly(rawCheckOutText);
  const checkInText = checkInDate ? rawCheckInText : null;
  const checkOutText = checkOutDate ? rawCheckOutText : null;

  const totalGuestValue = strictBlockValue(body, ["Number of guests", "Total guests", "Số khách"]);
  const roomValue = strictBlockValue(body, ["Number of rooms booked", "Total rooms", "Rooms booked"]);
  const agodaCounts = channel === "agoda"
    ? agodaGuestCounts(body)
    : { guestCount: null, adults: null, children: null, roomCount: null };
  const adults = agodaCounts.adults ?? parsePositiveInt(totalGuestValue?.match(/(\d+)\s*adults?/i)?.[0] ?? null);
  const children = agodaCounts.children ?? parsePositiveInt(totalGuestValue?.match(/(\d+)\s*(?:children|child)/i)?.[0] ?? null);
  const guestCount = agodaCounts.guestCount ?? parsePositiveInt(totalGuestValue);
  const roomCount = agodaCounts.roomCount ?? parsePositiveInt(roomValue);
  const contact = extractContactBlock(body);
  const propertyName = strictBlockValue(body, ["Property name"]);
  const source = /CONGRATULATIONS! You(?:’|')ve received a new booking|kvhotel-cm\.com|KiotViet Corporation/i.test(combined)
    ? "channel_manager_notification"
    : isVerifiedGuestRelay(channel, { from: input.from || "", replyTo, subject, body })
      ? "ota_guest_relay"
      : "unknown";

  const reservationStatus: ParsedReservationContext["reservationStatus"] =
    /booking cancellation|this booking was canceled|this booking was cancelled|status:\s*cancelled/i.test(combined)
      ? "cancelled"
      : /CONGRATULATIONS! You(?:’|')ve received a new booking/i.test(combined)
        ? "confirmed"
        : "unknown";

  return {
    channel,
    reservationReference: ref,
    context: {
      guestName: guestName || null,
      guestEmail: contact.guestEmail,
      guestPhone: contact.guestPhone,
      guestCount,
      adults,
      children,
      roomCount,
      checkInText,
      checkOutText,
      checkInDate,
      checkOutDate,
      specialRequest: extractSpecialRequest(body),
      propertyName,
      reservationStatus,
      source,
    },
  };
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
  const parsedContext = parseOtaReservationContext(input);
  const channel = parsedContext.channel;
  const combined = `${subject}\n${body}`;
  const relayVerified = isVerifiedGuestRelay(channel, {
    from: input.from || "",
    replyTo,
    subject,
    body,
  });
  const guestText = relayVerified ? extractGuestText(channel, body) : null;
  const eventType = classifyGuestMessage(guestText);
  const ref = parsedContext.reservationReference ?? reservationReference(channel, combined);
  const actionable = Boolean(channel && relayVerified && guestText);
  const carePhase = deriveCarePhase(parsedContext.context.checkInDate, parsedContext.context.checkOutDate);

  return {
    channel,
    reservationReference: ref,
    eventType,
    actionable,
    relayVerified,
    guestText,
    checkInText: parsedContext.context.checkInText,
    checkOutText: parsedContext.context.checkOutText,
    specialRequest: parsedContext.context.specialRequest,
    carePhase,
    reservationContext: parsedContext.context,
    reason: !channel
      ? "unrecognized_ota_sender"
      : !relayVerified
        ? "not_verified_guest_relay"
        : !guestText
          ? "guest_relay_text_not_extracted"
          : "verified_guest_message",
  };
}
