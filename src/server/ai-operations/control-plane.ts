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
  // TODO không còn bị coi là "đang chờ" mặc định. Nếu không có dependency,
  // blocker hoặc approval gate, task TODO phải được đưa vào nextItems để
  // VPS Autopilot có thể tự chuyển sang công việc kế tiếp.
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

  const sorted = [...items].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

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
        /AUTH|QUOTA|ERROR|FAILED|DENIED|UNAVAILABLE|BLOCKED/i.test(item.blocker ?? "")
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
