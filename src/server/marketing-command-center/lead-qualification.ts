export type LeadStatus = "INQUIRY" | "LEAD" | "QUALIFIED_LEAD" | "BOOKING_INTENT";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function deriveCommercialLead(input: {
  primaryIntent?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  guestCount?: unknown;
  propertyHint?: unknown;
}): { status: LeadStatus; evidence: Record<string, unknown> } {
  const primaryIntent = text(input.primaryIntent).toLowerCase();
  const commercial = ["stay", "eat", "experience", "explore"].includes(primaryIntent);
  if (!commercial) return { status: "INQUIRY", evidence: { reason: "no_commercial_intent" } };

  if (primaryIntent !== "stay") {
    return {
      status: "LEAD",
      evidence: { rule: "explicit_commercial_intent", primary_intent: primaryIntent },
    };
  }

  const checkIn = text(input.checkIn);
  const checkOut = text(input.checkOut);
  const guestCount = positiveInt(input.guestCount);
  const propertyHint = text(input.propertyHint);
  const stayQualified = Boolean(checkIn && checkOut && guestCount);
  const bookingIntent = Boolean(stayQualified && propertyHint);

  if (bookingIntent) {
    return {
      status: "BOOKING_INTENT",
      evidence: {
        rule: "stay_request_with_dates_guests_property",
        primary_intent: primaryIntent,
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guestCount,
        property_hint: propertyHint,
      },
    };
  }
  if (stayQualified) {
    return {
      status: "QUALIFIED_LEAD",
      evidence: {
        rule: "stay_request_with_dates_guests",
        primary_intent: primaryIntent,
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guestCount,
      },
    };
  }
  return {
    status: "LEAD",
    evidence: { rule: "explicit_stay_intent", primary_intent: primaryIntent },
  };
}
