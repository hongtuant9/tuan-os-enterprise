import "server-only";
import { getAdminContainer } from "@/server/container";
import { TCE_AGENT_REGISTRY, agentSummary, type TceAgentDefinition } from "./tce-registry";

export type TceAgentReply = {
  agent: string;
  agentId: string;
  mode: string;
  permission: string;
  reply: string;
};

type RuntimeContext = {
  generatedAt: string;
  openTasks: Array<{ title: string; status: string; priority: string }>;
  pendingApprovals: Array<{ title: string; unit: string }>;
  agentStates: Array<{ name: string; status: string; currentTask: string }>;
  authorities: Array<{ source: string; syncedAt: string | null }>;
  hospitality?: { conversations: number; bookings: number; missingKnowledge: number };
};

function enabled(): boolean {
  return (process.env.TCE_AGENT_AI_ENABLED ?? "false").toLowerCase() === "true" && Boolean(process.env.OPENAI_API_KEY);
}

function model(): string {
  return process.env.TCE_AGENT_MODEL?.trim() || "gpt-5.6-luna";
}
function pickAgent(message: string): TceAgentDefinition {
  const text = message.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/tạo booking|create booking|ghi booking/, "booking_agent"],
    [/booking|đặt phòng|phòng trống|availability/, "booking_assistant"],
    [/giá phòng|adr|occupancy|revpar|yield|pricing/, "revenue_yield"],
    [/review|đánh giá|complaint|phàn nàn/, "reputation"],
    [/website|seo|wordpress|cta/, "website_agent"],
    [/ads|quảng cáo|campaign|google ads/, "ads_agent"],
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
  const [tasks, approvals, agents, syncResult] = await Promise.all([
    container.tasks.list(),
    container.approvals.list(),
    container.agents.list(),
    container.db.from("sync_records").select("source_key,synced_at").in("source_key", ["task-001", "approval-001", "l3-channel-tracking"]),
  ]);

  const latest = new Map<string, string>();
  for (const row of syncResult.data ?? []) {
    const current = latest.get(row.source_key);
    if (!current || row.synced_at > current) latest.set(row.source_key, row.synced_at);
  }

  const context: RuntimeContext = {
    generatedAt: new Date().toISOString(),
    openTasks: tasks.filter((item) => item.status !== "done").slice(0, 12).map((item) => ({ title: item.title, status: item.status, priority: item.priority })),
    pendingApprovals: approvals.filter((item) => item.status === "pending").slice(0, 10).map((item) => ({ title: item.title, unit: item.unit })),
    agentStates: agents.filter((item) => item.unit === "TCE AI").slice(0, 20).map((item) => ({ name: item.name, status: item.status, currentTask: item.currentTask })),
    authorities: ["task-001", "approval-001", "l3-channel-tracking"].map((source) => ({ source, syncedAt: latest.get(source) ?? null })),
  };

  if (agent.domain === "customer" || agent.domain === "growth" || agent.id === "manager_agent") {
    const dashboard = await container.aiReceptionist.dashboard();
    context.hospitality = {
      conversations: dashboard.conversations.length,
      bookings: dashboard.bookings.length,
      missingKnowledge: dashboard.missingDataBacklog.length,
    };
  }
  return context;
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

function fallbackReply(agent: TceAgentDefinition, context: RuntimeContext, message: string): string {
  const finance = financialIntent(message)
    ? " Yêu cầu này có yếu tố tài chính/chi phí nên mọi mutation phải chờ Owner duyệt."
    : "";
  return `Đã route tới ${agent.name}. AI generation chưa bật trên runtime.${finance} ` +
    `Hiện có ${context.openTasks.length} task mở, ${context.pendingApprovals.length} approval pending và ${context.agentStates.length} TCE agent state trong runtime.`;
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
    "Trả lời tiếng Việt có dấu, trực tiếp, nêu status/evidence/blocker rõ ràng.",
  ].join("\n");

  const input = `YÊU CẦU:\n${message}\n\nRUNTIME CONTEXT (trusted internal snapshot):\n${JSON.stringify(context)}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: model(), instructions, input, max_output_tokens: 1000, store: false }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`TCE Agent API lỗi ${response.status}`);
  }
  const reply = extractText(await response.json());
  return {
    agent: agent.name,
    agentId: agent.id,
    mode: agent.mode,
    permission: agent.permission,
    reply: reply || "Không có nội dung phản hồi.",
  };
}

export function tceAgentStatusText(): string {
  return `TCE AI Agents: ${TCE_AGENT_REGISTRY.length}/15 registered\n${agentSummary()}`;
}
