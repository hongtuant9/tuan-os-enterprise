import "server-only";

export const EXECUTION_GOVERNANCE_VERSION = "2026-10-07.v7";

export const TCE_GLOBAL_UI_DATA_SAFETY_STANDARD = {
  name: "TCE GLOBAL UI & DATA SAFETY STANDARD",
  guardrail: "TCE GLOBAL UI & DATA SAFETY STANDARD applies: current-data-first; preserve all non-target modules; regression = 0.",
  rules: {
    dataFreshness: "RULE-01 DATA FRESHNESS & LAST UPDATED",
    scopedChange: "RULE-02 SCOPED CHANGE & NON-REGRESSION",
  },
  preflight: [
    "Source of Truth đã đọc.",
    "TCE GLOBAL UI & DATA SAFETY STANDARD đã đọc.",
    "Target scope đã xác định.",
    "Non-target modules đã xác định và PRESERVE_BY_DEFAULT.",
    "Freshness requirement đã xác định.",
    "Baseline snapshot tồn tại.",
    "Backup/rollback requirement đã xác định.",
    "Approval requirement đã xác định.",
  ],
} as const;
export const FAST_BUILD_FAIL_CLOSED_POLICY = {
  name: "FAST BUILD BUT FAIL CLOSED",
  objective: "Giảm thời gian xử lý TUAN OS/TCE bằng batching, tái sử dụng evidence còn hiệu lực và đường tool ngắn nhất; không giảm safety, authority, approval hay verification.",
  executionOrder: [
    "SPEC_ONCE",
    "COHESIVE_PATCH",
    "CI_ONCE_PER_COHERENT_PATCH",
    "CANONICAL_DEPLOY",
    "SINGLE_ACCEPTANCE_READBACK",
  ] as const,
  speedRules: [
    "Batch các read-only check độc lập trong cùng chu kỳ thay vì gọi tuần tự từng bước nhỏ.",
    "Không đọc lại hoặc chạy lại bước đã PASS nếu evidence còn current và dependency không thay đổi.",
    "Ưu tiên đường thực thi API_CONNECTOR -> SSH -> DOM -> COMPUTER_OPERATOR; browser/mouse chỉ là fallback.",
    "Gom thay đổi cùng scope thành cohesive patch; tránh micro-commit và micro-task không tạo thêm audit value.",
    "Chỉ polling khi có state transition cần chờ; ưu tiên đọc đúng job/run/result thay vì kiểm tra lặp lại.",
    "Sau mutation, thực hiện một acceptance read-back đủ backend/runtime + UI khi material; không lặp UAT đã có evidence còn hiệu lực.",
    "Trao đổi với Owner theo milestone PASS / FAIL / BLOCKED / NEED_APPROVAL; không spam từng tool step.",
    "L0/L1 tiếp tục tự động theo checkpoint; L2 chỉ khi approval đúng scope; L3 luôn dừng ở Owner gate.",
  ] as const,
  failClosedRules: [
    "Không bỏ test, read-back, rollback, evidence hoặc security check để đổi lấy tốc độ.",
    "Pricing, availability, booking, policy, financial write, security-sensitive mutation và customer-facing commitment phải fail closed khi authority/freshness/evidence chưa đủ.",
    "Nguồn stale, conflict chưa giải quyết, approval thiếu, owner auth/MFA, secret-sensitive step hoặc irreversible mutation phải chuyển BLOCKED/HOLD/WAITING_APPROVAL thay vì đoán hoặc đi đường vòng.",
    "Backend PASS nhưng app/read-model/UI material sai hoặc stale thì chưa DONE.",
    "Không tự nới quyền/autonomy chỉ vì metric tốt; mọi quyền customer-facing/financial write vẫn theo Trust Gate + approval hiện hành.",
  ] as const,
  preserveByDefault: true,
  noRepeatPassedStep: true,
  milestoneReportingOnly: true,
} as const;

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
  desktopPolicy: "NON_RUNTIME_FALLBACK_ONLY",
  windowPolicy: "STATELESS_CONTROL_SURFACE_ONLY",
  runtimeDependencyPolicy: "VPS_ONLY",
  sessionFailurePolicy: "RESUME_FROM_CHECKPOINT",
  completionSummary: true,
  autoSelectNextTask: true,
  browserRuntime: {
    publicHeadless: "VPS_PRIMARY",
    authenticatedSession: "VPS_PERSISTENT_PROFILE_WHEN_SUPPORTED",
    ownerAuthChallenge: "ONE_TIME_OWNER_GATE",
    desktopMayKeepRuntimeAlive: false,
  },
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
  TCE_GLOBAL_UI_DATA_SAFETY_STANDARD.guardrail,
  `${FAST_BUILD_FAIL_CLOSED_POLICY.name}: ${FAST_BUILD_FAIL_CLOSED_POLICY.objective}`,
  "Freshness Status, Data Recency và Verification Status là ba khái niệm độc lập; không dùng một badge VERIFIED để suy ra dữ liệu đang current.",
  "Mọi thay đổi App/UI/Database/API/Deploy/Data Sync/Automation phải khai báo target scope; mọi non-target module mặc định PRESERVE_BY_DEFAULT và phải có regression evidence trước DONE.",
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
  "Windows/MacBook không được là dependency giữ runtime sống. Chỉ dùng cho one-time owner auth/MFA hoặc UI đặc biệt; nếu thiết bị offline thì task đó WAITING_OWNER_AUTH nhưng toàn bộ lane khác trên VPS tiếp tục chạy.",
  "Chat/window là control surface stateless: đóng tab, hết session, Stream cache expired hoặc tắt MacBook không được làm mất checkpoint, scheduler, dispatcher hay worker state.",
  "Browser công khai/read-only phải ưu tiên headless Chromium trên VPS. Authenticated browser chỉ dùng persistent server profile khi đã bootstrap hợp lệ; không sao chép password/token/cookie qua chat.",
  "Mọi runtime state phải có durable authority trong TASK-001 + runtime DB + Activity Log; không lưu trạng thái điều phối duy nhất trong browser/window.",
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
    TCE_GLOBAL_UI_DATA_SAFETY_STANDARD.guardrail,
    `${FAST_BUILD_FAIL_CLOSED_POLICY.name}: ${FAST_BUILD_FAIL_CLOSED_POLICY.objective}`,
    `FAST speed rules: ${FAST_BUILD_FAIL_CLOSED_POLICY.speedRules.join(" | ")}`,
    `FAIL-CLOSED rules: ${FAST_BUILD_FAIL_CLOSED_POLICY.failClosedRules.join(" | ")}`,
    `Pre-flight bắt buộc: ${TCE_GLOBAL_UI_DATA_SAFETY_STANDARD.preflight.join(" | ")}`,
    `Observability: each_cycle=${AUTONOMOUS_CONTINUATION_POLICY.observability.requiredEachCycle}; pre_mutation=${AUTONOMOUS_CONTINUATION_POLICY.observability.requiredBeforeMutation}; post_mutation=${AUTONOMOUS_CONTINUATION_POLICY.observability.requiredAfterMutation}; ui_policy=${AUTONOMOUS_CONTINUATION_POLICY.observability.uiPolicy}.`,
    ...EXECUTION_GOVERNANCE_RULES.map((rule, index) => `${index + 1}) ${rule}`),
    `Trello mirror runtime: ${trelloExecutionMirrorStatus()}.`,
    "Nếu Trello runtime đang HOLD thì phải ghi blocker rõ; không được tuyên bố đã cập nhật Trello.",
  ].join("\n");
}
