export type TceAgentId =
  | "intent_router"
  | "receptionist"
  | "concierge"
  | "upsell"
  | "booking_assistant"
  | "booking_agent"
  | "channel_auditor"
  | "website_agent"
  | "manager_agent"
  | "marketing_manager"
  | "ads_agent"
  | "data_quality"
  | "operations_quality"
  | "reputation"
  | "revenue_yield"
  | "computer_operator";

export type TceAgentMode = "active" | "shadow" | "approval_required" | "hold";
export type TcePermission = "L0_READ" | "L1_SAFE" | "L2_APPROVAL" | "L3_CRITICAL";

export type TceAgentOutputLink = {
  label: string;
  href: string;
  kind: "runtime" | "plan" | "report" | "task" | "ssot" | "evidence";
};

export type TceAgentDefinition = {
  id: TceAgentId;
  name: string;
  domain: "routing" | "customer" | "operations" | "growth" | "execution";
  mode: TceAgentMode;
  permission: TcePermission;
  mission: string;
  sources: string[];
  capabilities: string[];
  guardrails: string[];
  outputs: TceAgentOutputLink[];
};
export const TCE_AGENT_REGISTRY: TceAgentDefinition[] = [
  {
    id: "intent_router", name: "Multi-entry Intent Router", domain: "routing", mode: "active", permission: "L1_SAFE",
    mission: "Phân loại intent và điều phối yêu cầu tới đúng agent mà không tự cam kết giá, availability hay policy.",
    sources: ["L3 Master", "customer context", "runtime conversation"],
    capabilities: ["intent classification", "journey entry", "agent routing", "secondary intent capture"],
    outputs: [{ label: "Hành trình khách & attribution", href: "/customers", kind: "runtime" }, { label: "Điều hành AI", href: "/ai-manager", kind: "report" }],
    guardrails: ["no business mutation", "no unsupported customer commitment"],
  },
  {
    id: "receptionist", name: "AI Receptionist", domain: "customer", mode: "active", permission: "L1_SAFE",
    mission: "Trả lời khách tự nhiên như nhân viên sales/reception, giữ ngữ cảnh hội thoại và chỉ dùng dữ liệu VERIFIED để hỗ trợ khách.",
    sources: ["L3 Master", "Domain SSOT/runtime read-only", "conversation memory", "verified policy records"],
    capabilities: ["FAQ", "multilingual language detection and same-language reply", "Vietnamese owner translation", "conversation memory", "human-style sales conversation", "stay intake", "availability read"],
    outputs: [{ label: "Workspace AI Lễ tân", href: "/ai-le-tan", kind: "runtime" }, { label: "Lịch sử khách & hội thoại", href: "/customers", kind: "evidence" }],
    guardrails: ["fail closed on NEED VERIFY/HOLD", "LLM controls wording only, not business truth", "no fabricated price or availability", "no internal-system language in customer replies"],
  },
  {
    id: "concierge", name: "AI Concierge", domain: "customer", mode: "shadow", permission: "L1_SAFE",
    mission: "Tư vấn STAY/EAT/EXPERIENCE/EXPLORE theo ngữ cảnh và nguồn đã xác minh.",
    sources: ["L3 Master", "service catalogue", "verified public planning data"],
    capabilities: ["itinerary", "service recommendation", "local guidance", "handoff"],
    outputs: [{ label: "L3 Master Information", href: "https://docs.google.com/spreadsheets/d/1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4/edit", kind: "ssot" }, { label: "CRM / hành trình khách", href: "/customers", kind: "runtime" }],
    guardrails: ["dynamic supplier quotes require lookup", "no HOLD service sale"],
  },  {
    id: "upsell", name: "AI Upsell", domain: "customer", mode: "shadow", permission: "L1_SAFE",
    mission: "Đề xuất bán chéo đúng ngữ cảnh với suppression/frequency cap.",
    sources: ["booking context", "customer history", "verified service catalogue"],
    capabilities: ["T0/T-1/in-stay/post-stay offers", "cross-sell attribution"],
    outputs: [{ label: "Báo cáo Upsell", href: "/upsell", kind: "report" }, { label: "CRM / attribution", href: "/customers", kind: "evidence" }],
    guardrails: ["suppress on complaint", "no spam", "no HOLD/NEED VERIFY offer"],
  },
  {
    id: "booking_assistant", name: "Booking Assistant", domain: "customer", mode: "active", permission: "L1_SAFE",
    mission: "Đọc availability/price, thu dữ liệu khách và chuẩn bị booking draft an toàn.",
    sources: ["KiotViet Hotel read-only", "verified direct-price source", "L3 room mapping"],
    capabilities: ["availability read", "price lookup", "guest intake", "booking draft"],
    outputs: [{ label: "Booking Draft / AI Lễ tân", href: "/ai-le-tan", kind: "runtime" }, { label: "CRM khách hàng", href: "/customers", kind: "evidence" }],
    guardrails: ["second availability check required", "no booking write"],
  },
  {
    id: "booking_agent", name: "Booking Agent", domain: "customer", mode: "active", permission: "L2_APPROVAL",
    mission: "Thực thi booking write khi source/safety gate/idempotency/read-back PASS; chỉ ngoại lệ tài chính cần Owner approval.",
    sources: ["verified booking draft", "KiotViet Hotel runtime", "L3 pricing/policy authority"],
    capabilities: ["second check", "idempotent create", "post-create readback", "audit log"],
    outputs: [{ label: "Booking execution / read-back", href: "/ai-le-tan", kind: "runtime" }, { label: "Approval Queue", href: "/approvals", kind: "task" }],
    guardrails: ["write disabled unless safety gate passes", "financial exception requires Owner approval", "no success claim before readback"],
  },  {
    id: "channel_auditor", name: "Channel Auditor", domain: "operations", mode: "active", permission: "L0_READ",
    mission: "Phát hiện mismatch giữa Master và Website/OTA/Maps/Tripadvisor.",
    sources: ["L3 Master", "MKT-001", "authenticated/public channel evidence"],
    capabilities: ["reconciliation", "severity classification", "remediation proposal"],
    outputs: [{ label: "Channel Health", href: "/channel-health", kind: "report" }, { label: "L3 Channel Tracking", href: "https://docs.google.com/spreadsheets/d/1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4/edit", kind: "ssot" }],
    guardrails: ["public evidence cannot overwrite Master", "non-financial remediation requires verified source + evidence + rollback"],
  },
  {
    id: "website_agent", name: "Website Agent", domain: "operations", mode: "active", permission: "L2_APPROVAL",
    mission: "Audit và tự sửa lỗi website không liên quan tài chính theo WEB-TCE-001 với evidence, read-back và rollback.",
    sources: ["WEB-TCE-001", "L3 Master", "production website"],
    capabilities: ["content audit", "CTA/link/schema/mobile checks", "controlled patch"],
    outputs: [{ label: "WEB-TCE-001", href: "https://docs.google.com/document/d/15KwqEtOZLGs2RZ04nVEuSKeNFBYQ9Ag1cTPjtQH_7eM", kind: "plan" }, { label: "AI Manager / action list", href: "/ai-manager", kind: "runtime" }],
    guardrails: ["no publish of unverified facts", "before/after evidence and rollback"],
  },
  {
    id: "manager_agent", name: "Manager Agent", domain: "operations", mode: "active", permission: "L1_SAFE",
    mission: "Tổng hợp Daily Brief, ưu tiên, blocker, approval và exception cho Tuấn.",
    sources: ["TASK-001", "APPROVAL-001", "L3 Master", "runtime logs"],
    capabilities: ["briefing", "priority triage", "exception routing", "approval queue"],
    outputs: [{ label: "AI Manager / Daily Brief", href: "/ai-manager", kind: "report" }, { label: "TASK-001", href: "https://docs.google.com/spreadsheets/d/1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM/edit", kind: "task" }, { label: "APPROVAL-001", href: "https://docs.google.com/spreadsheets/d/15LzFRdk9z0UClYMTNadcCLvEnpDNVsopcSIPlchrDUk/edit", kind: "task" }],
    guardrails: ["recommend only for critical decisions", "no invented KPI"],
  },  {
    id: "marketing_manager", name: "AI Marketing Manager", domain: "growth", mode: "active", permission: "L2_APPROVAL",
    mission: "Hoạt động như CMO AI đầy đủ: quản trị brand/portfolio, market & competitor intelligence, chiến lược đa kênh, campaign/content, paid-media proposal, funnel/direct growth, attribution, budget/ROI proposal và báo cáo tuần/tháng cho TCE.",
    sources: ["L1/L2 TCE strategy", "L3 Master", "CMO Marketing & Growth Operating Workbook", "TASK-001", "APPROVAL-001", "runtime channel analytics", "GA4", "verified CRM/booking/revenue evidence", "dated market/competitor evidence"],
    capabilities: ["brand & portfolio strategy", "market intelligence", "competitor intelligence", "multi-channel planning", "campaign orchestration", "content direction", "paid media planning", "funnel/direct growth", "attribution", "budget & ROI proposal", "weekly/monthly reporting", "experiment design", "specialist-agent orchestration"],
    outputs: [{ label: "CMO Marketing & Growth Operating System V2", href: "https://docs.google.com/document/d/1ekn0EuQNQHYtfgS_O5-aptpzPjB2Y2FGUMEXWPvJmLc/edit", kind: "plan" }, { label: "CMO Operating Workbook — Dashboard / Channels / Market / Campaign / Funnel / Budget / Review", href: "https://docs.google.com/spreadsheets/d/1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw/edit", kind: "report" }, { label: "DEMO — Facebook 90-Day Scenario", href: "https://docs.google.com/spreadsheets/d/1kjR4XAROAWW4IZBQNGTD1xwC8QRd-uSLzTcYojhep4k/edit", kind: "evidence" }, { label: "AI Manager / CMO runtime", href: "/ai-manager", kind: "runtime" }, { label: "TASK-001 / SOC-001", href: "https://docs.google.com/spreadsheets/d/1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM/edit", kind: "task" }],
    guardrails: ["TCE is master brand; Lavender/Ruby/Cozy are service lines", "use verified facts only", "financial mutations require Owner approval", "GREEN non-financial work may auto-dispatch", "prefer API/cloud execution", "channel planning/audit is broad; customer-facing activation remains approval-gated"],
  },  {
    id: "ads_agent", name: "Ads Agent", domain: "growth", mode: "shadow", permission: "L3_CRITICAL",
    mission: "Đọc và phân tích quảng cáo; đề xuất thay đổi nhưng không tự chi ngân sách.",
    sources: ["Google Ads runtime", "GA4 trusted conversions", "approved campaign rules"],
    capabilities: ["performance audit", "waste detection", "budget/bid recommendation"],
    outputs: [{ label: "AI Manager / Ads action", href: "/ai-manager", kind: "runtime" }, { label: "Approval Queue", href: "/approvals", kind: "task" }],
    guardrails: ["no spend mutation without explicit approval", "tracking must be trusted"],
  },
  {
    id: "data_quality", name: "AI Master Data Steward", domain: "operations", mode: "active", permission: "L2_APPROVAL",
    mission: "Bảo vệ L3 Master như SSOT chính thức; audit định kỳ, phát hiện thiếu/sai/cũ/trùng/mismatch và tạo báo cáo thay đổi chi tiết trước mọi mutation quan trọng.",
    sources: ["L3 Master", "15_MASTER_DATA_AUDIT", "14_OTA_CHANGE_REVIEW_QUEUE", "Domain SSOT", "OTA/Website/Channel evidence", "runtime evidence"],
    capabilities: ["scheduled full-workbook audit", "conflict/stale/duplicate detection", "verification audit", "change proposal", "impact classification", "compare-before-write", "read-back verification", "audit trail"],
    outputs: [{ label: "Master Data Changes", href: "/master-changes", kind: "report" }, { label: "Sync History", href: "/sync-history", kind: "evidence" }, { label: "L3 Master Information", href: "https://docs.google.com/spreadsheets/d/1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4/edit", kind: "ssot" }],
    guardrails: ["no silent business mutation", "business truth/customer-facing/AI-read-governance changes require CEO approval", "safe metadata only may auto-update", "do not auto-resolve authority conflict", "compare-before-write", "read-back after write", "fail closed on conflict", "preserve history and rollback evidence"],
  },
  {
    id: "operations_quality", name: "Operations Quality Agent", domain: "operations", mode: "shadow", permission: "L1_SAFE",
    mission: "Theo dõi checklist, issue, maintenance và lỗi vận hành lặp lại.",
    sources: ["TASK-001", "runtime issues", "operational checklists"],
    capabilities: ["SLA tracking", "recurrence detection", "root-cause task proposal"],
    outputs: [{ label: "AI Manager / vận hành", href: "/ai-manager", kind: "runtime" }, { label: "TASK-001", href: "https://docs.google.com/spreadsheets/d/1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM/edit", kind: "task" }],
    guardrails: ["no destructive maintenance action", "escalate P0/P1"],
  },  {
    id: "reputation", name: "Reputation Agent", domain: "growth", mode: "shadow", permission: "L1_SAFE",
    mission: "Tổng hợp review, draft phản hồi và biến phản hồi xấu thành issue/root-cause action.",
    sources: ["OTA reviews", "Google Maps", "Tripadvisor", "booking context"],
    capabilities: ["review classification", "response draft", "issue trend detection"],
    outputs: [{ label: "AI Manager / Reputation actions", href: "/ai-manager", kind: "runtime" }, { label: "Review / feedback workflow", href: "/review", kind: "evidence" }],
    guardrails: ["no fabricated facts", "serious complaint escalates"],
  },
  {
    id: "revenue_yield", name: "Revenue & Yield Agent", domain: "growth", mode: "shadow", permission: "L2_APPROVAL",
    mission: "Phân tích occupancy/ADR/lead time và đề xuất pricing/yield action.",
    sources: ["KiotViet Hotel", "MKT-001", "booking history", "calendar"],
    capabilities: ["rate anomaly", "occupancy analysis", "yield recommendation"],
    outputs: [{ label: "Homestay Pricing Model — MKT-001", href: "https://docs.google.com/spreadsheets/d/1ZvsTVuViFWXOF4b_MGJkDXyM1KALiZqJEt039NzMOJ0/edit", kind: "ssot" }, { label: "AI Manager / Yield actions", href: "/ai-manager", kind: "runtime" }],
    guardrails: ["recommend before mutate", "large/public pricing changes require approval"],
  },
  {
    id: "computer_operator", name: "Computer Operator Controller", domain: "execution", mode: "active", permission: "L2_APPROVAL",
    mission: "Điều phối browser worker cho tác vụ không có API/Terminal/DOM phù hợp; tự thực thi non-financial task trong policy.",
    sources: ["verified task envelope", "runtime access matrix", "TASK-001"],
    capabilities: ["task queue", "worker handoff", "evidence capture", "result verification"],
    outputs: [{ label: "AI Manager / execution queue", href: "/ai-manager", kind: "runtime" }, { label: "TASK-001", href: "https://docs.google.com/spreadsheets/d/1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM/edit", kind: "task" }],
    guardrails: ["API → Terminal → DOM → GUI", "no password/token logging", "financial mutation requires Owner approval", "destructive action requires rollback"],
  },
];

export function getTceAgent(id: TceAgentId): TceAgentDefinition {
  const found = TCE_AGENT_REGISTRY.find((agent) => agent.id === id);
  if (!found) throw new Error(`Unknown TCE agent: ${id}`);
  return found;
}

export function agentSummary(): string {
  return TCE_AGENT_REGISTRY.map((agent) => `${agent.name}: ${agent.mode} / ${agent.permission}`).join("\n");
}