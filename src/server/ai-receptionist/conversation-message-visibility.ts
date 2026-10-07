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
