import type { AiOpsAgent, OperationStatus } from "./types";

export type AuthorityState = "verified" | "stale" | "unavailable";

export interface AuthoritySnapshot {
  authority: "TASK-001" | "APPROVAL-001" | "L3" | "RUNTIME";
  state: AuthorityState;
  checkedAt: string;
  lastUpdatedAt?: string;
  note?: string;
}

export interface ManagerWorkItem {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2" | "P3";
  status: string;
  blocker?: string;
  dependency?: string;
  nextAction?: string;
  dueDate?: string;
  executionGate?: string;
  owner?: string;
  updatedAt?: string;
  approvalRequired?: boolean;
  approvalId?: string;
  approvalResolved?: boolean;
  pendingCeoApproval?: boolean;
  approvalDecision?: "approved" | "rejected" | "pending" | "unknown";
  needsCeoSupport?: boolean;
  ceoSupportReason?: string;
  ceoSupportAction?: string;
  ceoSupportTiming?: string;
  resolutionOwner?: string;
  agent: AiOpsAgent;
}

export interface ManagerBrief {
  mode: "shadow";
  status: OperationStatus;
  generatedAt: string;
  sourceAuthority: "GOOGLE_DRIVE";
  canMutate: false;
  staleAuthorities: string[];
  blockedItems: ManagerWorkItem[];
  waitingItems: ManagerWorkItem[];
  systemIssueItems: ManagerWorkItem[];
  nextItems: ManagerWorkItem[];
  summary: string;
}

const priorityRank: Record<ManagerWorkItem["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function isWaitingStatus(status: string) {
  return ["HOLD", "WAITING", "PENDING"].includes(status);
}

export function buildManagerBrief(
  items: ManagerWorkItem[],
  authorities: AuthoritySnapshot[],
  generatedAt = new Date().toISOString(),
): ManagerBrief {
  const staleAuthorities = authorities
    .filter((source) => source.state !== "verified")
    .map((source) => source.authority);

  const now = Date.parse(generatedAt);
  const dueRank = (item: ManagerWorkItem) => {
    if (!item.dueDate) return Number.POSITIVE_INFINITY;
    const due = Date.parse(item.dueDate);
    return Number.isFinite(due) ? due : Number.POSITIVE_INFINITY;
  };
  const updatedRank = (item: ManagerWorkItem) => {
    if (!item.updatedAt) return Number.POSITIVE_INFINITY;
    const updated = Date.parse(item.updatedAt);
    return Number.isFinite(updated) ? updated : Number.POSITIVE_INFINITY;
  };

  // Priority first, then overdue/due-soon tasks, then the oldest untouched item.
  // This prevents passive/meta P0 tasks from monopolizing next_task while a same-priority
  // operational task has a concrete deadline.
  const sorted = [...items].sort((a, b) => {
    const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    const aDue = dueRank(a);
    const bDue = dueRank(b);
    const aOverdue = Number.isFinite(aDue) && aDue <= now;
    const bOverdue = Number.isFinite(bDue) && bDue <= now;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (aDue !== bDue) return aDue - bDue;
    return updatedRank(a) - updatedRank(b);
  });

  // CEO semantics:
  // "Bị chặn" = hệ thống không được phép tiếp tục vì đang chờ một quyết định/phê duyệt chưa được giải quyết.
  // Sequence/dependency waits và technical/tool issues không được gọi là "bị chặn".
  const blockedItems = sorted.filter(
    (item) =>
      item.status !== "DONE" &&
      Boolean(item.pendingCeoApproval),
  );

  const systemIssueItems = sorted.filter(
    (item) =>
      item.status !== "DONE" &&
      !blockedItems.some((blocked) => blocked.id === item.id) &&
      (
        item.status === "BLOCKED" ||
        /AUTH|QUOTA|ERROR|FAILED|DENIED|UNAVAILABLE|BLOCKED|DEGRADED|STALE|NEED[_ ]?VERIFY|INVALID[_-]?GRANT/i.test(item.blocker ?? "")
      ),
  );

  const waitingItems = sorted.filter(
    (item) =>
      item.status !== "DONE" &&
      !blockedItems.some((blocked) => blocked.id === item.id) &&
      !systemIssueItems.some((issue) => issue.id === item.id) &&
      (
        isWaitingStatus(item.status) ||
        /SEQUENCE|HOLD_SEQUENCE|WAIT|DEPENDENCY/i.test(item.executionGate ?? "") ||
        /SEQUENCE_GATE|CURRENT MAIN LANE|WAIT FOR|CHỜ/i.test(item.blocker ?? "")
      ),
  );

  const nextItems = sorted
    .filter(
      (item) =>
        item.status !== "DONE" &&
        !blockedItems.some((blocked) => blocked.id === item.id) &&
        !waitingItems.some((waiting) => waiting.id === item.id) &&
        !systemIssueItems.some((issue) => issue.id === item.id),
    )
    .slice(0, 5);

  const status: OperationStatus = staleAuthorities.length > 0 ? "blocked" : "succeeded";
  const summary = staleAuthorities.length > 0
    ? `Shadow brief generated; non-authoritative/stale sources detected: ${staleAuthorities.join(", ")}. No mutation allowed.`
    : `Shadow brief generated from verified authorities. ${blockedItems.length} CEO-blocked, ${waitingItems.length} waiting dependency, ${systemIssueItems.length} system issues, ${nextItems.length} next.`;

  return {
    mode: "shadow",
    status,
    generatedAt,
    sourceAuthority: "GOOGLE_DRIVE",
    canMutate: false,
    staleAuthorities,
    blockedItems,
    waitingItems,
    systemIssueItems,
    nextItems,
    summary,
  };
}
