export type CustomerTimelineMessageInput = {
  direction: "inbound" | "outbound" | "internal" | string;
  senderType: "guest" | "ai" | "manager" | "system" | string;
  status: "received" | "draft" | "simulated" | "sent" | "failed" | string;
};

export function isCustomerTimelineMessage(message: CustomerTimelineMessageInput): boolean {
  if (message.direction === "inbound") {
    return message.senderType === "guest" && message.status === "received";
  }
  if (message.direction === "outbound") {
    return message.status === "sent";
  }
  return false;
}


export type ActionableAiDraftMessageInput = CustomerTimelineMessageInput & {
  id: string;
  authorship?: "guest" | "ai" | "human" | "system" | string;
  sourceAiMessageId?: string | null;
};

export function latestActionableAiDraft<T extends ActionableAiDraftMessageInput>(messages: T[]): T | undefined {
  const consumedAiDraftIds = new Set(
    messages
      .filter((message) =>
        message.direction === "outbound"
        && message.status === "sent"
        && Boolean(message.sourceAiMessageId)
      )
      .map((message) => message.sourceAiMessageId as string),
  );

  return [...messages].reverse().find((message) =>
    message.authorship === "ai"
    && message.direction === "outbound"
    && (message.status === "draft" || message.status === "simulated")
    && !consumedAiDraftIds.has(message.id)
  );
}
