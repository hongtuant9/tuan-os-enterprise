export const CONTENT_GATES = [
  "FACT",
  "BRAND",
  "MEDIA",
  "COPYRIGHT",
  "PRIVACY",
  "CTA",
  "TRACKING",
  "PLATFORM",
] as const;

export type ContentGate = (typeof CONTENT_GATES)[number];
export type GateStatus = "PASS" | "FAIL" | "HOLD" | "NEED_VERIFY";
export type CapabilityStatus =
  | "VERIFIED"
  | "READ_ONLY"
  | "WRITE_APPROVAL_REQUIRED"
  | "UNSUPPORTED"
  | "NEED_VERIFY"
  | "HOLD";

export type VariantReadinessInput = {
  qaStatus: "PENDING" | "PASS" | "FAIL" | "HOLD";
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | "NOT_REQUIRED";
  gateResults: Partial<Record<ContentGate, GateStatus>>;
};

export function evaluateVariantReadiness(input: VariantReadinessInput) {
  const missingGates = CONTENT_GATES.filter((gate) => !input.gateResults[gate]);
  const blockingGates = CONTENT_GATES.filter((gate) => {
    const status = input.gateResults[gate];
    return status && status !== "PASS";
  });

  const ready =
    input.qaStatus === "PASS" &&
    input.approvalStatus === "APPROVED" &&
    missingGates.length === 0 &&
    blockingGates.length === 0;

  return { ready, missingGates, blockingGates };
}

export function buildPublishIdempotencyKey(input: {
  contentId: string;
  channelId: string;
  variantKey: string;
  scheduledAt: string;
}) {
  return [
    input.contentId.trim(),
    input.channelId.trim(),
    input.variantKey.trim(),
    new Date(input.scheduledAt).toISOString(),
  ].join("::");
}

export function canUseWriteCapability(status: CapabilityStatus) {
  return status === "WRITE_APPROVAL_REQUIRED";
}

export function assertApprovalGatedPublish(input: {
  capabilityStatus: CapabilityStatus;
  variantReady: boolean;
  autoPublishEnabled: boolean;
}) {
  if (input.autoPublishEnabled) {
    return {
      allowed: false,
      reason: "AUTO_PUBLISH_DISABLED_BY_MVP_POLICY",
    } as const;
  }

  if (!canUseWriteCapability(input.capabilityStatus)) {
    return {
      allowed: false,
      reason: "WRITE_CAPABILITY_NOT_APPROVAL_GATED",
    } as const;
  }

  if (!input.variantReady) {
    return {
      allowed: false,
      reason: "CONTENT_VARIANT_NOT_READY",
    } as const;
  }

  return { allowed: true, reason: "APPROVAL_GATED_READY" } as const;
}
