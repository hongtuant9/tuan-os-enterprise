export type ApprovalStatus = "pending" | "approved" | "rejected";

export type Approval = {
  id: string;
  title: string;
  summary: string;
  unit: string;
  requestedBy: string;
  submittedAt: string;
  status: ApprovalStatus;
};

export const approvals: Approval[] = [
  {
    id: "appr-01",
    title: "Discount 15% for Lavender Homestay long-stay guest",
    summary: "Guest booking 14 nights, requesting loyalty discount before confirming payment.",
    unit: "Hospitality AI",
    requestedBy: "Reception AI",
    submittedAt: "2026-07-09T07:12:00+07:00",
    status: "pending",
  },
  {
    id: "appr-02",
    title: "July marketing spend increase (+8,000,000 VND)",
    summary: "Boost ad budget for Cozy Garden listing after strong CTR this week.",
    unit: "Marketing AI",
    requestedBy: "Marketing AI",
    submittedAt: "2026-07-09T06:40:00+07:00",
    status: "pending",
  },
  {
    id: "appr-03",
    title: "Refund request — Ruby Homestay booking #2291",
    summary: "Guest cancelled due to weather; refund policy allows 70% refund.",
    unit: "Finance AI",
    requestedBy: "Finance AI",
    submittedAt: "2026-07-08T21:05:00+07:00",
    status: "pending",
  },
  {
    id: "appr-04",
    title: "New iSTEAM partner school onboarding",
    summary: "Add Greenfield International School as a new enrollment partner.",
    unit: "iSTEAM AI",
    requestedBy: "iSTEAM AI",
    submittedAt: "2026-07-08T15:30:00+07:00",
    status: "approved",
  },
  {
    id: "appr-05",
    title: "Vendor invoice — cleaning supplies",
    summary: "Monthly recurring invoice from Sach Xanh Supplies for all three properties.",
    unit: "Finance AI",
    requestedBy: "Finance AI",
    submittedAt: "2026-07-07T09:00:00+07:00",
    status: "rejected",
  },
];
