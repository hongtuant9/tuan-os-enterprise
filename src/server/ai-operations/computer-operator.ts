import type { AiOperationTask, ExecutionContext } from "./types";
import { decideExecution } from "./policy";

export type OperatorTransport = "api" | "terminal" | "browser_dom" | "gui";

export interface OperatorEnvelope {
  task: AiOperationTask;
  context: ExecutionContext;
  preferredTransports: OperatorTransport[];
  checkpointRequired: boolean;
  readBackRequired: boolean;
}

export interface OperatorPlan {
  taskId: string;
  status: "ready" | "blocked" | "waiting_owner";
  transport?: OperatorTransport;
  maxAttempts: number;
  timeoutMs: number;
  checkpointRequired: boolean;
  readBackRequired: boolean;
  reason: string;
}

const transportOrder: OperatorTransport[] = ["api", "terminal", "browser_dom", "gui"];
export function buildOperatorPlan(envelope: OperatorEnvelope): OperatorPlan {
  const decision = decideExecution(envelope.task, envelope.context);
  if (!decision.allowed) {
    return {
      taskId: envelope.task.taskId,
      status: decision.status === "waiting_owner" ? "waiting_owner" : "blocked",
      maxAttempts: envelope.task.maxAttempts,
      timeoutMs: envelope.task.timeoutMs,
      checkpointRequired: envelope.checkpointRequired,
      readBackRequired: envelope.readBackRequired,
      reason: decision.reason,
    };
  }

  const allowedTransports = transportOrder.filter((transport) => envelope.preferredTransports.includes(transport));
  const transport = allowedTransports[0];
  if (!transport) {
    return {
      taskId: envelope.task.taskId,
      status: "blocked",
      maxAttempts: envelope.task.maxAttempts,
      timeoutMs: envelope.task.timeoutMs,
      checkpointRequired: envelope.checkpointRequired,
      readBackRequired: envelope.readBackRequired,
      reason: "No approved execution transport is available.",
    };
  }
  return {
    taskId: envelope.task.taskId,
    status: "ready",
    transport,
    maxAttempts: Math.max(1, Math.min(envelope.task.maxAttempts, 3)),
    timeoutMs: Math.max(1_000, envelope.task.timeoutMs),
    checkpointRequired: envelope.checkpointRequired,
    readBackRequired: envelope.readBackRequired,
    reason: `Execution allowed via ${transport}. API/Terminal/DOM/GUI priority preserved.`,
  };
}

export function requiresManualTakeover(envelope: OperatorEnvelope) {
  return envelope.context.requiresPasswordOrMfa ||
    (envelope.context.financial && !envelope.context.ownerPresent) ||
    (envelope.context.destructive && !envelope.task.rollbackPlan);
}
