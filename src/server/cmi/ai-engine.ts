import "server-only";

export type AiInsightDraft = {
  insightType: string;
  title: string;
  summary: string;
  customerSegment: string | null;
  topic: string | null;
  frequencyCount: number;
  confidence: number;
  evidenceIds: string[];
};

export type AiOpportunityDraft = {
  title: string;
  customerSegment: string | null;
  problem: string;
  proposedSolution: string;
  evidenceSummary: string;
  desirabilityScore: number;
  feasibilityScore: number;
  viabilityScore: number;
  evidenceIds: string[];
};

export type CmiAiAnalysis = {
  insights: AiInsightDraft[];
  opportunities: AiOpportunityDraft[];
};

export type MarketingAiStrategy = {
  targetCustomer: string;
  positioning: string;
  valueProposition: string;
  marketingIdeas: string[];
  channelStrategy: string[];
  testHypotheses: string[];
  kpis: string[];
  assumptions: string[];
  risks: string[];
};

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function isCmiAiEnabled(): boolean {
  return (process.env.CMI_AI_ENABLED ?? "false").toLowerCase() === "true" && Boolean(process.env.OPENAI_API_KEY);
}

export function getCmiAiModel(): string {
  return process.env.CMI_AI_MODEL?.trim() || "gpt-5.6-luna";
}

export function getCmiAiMaxEvidenceChars(): number {
  return intEnv("CMI_AI_MAX_EVIDENCE_CHARS", 30_000, 5_000, 60_000);
}

export function getCmiAiMaxOutputTokens(): number {
  return intEnv("CMI_AI_MAX_OUTPUT_TOKENS", 2_500, 500, 5_000);
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;

  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n");
}

function parseJsonOnly(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

async function callOpenAiJson(instructions: string, input: string): Promise<unknown> {
  if (!isCmiAiEnabled()) {
    throw new Error("AI CMI đang tắt hoặc chưa có cấu hình API hợp lệ.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: getCmiAiModel(),
      instructions,
      input,
      max_output_tokens: getCmiAiMaxOutputTokens(),
      store: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Responses API trả lỗi ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("AI không trả về nội dung phân tích.");
  return parseJsonOnly(outputText);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringArray(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function score(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(5, Math.max(1, Math.round(number))) : 3;
}

function confidence(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 50;
}

function validInsightType(value: unknown): string {
  const allowed = new Set([
    "customer_segment",
    "pain_point",
    "need",
    "want",
    "competitor_strength",
    "competitor_weakness",
    "market_gap",
    "trend",
    "other",
  ]);
  const candidate = stringValue(value, "other");
  return allowed.has(candidate) ? candidate : "other";
}

export async function analyzeCmiEvidence(input: {
  researchTitle: string;
  objective: string;
  businessLine: string;
  evidence: Array<{ id: string; text: string; sourceUrl: string | null }>;
}): Promise<CmiAiAnalysis> {
  const allowedEvidenceIds = new Set(input.evidence.map((item) => item.id));
  const evidenceText = input.evidence
    .map((item, index) =>
      `[BẰNG CHỨNG ${index + 1}]\nevidence_id=${item.id}\nsource=${item.sourceUrl ?? "không có URL"}\n${item.text.slice(0, 12000)}`
    )
    .join("\n\n")
    .slice(0, getCmiAiMaxEvidenceChars());

  const raw = await callOpenAiJson(
    [
      "Bạn là AI Nghiên cứu Khách hàng & Thị trường (CMI) của TUAN OS Enterprise.",
      "Chỉ được kết luận từ bằng chứng được cung cấp. Không tự bịa dữ liệu, tần suất hoặc nhu cầu.",
      "Phải phân tích trong đúng bối cảnh mảng kinh doanh được cung cấp; không trộn logic giữa các mảng.",
      "Nếu bằng chứng yếu, phải phản ánh bằng confidence thấp.",
      "Mọi insight và cơ hội phải trỏ tới evidence_id thực sự có trong đầu vào.",
      "Đầu ra phải là JSON hợp lệ, không markdown, không giải thích ngoài JSON.",
      "Toàn bộ nội dung diễn giải phải bằng tiếng Việt có dấu; thuật ngữ tiếng Anh chỉ để trong ngoặc khi cần.",
    ].join("\n"),
    `Mảng kinh doanh: ${input.businessLine}\nTên nghiên cứu: ${input.researchTitle}\nMục tiêu: ${input.objective}\n\n${evidenceText}\n\n` +
      `Trả JSON theo cấu trúc: {"insights":[{"insight_type":"pain_point","title":"...","summary":"...","customer_segment":"... hoặc null","topic":"... hoặc null","frequency_count":1,"confidence":0,"evidence_ids":["uuid"]}],"opportunities":[{"title":"...","customer_segment":"... hoặc null","problem":"...","proposed_solution":"...","evidence_summary":"...","desirability_score":1,"feasibility_score":1,"viability_score":1,"evidence_ids":["uuid"]}]}. Tối đa 8 insights và 3 opportunities.`
  );

  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const insightRows = Array.isArray(root.insights) ? root.insights : [];
  const opportunityRows = Array.isArray(root.opportunities) ? root.opportunities : [];

  const insights = insightRows.slice(0, 8).flatMap((row): AiInsightDraft[] => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const evidenceIds = stringArray(item.evidence_ids).filter((id) => allowedEvidenceIds.has(id));
    const title = stringValue(item.title);
    const summary = stringValue(item.summary);
    if (!title || !summary || evidenceIds.length === 0) return [];
    return [{
      insightType: validInsightType(item.insight_type),
      title,
      summary,
      customerSegment: stringValue(item.customer_segment) || null,
      topic: stringValue(item.topic) || null,
      frequencyCount: Math.max(0, Math.round(Number(item.frequency_count) || evidenceIds.length)),
      confidence: confidence(item.confidence),
      evidenceIds,
    }];
  });

  const opportunities = opportunityRows.slice(0, 3).flatMap((row): AiOpportunityDraft[] => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const evidenceIds = stringArray(item.evidence_ids).filter((id) => allowedEvidenceIds.has(id));
    const title = stringValue(item.title);
    const problem = stringValue(item.problem);
    const proposedSolution = stringValue(item.proposed_solution);
    if (!title || !problem || !proposedSolution || evidenceIds.length === 0) return [];
    return [{
      title,
      customerSegment: stringValue(item.customer_segment) || null,
      problem,
      proposedSolution,
      evidenceSummary: stringValue(item.evidence_summary),
      desirabilityScore: score(item.desirability_score),
      feasibilityScore: score(item.feasibility_score),
      viabilityScore: score(item.viability_score),
      evidenceIds,
    }];
  });

  if (insights.length === 0 && opportunities.length === 0) {
    throw new Error("AI chưa tạo được kết luận có bằng chứng hợp lệ. Cần bổ sung dữ liệu nguồn.");
  }

  return { insights, opportunities };
}

export async function buildMarketingStrategy(input: {
  businessLine: string;
  opportunity: {
    title: string;
    customerSegment: string | null;
    problem: string;
    proposedSolution: string;
    evidenceSummary: string | null;
  };
}): Promise<MarketingAiStrategy> {
  const raw = await callOpenAiJson(
    [
      "Bạn là AI Marketing của TUAN OS Enterprise.",
      "Nhiệm vụ duy nhất: trả lời câu hỏi 'Làm thế nào để bán?' cho cơ hội đã được quản lý phê duyệt.",
      "Phải bám đúng mảng kinh doanh được cung cấp và không trộn chiến thuật giữa các mảng nếu không có cơ sở.",
      "Mọi ý tưởng và chiến lược đều là giả thuyết cần test, không được viết như kết quả chắc chắn.",
      "Ưu tiên test nhỏ nhất, rẻ nhất và đo được trước khi mở rộng.",
      "Không tự đề xuất thực thi Ads, chi tiền, đăng bài hoặc thay đổi giá; chỉ lập chiến lược để quản lý xem xét.",
      "Đầu ra phải là JSON hợp lệ, không markdown. Nội dung tiếng Việt có dấu; tiếng Anh chỉ trong ngoặc khi cần.",
    ].join("\n"),
    `Mảng kinh doanh: ${input.businessLine}\nCơ hội: ${input.opportunity.title}\nPhân khúc: ${input.opportunity.customerSegment ?? "Chưa xác định"}\nVấn đề: ${input.opportunity.problem}\nGiải pháp đề xuất: ${input.opportunity.proposedSolution}\nBằng chứng: ${input.opportunity.evidenceSummary ?? "Chưa có tóm tắt"}\n\n` +
      `Trả JSON: {"target_customer":"...","positioning":"...","value_proposition":"...","marketing_ideas":["..."],"channel_strategy":["..."],"test_hypotheses":["..."],"kpis":["..."],"assumptions":["..."],"risks":["..."]}. Mỗi mảng tối đa 8 mục.`
  );

  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const targetCustomer = stringValue(root.target_customer);
  const positioning = stringValue(root.positioning);
  const valueProposition = stringValue(root.value_proposition);
  if (!targetCustomer || !positioning || !valueProposition) {
    throw new Error("AI Marketing trả về chiến lược chưa đủ cấu trúc bắt buộc.");
  }

  return {
    targetCustomer,
    positioning,
    valueProposition,
    marketingIdeas: stringArray(root.marketing_ideas, 8),
    channelStrategy: stringArray(root.channel_strategy, 8),
    testHypotheses: stringArray(root.test_hypotheses, 8),
    kpis: stringArray(root.kpis, 8),
    assumptions: stringArray(root.assumptions, 8),
    risks: stringArray(root.risks, 8),
  };
}
