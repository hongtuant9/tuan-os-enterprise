export type AttributionStatus =
  | "DIRECT_VERIFIED"
  | "ASSISTED_VERIFIED"
  | "SELF_REPORTED"
  | "INFERRED"
  | "UNATTRIBUTED"
  | "NEED_VERIFY";

export function canAttributeVerifiedRevenue(input: {
  bookingVerified: boolean;
  revenueVerified: boolean;
}) {
  return input.bookingVerified && input.revenueVerified;
}

export function attributionStatusFor(input: {
  trackedSource?: boolean;
  assistedEvidence?: boolean;
  selfReportedSource?: boolean;
  inferredOnly?: boolean;
  contradictoryEvidence?: boolean;
}) : AttributionStatus {
  if (input.contradictoryEvidence) return "NEED_VERIFY";
  if (input.assistedEvidence && input.trackedSource) return "ASSISTED_VERIFIED";
  if (input.trackedSource) return "DIRECT_VERIFIED";
  if (input.selfReportedSource) return "SELF_REPORTED";
  if (input.inferredOnly) return "INFERRED";
  return "UNATTRIBUTED";
}

export function isBusinessBookingEvent(eventType: string, bookingEvidenceVerified: boolean) {
  return bookingEvidenceVerified && [
    "BOOKING_CONFIRMED",
    "CHECKED_IN",
    "CONSUMED_BOOKING",
  ].includes(eventType.toUpperCase());
}

export function verifiedCac(input: {
  spend: number;
  spendVerified: boolean;
  acquiredCustomers: number;
  acquiredCustomersVerified: boolean;
}) {
  if (!input.spendVerified || !input.acquiredCustomersVerified || input.acquiredCustomers <= 0) return null;
  return input.spend / input.acquiredCustomers;
}

export function verifiedRoas(input: {
  adSpend: number;
  spendVerified: boolean;
  attributedRevenue: number;
  attributedRevenueVerified: boolean;
}) {
  if (!input.spendVerified || !input.attributedRevenueVerified || input.adSpend <= 0) return null;
  return input.attributedRevenue / input.adSpend;
}

export function isRepeatCustomer(input: { verifiedStayCount: number }) {
  return input.verifiedStayCount >= 2;
}
