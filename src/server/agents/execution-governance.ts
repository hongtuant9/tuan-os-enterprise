import "server-only";

export const EXECUTION_GOVERNANCE_VERSION = "2026-09-26.v4";
export const TRELLO_EXECUTION_BOARD = {
  name: "TUAN OS Enterprise — TCE Execution Board",
  boardObjectId: "6aa89e205549d35a039608ab",
  lists: {
    CEO_CONTROL_CENTER: "6ab6a41c80c57fedbf82e1ee",
    IN_PROGRESS: "6aa89e434111950b211da09e",
    WAITING_APPROVAL: "6aa89e519b077873b54cf83f",
    BACKLOG: "6aa89e34c687b414366f6394",
    READY: "6aa89e3c107f37f76fced6ca",
    VERIFY: "6aa89e4942825c6f762a3dd9",
    BLOCKED_HOLD: "6aa89e5d099926c0b1592cc0",
    DONE: "6aa89e6cdd9ad9dcd8839b95",
  },
} as const;

export const AUTONOMOUS_CONTINUATION_POLICY = {
  runtimeAuthority: "VPS_ALWAYS_ON",
  checkpointAuthority: "TASK-001",
  approvalAuthority: "APPROVAL-001",
  autoContinueLevels: ["L0", "L1"] as const,
  conditionalAutoContinueLevel: "L2",
  ownerInterruptLevels: ["L3"] as const,
  ownerInterruptReasons: [
    "budget_or_paid_service",
    "financial_transaction",
    "refund_or_cancellation",
    "pricing_write",
    "booking_write",
    "security_sensitive_access_change",
    "destructive_change",
    "credential_or_2fa_required",
    "north_star_or_strategy_change",
  ] as const,
  desktopPolicy: "FALLBACK_ONLY",
  sessionFailurePolicy: "RESUME_FROM_CHECKPOINT",
  completionSummary: true,
  autoSelectNextTask: true,
  observability: {
    requiredEachCycle: true,
    requiredBeforeMutation: true,
    requiredAfterMutation: true,
    layers: ["RUNTIME_HEALTH", "SOURCE_FRESHNESS", "DATA_QUALITY", "APP_READBACK", "UI_READBACK_WHEN_MATERIAL"] as const,
    uiPolicy: "API_DOM_FIRST_BROWSER_FALLBACK",
    mismatchPolicy: "OPEN_BLOCKER_OR_AUTO_FIX_L0_L1",
  },
} as const;

export const EXECUTION_GOVERNANCE_RULES = [
  "TASK-001 là nguồn task chính thức; Trello là lớp phản chiếu thực thi trực quan, không tạo SSOT cạnh tranh.",
  "Mọi task phải phân rã thành subtask/checklist đủ nhỏ khi bước đó có output, dependency, handoff, gate, blocker hoặc evidence riêng.",
  "Mỗi task/subtask phải có owner/AI Agent, status, deadline, dependency, next action, evidence-to-close và approval level khi áp dụng.",
  "Cập nhật Trello khi bắt đầu, sau milestone quan trọng, khi BLOCKED/HOLD, khi WAITING APPROVAL và khi có evidence hoàn thành.",
  "Không chuyển DONE nếu chưa có evidence tương ứng; DONE thiếu Activity Log/evidence phải quay VERIFY/NEED VERIFY.",
  "Blocker phải có owner, next action và evidence-to-close.",
  "L2/L3 mutation phải tuân thủ approval/Decision ID theo policy hiện hành.",
  "Activity log phải đủ để audit AI Agent đã làm gì, tới đâu và bước tiếp theo là gì.",
  "Không tạo micro-task vô nghĩa; chỉ tách bước khi tăng khả năng điều phối, audit hoặc handoff.",
  "Trello phải phản ánh thay đổi trạng thái trong cùng chu kỳ vận hành.",
  "VPS là runtime chính 24/7; ChatGPT/Windows/MacBook chỉ là lớp tương tác hoặc fallback, không phải dependency để worker tiếp tục chạy.",
  "Không chờ lệnh 'tiếp tục': sau khi task có evidence DONE, Executive Worker phải tự tính lane kế tiếp theo priority → dependency → deadline và ghi checkpoint/next action.",
  "Khi session/chat/stream cache bị ngắt, không cố duy trì trạng thái trong phiên; resume từ TASK-001 + runtime DB + Activity Log ở chu kỳ VPS kế tiếp.",
  "L0/L1 tự chạy. L2 chỉ tự chạy khi có approval/Decision ID hợp lệ đúng scope. L3 và các thao tác credential/2FA/budget/financial/security/destructive phải dừng để Owner xác nhận.",
  "Windows/MacBook chỉ dùng khi API/connector không đủ hoặc cần owner login/MFA/2FA/GUI bắt buộc; xong việc phải trả runtime về VPS.",
  "Sau mỗi task hoàn thành phải ghi completion summary ngắn gồm kết quả, evidence, impact, rollback và next task vào Activity Log/TASK-001/Trello mirror.",
  "Mỗi chu kỳ AI Agent phải kiểm tra trạng thái app liên quan trước khi xử lý: runtime health, freshness của Source of Truth, data quality và dữ liệu mà app đang hiển thị; không được chỉ dựa vào task text hoặc chat history.",
  "Trước mọi mutation phải có pre-check; sau mutation phải có read-back từ backend/runtime và app surface liên quan. Nếu backend PASS nhưng app hiển thị sai/thiếu/stale thì task chưa DONE.",
  "Ưu tiên kiểm tra app theo API/read model/DOM; chỉ dùng browser/Computer Operator khi cần xác minh giao diện hoặc luồng không thể chứng minh bằng API. Không biến desktop thành dependency 24/7.",
  "Mismatch giữa SSOT/runtime/database/app phải được phân loại severity, owner, evidence-to-close và next action trong cùng chu kỳ. L0/L1 được tự sửa nếu rollback rõ; L2/L3 phải fail closed theo approval gate.",
  "P0/P1 data-display regression, stale authority, missing verified customer/financial fields hoặc trạng thái app gây quyết định sai phải được đưa lên đầu hàng đợi xử lý; không tiếp tục như hệ thống đang bình thường.",
] as const;

export function trelloRuntimeConfigured(): boolean {
  return Boolean(
    process.env.TRELLO_API_KEY?.trim() &&
    process.env.TRELLO_TOKEN?.trim(),
  );
}

export function trelloExecutionMirrorStatus(): "ACTIVE" | "HOLD_NO_RUNTIME_CREDENTIALS" {
  return trelloRuntimeConfigured() ? "ACTIVE" : "HOLD_NO_RUNTIME_CREDENTIALS";
}

export function executionGovernanceInstruction(): string {
  return [
    `Execution governance ${EXECUTION_GOVERNANCE_VERSION}:`,
    `Autonomous continuation: runtime=${AUTONOMOUS_CONTINUATION_POLICY.runtimeAuthority}; checkpoint=${AUTONOMOUS_CONTINUATION_POLICY.checkpointAuthority}; session_failure=${AUTONOMOUS_CONTINUATION_POLICY.sessionFailurePolicy}.`,
    `Observability: each_cycle=${AUTONOMOUS_CONTINUATION_POLICY.observability.requiredEachCycle}; pre_mutation=${AUTONOMOUS_CONTINUATION_POLICY.observability.requiredBeforeMutation}; post_mutation=${AUTONOMOUS_CONTINUATION_POLICY.observability.requiredAfterMutation}; ui_policy=${AUTONOMOUS_CONTINUATION_POLICY.observability.uiPolicy}.`,
    ...EXECUTION_GOVERNANCE_RULES.map((rule, index) => `${index + 1}) ${rule}`),
    `Trello mirror runtime: ${trelloExecutionMirrorStatus()}.`,
    "Nếu Trello runtime đang HOLD thì phải ghi blocker rõ; không được tuyên bố đã cập nhật Trello.",
  ].join("\n");
}
