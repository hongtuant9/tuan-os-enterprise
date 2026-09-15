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
  approvalRequired?: boolean;
  approvalApproved?: boolean;
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
  waitingOwnerItems: ManagerWorkItem[];
  nextItems: ManagerWorkItem[];
  summary: string;
}

const priorityRank: Record<ManagerWorkItem["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export function buildManagerBrief(
  items: ManagerWorkItem[],
  authorities: AuthoritySnapshot[],
  generatedAt = new Date().toISOString(),
): ManagerBrief {
  const staleAuthorities = authorities
    .filter((source) => source.state !== "verified")
    .map((source) => source.authority);

  const sorted = [...items].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const blockedItems = sorted.filter((item) => item.status === "BLOCKED" || Boolean(item.blocker));
  const waitingOwnerItems = sorted.filter(
    (item) => item.approvalRequired && !item.approvalApproved && item.status !== "DONE",
  );
  const nextItems = sorted
    .filter(
      (item) =>
        item.status !== "DONE" &&
        !blockedItems.some((blocked) => blocked.id === item.id) &&
        !waitingOwnerItems.some((waiting) => waiting.id === item.id),
    )
    .slice(0, 5);

  const status: OperationStatus = staleAuthorities.length > 0 ? "blocked" : "succeeded";
  const summary = staleAuthorities.length > 0
    ? `Shadow brief generated; non-authoritative/stale sources detected: ${staleAuthorities.join(", ")}. No mutation allowed.`
    : `Shadow brief generated from verified authorities. ${blockedItems.length} blocked, ${waitingOwnerItems.length} waiting owner, ${nextItems.length} next.`;

  return {
    mode: "shadow",
    status,
    generatedAt,
    sourceAuthority: "GOOGLE_DRIVE",
    canMutate: false,
    staleAuthorities,
    blockedItems,
    waitingOwnerItems,
    nextItems,
    summary,
  };
}
