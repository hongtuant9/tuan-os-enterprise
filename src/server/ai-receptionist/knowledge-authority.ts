export type KnowledgeAuthorityRole = "agent" | "manager" | "admin" | "owner";

export function canPublishConfirmedKnowledge(
  role: KnowledgeAuthorityRole,
  decision: "approved" | "rejected" | "needs_info",
): boolean {
  return decision === "approved" && (role === "admin" || role === "owner");
}
