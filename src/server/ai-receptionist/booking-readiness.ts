export type BookingReadinessInput = {
  guestContact: string | null;
  roomClassId: string | null;
  quotedPrice: number | null;
  priceSource: string | null;
  firstAvailabilityEvidence: unknown;
  writeEnabled: boolean;
};

export type BookingReadiness = {
  readyForPilotWrite: boolean;
  blockers: string[];
};

export function evaluateBookingReadiness(input: BookingReadinessInput): BookingReadiness {
  const blockers: string[] = [];
  if (!input.guestContact?.trim()) blockers.push("missing_guest_contact");
  if (!input.roomClassId?.trim()) blockers.push("missing_room_class");
  if (input.quotedPrice == null || input.quotedPrice <= 0) blockers.push("missing_verified_price");
  if (!input.priceSource?.trim()) blockers.push("missing_price_source");
  if (!input.firstAvailabilityEvidence) blockers.push("missing_first_availability_evidence");
  if (!input.writeEnabled) blockers.push("a2_write_gate_off");
  return { readyForPilotWrite: blockers.length === 0, blockers };
}
