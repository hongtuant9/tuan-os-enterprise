export type AiOpsAgent =
  | "channel_auditor"
  | "website_agent"
  | "google_ads_agent"
  | "computer_operator"
  | "manager_agent";

export type ApprovalLevel = "L0_READ" | "L1_SAFE" | "L2_APPROVAL" | "L3_CRITICAL";

export type OperationMode = "read_only" | "shadow" | "mutation";

export type OperationStatus =
  | "queued"
  | "running"
  | "waiting_owner"
  | "blocked"
  | "succeeded"
  | "failed_safe";

export interface AiOperationTask {
  taskId: string;
  agent: AiOpsAgent;
  mode: OperationMode;
  approvalLevel: ApprovalLevel;
  target: string;
  action: string;
  sourceOfTruth: string;
  approvalId?: string;
  decisionId?: string;
  idempotencyKey: string;
  timeoutMs: number;
  maxAttempts: number;
  rollbackPlan?: string;
}

export interface ExecutionContext {
  foundationGatePassed: boolean;
  sourceVerified: boolean;
  approvalApproved: boolean;
  ownerPresent: boolean;
  requiresPasswordOrMfa: boolean;
  destructive: boolean;
  financial: boolean;
  customerCritical: boolean;
}

export interface ExecutionDecision {
  allowed: boolean;
  status: Extract<OperationStatus, "queued" | "waiting_owner" | "blocked">;
  reason: string;
}

export interface OperationEvidence {
  taskId: string;
  startedAt: string;
  finishedAt?: string;
  source: string;
  action: string;
  result?: string;
  beforeRef?: string;
  afterRef?: string;
  errorCode?: string;
  secretFree: boolean;
}
