export type ConversationScopeInput = {
  externalConversationId?: string | null;
  metadata?: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isInternalOpsConversation(input: ConversationScopeInput): boolean {
  const metadata = metadataRecord(input.metadata);
  const source = typeof metadata.source === "string" ? metadata.source.trim() : "";
  const externalId = input.externalConversationId?.trim() ?? "";
  return source === "MORNING_BRIEF_DEPARTMENT" || externalId.startsWith("morning-ops:");
}
