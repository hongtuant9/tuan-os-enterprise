import type { AiOperationTask, ExecutionContext, ExecutionDecision } from "./types";

export function decideExecution(
  task: AiOperationTask,
  context: ExecutionContext,
): ExecutionDecision {
  if (!context.sourceVerified) {
    return { allowed: false, status: "blocked", reason: "SOURCE_NOT_VERIFIED" };
  }

  if (context.requiresPasswordOrMfa) {
    return { allowed: false, status: "waiting_owner", reason: "OWNER_AUTH_REQUIRED" };
  }

  if (task.mode === "mutation") {
    if (task.approvalLevel === "L0_READ" || task.approvalLevel === "L1_SAFE") {
      return { allowed: false, status: "blocked", reason: "MUTATION_REQUIRES_L2_OR_L3" };
    }

    // Owner directive 2026-09-16: only financial/cost/budget/payment-related
    // mutations require explicit owner approval. Non-financial technical and
    // security work is handled internally with evidence + rollback/read-back.
    if (context.financial && (!context.approvalApproved || !task.approvalId || !context.ownerPresent)) {
      return { allowed: false, status: "waiting_owner", reason: "OWNER_REQUIRED_FOR_FINANCIAL_MUTATION" };
    }

    // Destructive work still fails closed without a rollback plan. This is an
    // internal safety requirement, not an owner-approval gate.
    if (context.destructive && !task.rollbackPlan) {
      return { allowed: false, status: "blocked", reason: "DESTRUCTIVE_ACTION_REQUIRES_ROLLBACK_PLAN" };
    }
  }

  if (!context.foundationGatePassed && task.mode === "mutation") {
    return { allowed: false, status: "blocked", reason: "FOUNDATION_GATE_NOT_PASSED" };
  }

  if (task.maxAttempts < 1 || task.maxAttempts > 3) {
    return { allowed: false, status: "blocked", reason: "INVALID_RETRY_POLICY" };
  }

  if (task.timeoutMs <= 0) {
    return { allowed: false, status: "blocked", reason: "INVALID_TIMEOUT" };
  }

  return { allowed: true, status: "queued", reason: "POLICY_PASS" };
}
