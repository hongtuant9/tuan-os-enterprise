import "server-only";

import type { ManagerWorkItem } from "./control-plane";

export const DEPARTMENT_EXECUTION_ENGINE_VERSION = "2026-09-26.v1";

export type DepartmentExecutionState =
  | "EXECUTED_INTERNAL"
  | "WAITING_APPROVAL"
  | "WAITING_EXECUTION_TRANSPORT"
  | "NEED_EXECUTOR"
  | "NEED_VERIFY"
  | "NO_TASK";

export type DepartmentExecutionResult = {
  taskId: string | null;
  agent: string | null;
  state: DepartmentExecutionState;
  reason: string;
  evidence: string;
  nextAction: string;
  safeToContinue: boolean;
};

function textOf(task: ManagerWorkItem): string {
  return [
    task.title,
    task.nextAction ?? "",
    task.blocker ?? "",
    task.dependency ?? "",
    task.executionGate ?? "",
  ].join(" ").toLowerCase();
}

function requiresBrowserOrAuthenticatedUi(text: string): boolean {
  return /facebook|instagram|meta |oauth|token|đăng bài|publish|post |browser|gui|login|đăng nhập|mfa|otp|touch id|openclaw/i.test(text);
}

function requiresPaidAi(text: string): boolean {
  return /vision|ocr|llm|openai|generate content|tạo nội dung bằng ai|phân tích sâu bằng ai/i.test(text);
}

function isInternalControlWork(text: string): boolean {
  return /audit|sync|reconcile|report|báo cáo|kiểm tra|read-back|readback|monitor|theo dõi|phân tích|analysis|attribution|utm|digest|governance|checklist/i.test(text);
}

export function dispatchDepartmentTask(
  task: ManagerWorkItem | null,
  options: {
    authoritiesVerified: boolean;
    paidAiEnabled: boolean;
    authenticatedBrowserTransportAvailable: boolean;
  },
): DepartmentExecutionResult {
  if (!task) {
    return {
      taskId: null,
      agent: null,
      state: "NO_TASK",
      reason: "Không có task đủ điều kiện thực thi trong chu kỳ này.",
      evidence: "TASK-001 dispatcher returned no executable item.",
      nextAction: "Tiếp tục chu kỳ kế tiếp.",
      safeToContinue: true,
    };
  }

  const taskText = textOf(task);

  if (!options.authoritiesVerified) {
    return {
      taskId: task.id,
      agent: task.agent,
      state: "NEED_VERIFY",
      reason: "Authority/Source of Truth chưa VERIFIED.",
      evidence: "Fail-closed before departmental execution.",
      nextAction: "Khôi phục freshness/authority rồi dispatch lại.",
      safeToContinue: false,
    };
  }

  if (task.pendingCeoApproval || (task.approvalRequired && !task.approvalResolved)) {
    return {
      taskId: task.id,
      agent: task.agent,
      state: "WAITING_APPROVAL",
      reason: "Task cần approval chưa được giải quyết.",
      evidence: task.approvalId ? `approval_id=${task.approvalId}` : "approval_required=true",
      nextAction: "Chờ approval; không mutation.",
      safeToContinue: false,
    };
  }

  if (requiresPaidAi(taskText) && !options.paidAiEnabled) {
    return {
      taskId: task.id,
      agent: task.agent,
      state: "WAITING_APPROVAL",
      reason: "Task cần Paid AI nhưng TCE Agent AI runtime chưa được duyệt/bật.",
      evidence: "TCE_AGENT_AI_ENABLED/OpenAI budget gate is not active.",
      nextAction: "Tạo/đọc Approval Gate cho Paid AI; không phát sinh chi phí khi chưa duyệt.",
      safeToContinue: false,
    };
  }

  if (
    task.agent === "computer_operator" ||
    requiresBrowserOrAuthenticatedUi(taskText)
  ) {
    if (!options.authenticatedBrowserTransportAvailable) {
      return {
        taskId: task.id,
        agent: task.agent,
        state: "WAITING_EXECUTION_TRANSPORT",
        reason: "Task cần authenticated browser/Computer Operator nhưng transport production chưa được xác minh khả dụng.",
        evidence: "No verified authenticated browser execution transport in VPS runtime.",
        nextAction: "Khôi phục/verify browser execution transport; sau đó retry cùng task từ checkpoint.",
        safeToContinue: false,
      };
    }
  }

  if (
    task.agent === "manager_agent" &&
    isInternalControlWork(taskText)
  ) {
    return {
      taskId: task.id,
      agent: task.agent,
      state: "EXECUTED_INTERNAL",
      reason: "Task thuộc internal control/analysis lane đã được Executive/Staff/Sync control loops xử lý trong chu kỳ.",
      evidence: "Executive + sync + staff operations cycles completed before dispatch.",
      nextAction: "Read-back evidence; nếu DoD chưa đủ thì giữ IN_PROGRESS và tiếp tục subtask cụ thể.",
      safeToContinue: true,
    };
  }

  if (
    task.agent === "google_ads_agent" &&
    isInternalControlWork(taskText) &&
    !requiresBrowserOrAuthenticatedUi(taskText)
  ) {
    return {
      taskId: task.id,
      agent: task.agent,
      state: "EXECUTED_INTERNAL",
      reason: "Phần read-only marketing/measurement được xử lý bởi CMO/Marketing Command Center cycles.",
      evidence: "Marketing coordination/growth/CMO/MCC cycles completed in the same Executive cycle.",
      nextAction: "Nếu next action chuyển sang publish/spend/provider write thì phải qua transport/approval gate tương ứng.",
      safeToContinue: true,
    };
  }

  return {
    taskId: task.id,
    agent: task.agent,
    state: "NEED_EXECUTOR",
    reason: `Chưa có executor adapter đủ khả năng cho agent=${task.agent} và next action hiện tại.`,
    evidence: `department_execution_engine=${DEPARTMENT_EXECUTION_ENGINE_VERSION}`,
    nextAction: "Giữ fail-closed; triển khai executor adapter chuyên biệt hoặc route sang Computer Operator/API handler phù hợp.",
    safeToContinue: false,
  };
}
