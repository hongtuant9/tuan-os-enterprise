import type { CustomerCarePhase } from "./customer-care";

const COMPLAINT_SIGNALS = [
  "complaint", "problem", "not working", "broken", "dirty", "noisy", "unhappy", "dissatisfied",
  "phàn nàn", "khiếu nại", "vấn đề", "không hoạt động", "bị hỏng", "bẩn", "ồn", "không hài lòng",
  "réclamation", "problème", "ne fonctionne pas", "cassé", "sale", "bruyant", "mécontent",
] as const;

export function hasComplaintSignal(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return normalized.length > 0 && COMPLAINT_SIGNALS.some((signal) => normalized.includes(signal));
}

export type FollowUpPlan = {
  kind: "pre_arrival_check" | "in_stay_check" | "post_stay_feedback";
  suggestedDelayHours: number;
  reason: string;
  humanApprovalRequired: true;
  autoSendAllowed: false;
};

export type FollowUpContext = {
  openComplaint?: boolean;
  humanTakeover?: boolean;
  customerDeclinedFollowUp?: boolean;
};

export function buildFollowUpPlan(
  phase: CustomerCarePhase,
  context: FollowUpContext = {},
): FollowUpPlan | null {
  if (context.openComplaint || context.humanTakeover || context.customerDeclinedFollowUp) {
    return null;
  }

  if (phase === "pre_service") {
    return {
      kind: "pre_arrival_check",
      suggestedDelayHours: 24,
      reason: "Đề xuất kiểm tra nhu cầu trước khi khách đến; chỉ gửi sau khi người duyệt.",
      humanApprovalRequired: true,
      autoSendAllowed: false,
    };
  }

  if (phase === "in_service") {
    return {
      kind: "in_stay_check",
      suggestedDelayHours: 6,
      reason: "Đề xuất hỏi thăm trải nghiệm trong thời gian sử dụng dịch vụ; chỉ gửi sau khi người duyệt.",
      humanApprovalRequired: true,
      autoSendAllowed: false,
    };
  }

  if (phase === "post_service") {
    return {
      kind: "post_stay_feedback",
      suggestedDelayHours: 24,
      reason: "Đề xuất hỏi phản hồi sau dịch vụ; chỉ gửi sau khi người duyệt.",
      humanApprovalRequired: true,
      autoSendAllowed: false,
    };
  }

  return null;
}
