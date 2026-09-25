import "server-only";

export const EXECUTION_GOVERNANCE_VERSION = "2026-09-26.v1";
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
] as const;

export function trelloRuntimeConfigured(): boolean {
  return Boolean(
    process.env.TRELLO_API_KEY?.trim() &&
    process.env.TRELLO_TOKEN?.trim() &&
    process.env.TRELLO_BOARD_ID?.trim(),
  );
}

export function trelloExecutionMirrorStatus(): "ACTIVE" | "HOLD_NO_RUNTIME_CREDENTIALS" {
  return trelloRuntimeConfigured() ? "ACTIVE" : "HOLD_NO_RUNTIME_CREDENTIALS";
}

export function executionGovernanceInstruction(): string {
  return [
    `Execution governance ${EXECUTION_GOVERNANCE_VERSION}:`,
    ...EXECUTION_GOVERNANCE_RULES.map((rule, index) => `${index + 1}) ${rule}`),
    `Trello mirror runtime: ${trelloExecutionMirrorStatus()}.`,
    "Nếu Trello runtime đang HOLD thì phải ghi blocker rõ; không được tuyên bố đã cập nhật Trello.",
  ].join("\n");
}
