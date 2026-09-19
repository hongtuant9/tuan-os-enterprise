export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalRequestType = "general" | "master_data_change";

export type Approval = {
  id: string;
  title: string;
  summary: string;
  unit: string;
  requestedBy: string;
  submittedAt: string;
  status: ApprovalStatus;
  requestType: ApprovalRequestType;
  changeKey?: string | null;
  entity?: string | null;
  targetFile?: string | null;
  targetSheet?: string | null;
  targetCell?: string | null;
  currentValue?: string | null;
  proposedValue?: string | null;
  sourceChannel?: string | null;
  evidenceUrl?: string | null;
  severity?: string | null;
  aiRecommendation?: string | null;
  executionStatus?: string | null;
  executionNote?: string | null;
  sourceQueueRow?: number | null;
};
