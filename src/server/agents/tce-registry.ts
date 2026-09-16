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
  | "ads_agent"
  | "data_quality"
  | "operations_quality"
  | "reputation"
  | "revenue_yield"
  | "computer_operator";

export type TceAgentMode = "active" | "shadow" | "approval_required" | "hold";
export type TcePermission = "L0_READ" | "L1_SAFE" | "L2_APPROVAL" | "L3_CRITICAL";

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
};
export const TCE_AGENT_REGISTRY: TceAgentDefinition[] = [
  {
    id: "intent_router", name: "Multi-entry Intent Router", domain: "routing", mode: "active", permission: "L1_SAFE",
    mission: "Phân loại intent và điều phối yêu cầu tới đúng agent mà không tự cam kết giá, availability hay policy.",
    sources: ["L3 Master", "customer context", "runtime conversation"],
    capabilities: ["intent classification", "journey entry", "agent routing", "secondary intent capture"],
    guardrails: ["no business mutation", "no unsupported customer commitment"],
  },
  {
    id: "receptionist", name: "AI Receptionist", domain: "customer", mode: "active", permission: "L1_SAFE",
    mission: "Trả lời FAQ, thu ngày ở/số khách và đọc dữ liệu VERIFIED để hỗ trợ khách.",
    sources: ["L3 Master", "KiotViet Hotel read-only", "verified policy records"],
    capabilities: ["FAQ", "language detection", "stay intake", "availability read"],
    guardrails: ["fail closed on NEED VERIFY/HOLD", "no fabricated price or availability"],
  },
  {
    id: "concierge", name: "AI Concierge", domain: "customer", mode: "shadow", permission: "L1_SAFE",
    mission: "Tư vấn STAY/EAT/EXPERIENCE/EXPLORE theo ngữ cảnh và nguồn đã xác minh.",
    sources: ["L3 Master", "service catalogue", "verified public planning data"],
    capabilities: ["itinerary", "service recommendation", "local guidance", "handoff"],
    guardrails: ["dynamic supplier quotes require lookup", "no HOLD service sale"],
  },  {
    id: "upsell", name: "AI Upsell", domain: "customer", mode: "shadow", permission: "L1_SAFE",
    mission: "Đề xuất bán chéo đúng ngữ cảnh với suppression/frequency cap.",
    sources: ["booking context", "customer history", "verified service catalogue"],
    capabilities: ["T0/T-1/in-stay/post-stay offers", "cross-sell attribution"],
    guardrails: ["suppress on complaint", "no spam", "no HOLD/NEED VERIFY offer"],
  },
  {
    id: "booking_assistant", name: "Booking Assistant", domain: "customer", mode: "active", permission: "L1_SAFE",
    mission: "Đọc availability/price, thu dữ liệu khách và chuẩn bị booking draft an toàn.",
    sources: ["KiotViet Hotel read-only", "verified direct-price source", "L3 room mapping"],
    capabilities: ["availability read", "price lookup", "guest intake", "booking draft"],
    guardrails: ["second availability check required", "no booking write"],
  },
  {
    id: "booking_agent", name: "Booking Agent", domain: "customer", mode: "active", permission: "L2_APPROVAL",
    mission: "Thực thi booking write khi source/safety gate/idempotency/read-back PASS; chỉ ngoại lệ tài chính cần Owner approval.",
    sources: ["verified booking draft", "KiotViet Hotel runtime", "L3 pricing/policy authority"],
    capabilities: ["second check", "idempotent create", "post-create readback", "audit log"],
    guardrails: ["write disabled unless safety gate passes", "financial exception requires Owner approval", "no success claim before readback"],
  },  {
    id: "channel_auditor", name: "Channel Auditor", domain: "operations", mode: "active", permission: "L0_READ",
    mission: "Phát hiện mismatch giữa Master và Website/OTA/Maps/Tripadvisor.",
    sources: ["L3 Master", "MKT-001", "authenticated/public channel evidence"],
    capabilities: ["reconciliation", "severity classification", "remediation proposal"],
    guardrails: ["public evidence cannot overwrite Master", "non-financial remediation requires verified source + evidence + rollback"],
  },
  {
    id: "website_agent", name: "Website Agent", domain: "operations", mode: "active", permission: "L2_APPROVAL",
    mission: "Audit và tự sửa lỗi website không liên quan tài chính theo WEB-TCE-001 với evidence, read-back và rollback.",
    sources: ["WEB-TCE-001", "L3 Master", "production website"],
    capabilities: ["content audit", "CTA/link/schema/mobile checks", "controlled patch"],
    guardrails: ["no publish of unverified facts", "before/after evidence and rollback"],
  },
  {
    id: "manager_agent", name: "Manager Agent", domain: "operations", mode: "active", permission: "L1_SAFE",
    mission: "Tổng hợp Daily Brief, ưu tiên, blocker, approval và exception cho Tuấn.",
    sources: ["TASK-001", "APPROVAL-001", "L3 Master", "runtime logs"],
    capabilities: ["briefing", "priority triage", "exception routing", "approval queue"],
    guardrails: ["recommend only for critical decisions", "no invented KPI"],
  },  {
    id: "ads_agent", name: "Ads Agent", domain: "growth", mode: "shadow", permission: "L3_CRITICAL",
    mission: "Đọc và phân tích quảng cáo; đề xuất thay đổi nhưng không tự chi ngân sách.",
    sources: ["Google Ads runtime", "GA4 trusted conversions", "approved campaign rules"],
    capabilities: ["performance audit", "waste detection", "budget/bid recommendation"],
    guardrails: ["no spend mutation without explicit approval", "tracking must be trusted"],
  },
  {
    id: "data_quality", name: "Data Quality Agent", domain: "operations", mode: "active", permission: "L1_SAFE",
    mission: "Bảo vệ SSOT, phát hiện conflict, stale data và record thiếu verification metadata.",
    sources: ["L3 Master", "Domain SSOT", "runtime evidence"],
    capabilities: ["conflict detection", "verification audit", "blocker creation"],
    guardrails: ["do not auto-resolve authority conflict", "fail closed"],
  },
  {
    id: "operations_quality", name: "Operations Quality Agent", domain: "operations", mode: "shadow", permission: "L1_SAFE",
    mission: "Theo dõi checklist, issue, maintenance và lỗi vận hành lặp lại.",
    sources: ["TASK-001", "runtime issues", "operational checklists"],
    capabilities: ["SLA tracking", "recurrence detection", "root-cause task proposal"],
    guardrails: ["no destructive maintenance action", "escalate P0/P1"],
  },  {
    id: "reputation", name: "Reputation Agent", domain: "growth", mode: "shadow", permission: "L1_SAFE",
    mission: "Tổng hợp review, draft phản hồi và biến phản hồi xấu thành issue/root-cause action.",
    sources: ["OTA reviews", "Google Maps", "Tripadvisor", "booking context"],
    capabilities: ["review classification", "response draft", "issue trend detection"],
    guardrails: ["no fabricated facts", "serious complaint escalates"],
  },
  {
    id: "revenue_yield", name: "Revenue & Yield Agent", domain: "growth", mode: "shadow", permission: "L2_APPROVAL",
    mission: "Phân tích occupancy/ADR/lead time và đề xuất pricing/yield action.",
    sources: ["KiotViet Hotel", "MKT-001", "booking history", "calendar"],
    capabilities: ["rate anomaly", "occupancy analysis", "yield recommendation"],
    guardrails: ["recommend before mutate", "large/public pricing changes require approval"],
  },
  {
    id: "computer_operator", name: "Computer Operator Controller", domain: "execution", mode: "active", permission: "L2_APPROVAL",
    mission: "Điều phối browser worker cho tác vụ không có API/Terminal/DOM phù hợp; tự thực thi non-financial task trong policy.",
    sources: ["verified task envelope", "runtime access matrix", "TASK-001"],
    capabilities: ["task queue", "worker handoff", "evidence capture", "result verification"],
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