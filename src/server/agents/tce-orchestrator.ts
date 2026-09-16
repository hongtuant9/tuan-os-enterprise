import "server-only";
import { TCE_AGENT_REGISTRY, agentSummary, type TceAgentDefinition } from "./tce-registry";

export type TceAgentReply = {
  agent: string;
  agentId: string;
  mode: string;
  permission: string;
  reply: string;
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
    [/booking|đặt phòng|phòng trống|availability/, "booking_assistant"],
    [/giá phòng|adr|occupancy|revpar|yield/, "revenue_yield"],
    [/review|đánh giá|complaint|phàn nàn/, "reputation"],
    [/website|seo|wordpress|cta/, "website_agent"],
    [/ads|quảng cáo|campaign|google ads/, "ads_agent"],
    [/ota|agoda|booking\.com|expedia|airbnb|maps|channel/, "channel_auditor"],
    [/dữ liệu|ssot|conflict|mâu thuẫn|verify/, "data_quality"],
    [/checklist|housekeeping|maintenance|vận hành/, "operations_quality"],
    [/tour|taxi|xe máy|xe đạp|cooking|coffee experience|lịch trình/, "concierge"],
    [/upsell|bán chéo|cross-sell/, "upsell"],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return TCE_AGENT_REGISTRY.find((item) => item.id === (match?.[1] ?? "manager_agent"))!;
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

export async function runTceAgent(message: string): Promise<TceAgentReply> {
  const agent = pickAgent(message);
  if (!enabled()) {
    return {
      agent: agent.name, agentId: agent.id, mode: agent.mode, permission: agent.permission,
      reply: `Đã route tới ${agent.name}. AI generation hiện chưa bật trên runtime. Chế độ ${agent.mode}; quyền ${agent.permission}. ${agent.mission}`,
    };
  }

  const instructions = [
    "Bạn là một role trong TCE AI Operating System.",
    `Role hiện tại: ${agent.name}. Mission: ${agent.mission}`,
    `Mode: ${agent.mode}. Permission: ${agent.permission}.`,
    `Nguồn ưu tiên: ${agent.sources.join("; ")}.`,
    `Guardrails: ${agent.guardrails.join("; ")}.`,
    "Không bịa giá, availability, policy, transaction hoặc KPI.",
    "NEED VERIFY/HOLD phải fail closed. Không tự thực hiện L2/L3 mutation.",
    "Trả lời tiếng Việt có dấu, ngắn gọn, nêu rõ khi thiếu dữ liệu.",
  ].join("\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model(),
      instructions,
      input: message,
      max_output_tokens: 900,
      store: false,
    }),
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