import type { AiOperationTask, ExecutionContext, ExecutionDecision } from "./types";

export function decideExecution(
  task: AiOperationTask,
  context: ExecutionContext,
): ExecutionDecision {
  if (!context.sourceVerified) {
    return {
      allowed: false,
      status: "blocked",
      reason: "SOURCE_NOT_VERIFIED",
    };
  }

  if (context.requiresPasswordOrMfa) {
    return {
      allowed: false,
      status: "waiting_owner",
      reason: "OWNER_AUTH_REQUIRED",
    };
  }

  if (task.mode === "mutation") {
    if (task.approvalLevel === "L0_READ" || task.approvalLevel === "L1_SAFE") {
      return {
        allowed: false,
        status: "blocked",
        reason: "MUTATION_REQUIRES_L2_OR_L3",
      };
    }

    if (!context.approvalApproved || !task.approvalId) {
      return {
        allowed: false,
        status: "waiting_owner",
        reason: "APPROVAL_REQUIRED",
      };
    }

    const criticalMutation =
      task.approvalLevel === "L3_CRITICAL" ||
      context.destructive ||
      context.financial ||
      context.customerCritical;

    if (criticalMutation && !context.ownerPresent) {
      return {
        allowed: false,
        status: "waiting_owner",
        reason: "OWNER_REQUIRED_FOR_CRITICAL_MUTATION",
      };
    }
  }

  if (!context.foundationGatePassed && task.mode === "mutation") {
    return {
      allowed: false,
      status: "blocked",
      reason: "FOUNDATION_GATE_NOT_PASSED",
    };
  }

  if (task.maxAttempts < 1 || task.maxAttempts > 3) {
    return {
      allowed: false,
      status: "blocked",
      reason: "INVALID_RETRY_POLICY",
    };
  }

  if (task.timeoutMs <= 0) {
    return {
      allowed: false,
      status: "blocked",
      reason: "INVALID_TIMEOUT",
    };
  }

  return {
    allowed: true,
    status: "queued",
    reason: "POLICY_PASS",
  };
}
