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
