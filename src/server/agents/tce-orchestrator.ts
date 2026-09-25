import "server-only";
import { getAdminContainer } from "@/server/container";
import { TCE_AGENT_REGISTRY, agentSummary, type TceAgentDefinition } from "./tce-registry";
import { assertTceAiBudget, estimatePreflightCostUsd, recordTceAiUsage } from "./tce-cost-guard";
import { buildManagerItems } from "@/server/ai-operations/manager-data";
import { buildManagerBrief, type AuthoritySnapshot, type ManagerWorkItem } from "@/server/ai-operations/control-plane";
import { DOCUMENT_GOVERNANCE_PROMPT } from "@/server/ai-governance/document-governance";
import { executionGovernanceInstruction } from "./execution-governance";

export type TceAgentReply = {
  agent: string;
  agentId: string;
  mode: string;
  permission: string;
  reply: string;
};

type RuntimeContext = {
  generatedAt: string;
  workItems: ManagerWorkItem[];
  blockedItems: ManagerWorkItem[];
  waitingItems: ManagerWorkItem[];
  systemIssueItems: ManagerWorkItem[];
  nextItems: ManagerWorkItem[];
  ceoSupportItems: ManagerWorkItem[];
  pendingApprovalCount: number;
  agentStates: Array<{ name: string; status: string; currentTask: string }>;
  authorities: AuthoritySnapshot[];
  hospitality?: { conversations: number; bookings: number; missingKnowledge: number };
};

function enabled(): boolean {
  const explicitlyDisabled = process.env.TCE_AGENT_AI_ENABLED?.trim().toLowerCase() === "false";
  const dailyBudget = Number(process.env.TCE_AI_DAILY_BUDGET_USD ?? "0");
  const monthlyBudget = Number(process.env.TCE_AI_MONTHLY_BUDGET_USD ?? "0");
  const budgetApproved = Number.isFinite(dailyBudget) && dailyBudget > 0 && Number.isFinite(monthlyBudget) && monthlyBudget > 0;
  return !explicitlyDisabled && budgetApproved && Boolean(process.env.OPENAI_API_KEY);
}

function selectModel(agent: TceAgentDefinition, message: string): string {
  const luna = process.env.TCE_AGENT_MODEL_LUNA?.trim() || process.env.TCE_AGENT_MODEL?.trim() || "gpt-5.6-luna";
  const terra = process.env.TCE_AGENT_MODEL_TERRA?.trim() || "gpt-5.6-terra";
  const sol = process.env.TCE_AGENT_MODEL_SOL?.trim() || "gpt-5.6-sol";
  const complex = /root cause|kiến trúc|architecture|multi-source|nhiều nguồn|worst-case|incident|security|bảo mật|complex/i.test(message);
  if (agent.id === "manager_agent" && complex) return sol;
  if (["revenue_yield", "data_quality", "reputation", "manager_agent"].includes(agent.id) || complex) return terra;
  return luna;
}
function pickAgent(message: string): TceAgentDefinition {
  const text = message.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/tạo booking|create booking|ghi booking/, "booking_agent"],
    [/booking|đặt phòng|phòng trống|availability/, "booking_assistant"],
    [/giá phòng|adr|occupancy|revpar|yield|pricing/, "revenue_yield"],
    [/review|đánh giá|complaint|phàn nàn/, "reputation"],
    [/website|seo|wordpress|cta/, "website_agent"],
    [/ads|quảng cáo|google ads|meta ads/, "ads_agent"],
    [/marketing|tiếp thị|content|nội dung|campaign|chiến dịch|social|facebook|instagram|kpi|funnel|direct booking/, "marketing_manager"],
    [/ota|agoda|booking\.com|expedia|airbnb|maps|channel/, "channel_auditor"],
    [/dữ liệu|ssot|conflict|mâu thuẫn|verify|xác minh/, "data_quality"],
    [/checklist|housekeeping|maintenance|vận hành/, "operations_quality"],
    [/tour|taxi|xe máy|xe đạp|cooking|coffee experience|lịch trình/, "concierge"],
    [/upsell|bán chéo|cross-sell/, "upsell"],
    [/máy tính|browser|gui|terminal|computer operator/, "computer_operator"],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return TCE_AGENT_REGISTRY.find((item) => item.id === (match?.[1] ?? "manager_agent"))!;
}

function financialIntent(message: string): boolean {
  return /\b(budget|cost|spend|refund|payment|price change|discount)\b|ngân sách|chi phí|chi tiền|hoàn tiền|thanh toán|đổi giá|giảm giá/i.test(message);
}
async function loadRuntimeContext(agent: TceAgentDefinition): Promise<RuntimeContext> {
  const container = getAdminContainer();
  const [taskRows, syncRecords, syncSources, agents, receptionist] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at"),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001"]),
    container.db.from("sync_sources").select("key,status,last_synced_at,last_error").in("key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.agents.list(),
    agent.domain === "customer" || agent.domain === "growth" || agent.id === "manager_agent"
      ? container.aiReceptionist.dashboard()
      : Promise.resolve(null),
  ]);

  const workItems = buildManagerItems(taskRows.data ?? [], syncRecords.data ?? []);
  const sourceByKey = new Map((syncSources.data ?? []).map((item) => [item.key, item]));
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const authority = (key: "task-001" | "approval-001" | "l3-channel-tracking", label: AuthoritySnapshot["authority"]): AuthoritySnapshot => {
    const source = sourceByKey.get(key);
    const updatedAt = source?.last_synced_at ?? null;
    let state: AuthoritySnapshot["state"] = "unavailable";
    if (source?.status !== "error" && updatedAt) {
      state = now.getTime() - new Date(updatedAt).getTime() <= dayMs ? "verified" : "stale";
    }
    return {
      authority: label,
      state,
      checkedAt: now.toISOString(),
      lastUpdatedAt: updatedAt ?? undefined,
      note: source?.last_error ?? undefined,
    };
  };
  const authorities: AuthoritySnapshot[] = [
    authority("task-001", "TASK-001"),
    authority("approval-001", "APPROVAL-001"),
    authority("l3-channel-tracking", "L3"),
    { authority: "RUNTIME", state: "verified", checkedAt: now.toISOString() },
  ];

  const brief = buildManagerBrief(workItems, authorities, now.toISOString());
  const ceoSupportItems = workItems
    .filter((item) => item.status !== "DONE" && item.needsCeoSupport)
    .sort((a, b) => (a.pendingCeoApproval === b.pendingCeoApproval ? 0 : a.pendingCeoApproval ? -1 : 1));

  return {
    generatedAt: now.toISOString(),
    workItems,
    blockedItems: brief.blockedItems,
    waitingItems: brief.waitingItems,
    systemIssueItems: brief.systemIssueItems,
    nextItems: brief.nextItems,
    ceoSupportItems,
    pendingApprovalCount: brief.blockedItems.length,
    agentStates: agents.filter((item) => item.unit === "TCE AI").slice(0, 20).map((item) => ({ name: item.name, status: item.status, currentTask: item.currentTask })),
    authorities,
    hospitality: receptionist
      ? {
          conversations: receptionist.conversations.length,
          bookings: receptionist.bookings.length,
          missingKnowledge: receptionist.missingDataBacklog.length,
        }
      : undefined,
  };
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;
  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[]) : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function authorityLabel(source: AuthoritySnapshot) {
  if (source.state === "verified") return "VERIFIED";
  if (source.state === "stale") return "STALE";
  return "UNAVAILABLE";
}

function compactItem(item: ManagerWorkItem) {
  return `${item.id} — ${item.title}`;
}

function isExecutiveOverview(message: string) {
  return /tình hình.*tce|tce.*hôm nay|kiểm tra.*tình hình|tổng quan.*tce|báo cáo.*tce|tình trạng.*tce/i.test(message);
}

function fallbackReply(agent: TceAgentDefinition, context: RuntimeContext, message: string): string {
  const total = context.workItems.length;
  const done = context.workItems.filter((item) => item.status === "DONE").length;
  const inProgress = context.workItems.filter((item) => item.status === "IN_PROGRESS").length;
  const agentOnline = context.agentStates.filter((item) => item.status === "online").length;
  const staleAuthorities = context.authorities.filter((item) => item.state !== "verified");
  const finance = financialIntent(message)
    ? "Yêu cầu có yếu tố tài chính/chi phí: mọi mutation tài chính vẫn phải qua CEO approval."
    : "";

  if (isExecutiveOverview(message)) {
    const health = staleAuthorities.length > 0 || context.blockedItems.length > 0 ? "CẦN THEO DÕI" : "ỔN ĐỊNH";
    const supportNow = context.ceoSupportItems.filter((item) => item.pendingCeoApproval);
    const supportLater = context.ceoSupportItems.filter((item) => !item.pendingCeoApproval);
    const topNext = context.nextItems.slice(0, 3).map(compactItem);
    const systemIssues = context.systemIssueItems.slice(0, 3).map(compactItem);
    const authorityText = context.authorities.map((item) => `${item.authority}=${authorityLabel(item)}`).join(" · ");

    const lines = [
      `TÌNH HÌNH TCE HÔM NAY — ${health}`,
      `Tiến độ: ${done}/${total} công việc chính thức hoàn thành (${pct(done,total)}%). Đang thực hiện: ${inProgress}. Chờ điều kiện: ${context.waitingItems.length}. Vấn đề hệ thống/kỹ thuật: ${context.systemIssueItems.length}. Chờ CEO phê duyệt: ${context.blockedItems.length}.`,
      `Tác nhân AI: ${agentOnline}/${context.agentStates.length} đang online trong runtime.`,
      `Dữ liệu điều hành: ${authorityText}.`,
    ];

    if (context.hospitality) {
      lines.push(`Khách hàng: ${context.hospitality.conversations} hội thoại, ${context.hospitality.bookings} đặt phòng AI, ${context.hospitality.missingKnowledge} mục dữ liệu cần xác minh.`);
    }
    if (topNext.length) lines.push(`Việc ưu tiên tiếp theo: ${topNext.join(" | ")}.`);
    if (systemIssues.length) lines.push(`Cần đội kỹ thuật xử lý: ${systemIssues.join(" | ")}.`);
    if (supportNow.length) {
      lines.push(`CEO cần hành động NGAY: ${supportNow.map((item) => `${item.id}: ${item.ceoSupportAction ?? item.ceoSupportReason ?? "cần quyết định"}`).join(" | ")}.`);
    } else if (supportLater.length) {
      lines.push(`CEO chưa cần hành động ngay. Có ${supportLater.length} việc sẽ cần CEO hỗ trợ thao tác xác thực khi đến đúng giai đoạn; bảng điều hành đã ghi rõ thời điểm và thao tác.`);
    } else {
      lines.push("CEO cần hành động ngay: KHÔNG.");
    }
    if (finance) lines.push(finance);
    lines.push("Nguồn: TASK-001 / APPROVAL-001 / L3 / runtime. Đây là báo cáo tổng hợp theo quy tắc cố định từ dữ liệu đã xác minh; không dùng AI tạo sinh để bịa hoặc suy diễn.");
    return lines.join("\n\n");
  }

  const next = context.nextItems.slice(0, 3).map(compactItem).join(" | ");
  const system = context.systemIssueItems.slice(0, 3).map(compactItem).join(" | ");
  const support = context.ceoSupportItems.slice(0, 3).map((item) => `${item.id}: ${item.ceoSupportAction ?? item.ceoSupportReason ?? "cần CEO hỗ trợ"}`).join(" | ");

  return [
    `Đã chuyển yêu cầu tới ${agent.name}.`,
    `Tình hình điều hành hiện tại: ${done}/${total} công việc chính thức hoàn thành; ${inProgress} đang thực thi; ${context.waitingItems.length} chờ điều kiện; ${context.systemIssueItems.length} vấn đề hệ thống/kỹ thuật; ${context.blockedItems.length} chờ CEO phê duyệt.`,
    next ? `Ưu tiên có thể tiếp tục: ${next}.` : "",
    system ? `Vấn đề kỹ thuật đang mở: ${system}.` : "",
    support ? `Việc cần CEO hỗ trợ: ${support}.` : "CEO cần hỗ trợ ngay: KHÔNG.",
    finance,
    "AI tạo sinh chưa bật; phản hồi này chỉ dùng dữ liệu chính thức và trạng thái hệ thống hiện có. Với yêu cầu cần phân tích sâu hơn, hệ thống sẽ không tự suy diễn khi thiếu bằng chứng.",
  ].filter(Boolean).join("\n\n");
}
export async function runTceAgent(message: string): Promise<TceAgentReply> {
  const agent = pickAgent(message);
  const context = await loadRuntimeContext(agent);
  if (!enabled()) {
    return {
      agent: agent.name,
      agentId: agent.id,
      mode: agent.mode,
      permission: agent.permission,
      reply: fallbackReply(agent, context, message),
    };
  }

  const instructions = [
    "Bạn là một role trong TCE AI Operating System.",
    `Role hiện tại: ${agent.name}. Mission: ${agent.mission}`,
    `Mode: ${agent.mode}. Permission: ${agent.permission}.`,
    `Nguồn ưu tiên: ${agent.sources.join("; ")}.`,
    `Guardrails: ${agent.guardrails.join("; ")}.`,
    "Chỉ kết luận từ runtime context hoặc nguồn VERIFIED được nêu; thiếu evidence thì nói 'Chưa đủ dữ liệu để kết luận.'",
    "Không bịa giá, availability, policy, transaction hoặc KPI. NEED VERIFY/HOLD phải fail closed.",
    "Owner directive 2026-09-16: non-financial technical/operational mutation có thể tự chạy khi source verified, có read-back/evidence/rollback; financial/cost/budget/payment/refund/price mutation phải chờ Owner approval.",
    "Không bao giờ hiển thị password, private key, API key, access token, refresh token hoặc service-role secret.",
    executionGovernanceInstruction(),
    "Trả lời tiếng Việt có dấu, trực tiếp, nêu status/evidence/blocker rõ ràng.",
    DOCUMENT_GOVERNANCE_PROMPT,
  ].join("\n");

  const input = `YÊU CẦU:\n${message}\n\nRUNTIME CONTEXT (trusted internal snapshot):\n${JSON.stringify(context)}`;
  const selectedModel = selectModel(agent, message);
  const estimatedInputTokens = Math.ceil((instructions.length + input.length) / 3);
  const maxOutputTokens = 1000;
  const reservedCostUsd = estimatePreflightCostUsd(selectedModel, estimatedInputTokens, maxOutputTokens);
  await assertTceAiBudget(reservedCostUsd);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: selectedModel, instructions, input, max_output_tokens: maxOutputTokens, store: false }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`TCE Agent API lỗi ${response.status}`);
  }
  const payload = await response.json();
  const usage = (payload && typeof payload === "object" ? (payload as Record<string, unknown>).usage : undefined) as Parameters<typeof recordTceAiUsage>[2] | undefined;
  if (usage) await recordTceAiUsage(agent.id, selectedModel, usage);
  const reply = extractText(payload);
  return {
    agent: agent.name,
    agentId: agent.id,
    mode: agent.mode,
    permission: agent.permission,
    reply: reply || "Không có nội dung phản hồi.",
  };
}

export function tceAgentStatusText(): string {
  return `TCE AI Agents: ${TCE_AGENT_REGISTRY.length} registered\n${agentSummary()}`;
}
