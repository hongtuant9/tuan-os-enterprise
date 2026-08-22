import "server-only";

import type { CmiBusinessLine } from "@/data/cmi";
import { getCmiAiModel, isCmiAiEnabled } from "@/server/cmi/ai-engine";

export type DiscoveredCompetitor = {
  name: string;
  rank: number;
  score: number;
  primaryUrl: string | null;
  platform: string | null;
  rationale: string;
  sourceUrls: string[];
};

const TPT_ANCHOR = "https://www.teacherspayteachers.com/store/stem-in-the-middle";

function businessContext(line: CmiBusinessLine): string {
  switch (line) {
    case "cozy_garden":
      return "Cozy Garden tại Tam Cốc, Ninh Bình: nhà hàng/café, đồ ăn, đồ uống, cooking class và trải nghiệm khách du lịch quốc tế.";
    case "homestay":
      return "Mảng Homestay tại Tam Cốc, Ninh Bình: lưu trú, OTA, phòng, breakfast, check-in, transfer, tour và trải nghiệm khách quốc tế.";
    case "tpt_isteam":
      return `TpT / iSTEAM: tài nguyên giáo dục STEM, AI, Robotics, Computer Science, lesson plan, worksheet, slide và bundle. Nguồn neo bắt buộc: ${TPT_ANCHOR}`;
    default:
      return "Nghiên cứu nhiều mảng kinh doanh của TUAN OS Enterprise.";
  }
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
  return JSON.parse(
    text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map(stringValue).filter(Boolean).slice(0, max)
    : [];
}

function score(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

export async function discoverCompetitors(input: {
  businessLine: CmiBusinessLine;
  researchTitle: string;
  objective: string;
  limit?: number;
}): Promise<DiscoveredCompetitor[]> {
  if (!isCmiAiEnabled()) {
    throw new Error("AI CMI đang tắt hoặc chưa có cấu hình API hợp lệ.");
  }

  const limit = Math.min(30, Math.max(10, input.limit ?? 30));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: getCmiAiModel(),
      tools: [{ type: "web_search", search_context_size: "medium" }],
      instructions: [
        "Bạn là AI CMI chuyên tìm đối thủ cạnh tranh dựa trên dữ liệu công khai trên web.",
        "Phải tìm đối thủ thật, có URL nguồn kiểm chứng được; không bịa tên, số liệu hoặc URL.",
        "Xếp hạng theo mức độ cạnh tranh thực tế và độ tương đồng với mảng kinh doanh.",
        "Với Cozy Garden/Homestay ưu tiên địa lý Tam Cốc/Ninh Bình, khách quốc tế, sản phẩm/giá/review tương đồng.",
        "Với TpT/iSTEAM ưu tiên seller tương đồng về STEM/AI/Robotics/Computer Science, grade, loại resource, review, giá, bundle và độ mạnh store; không dùng khoảng cách địa lý.",
        "Đầu ra chỉ là JSON hợp lệ, không markdown. Nội dung giải thích bằng tiếng Việt có dấu.",
      ].join("\n"),
      input:
        `Mảng: ${input.businessLine}\nBối cảnh: ${businessContext(input.businessLine)}\n` +
        `Nghiên cứu: ${input.researchTitle}\nMục tiêu: ${input.objective}\n\n` +
        `Hãy tìm tối đa ${limit} đối thủ. Trả JSON: {"competitors":[{"name":"...","rank":1,"score":0,"primary_url":"https://... hoặc null","platform":"Google Maps/TpT/Booking.com/Website/...","rationale":"vì sao cạnh tranh","source_urls":["https://..."]}]}. ` +
        "score 0-100; rank 1 là quan trọng nhất; source_urls chỉ chứa URL đã tìm thấy trên web.",
      max_output_tokens: 4500,
      store: false,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI web search trả lỗi ${response.status}: ${body.slice(0, 400)}`);
  }

  const raw = parseJsonOnly(extractOutputText(await response.json()));
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(root.competitors) ? root.competitors : [];
  const competitors = rows.slice(0, limit).flatMap((row, index): DiscoveredCompetitor[] => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const name = stringValue(item.name);
    if (!name) return [];
    const sourceUrls = stringArray(item.source_urls);
    const primaryUrl = stringValue(item.primary_url) || sourceUrls[0] || null;
    return [{
      name,
      rank: Math.min(100, Math.max(1, Math.round(Number(item.rank) || index + 1))),
      score: score(item.score),
      primaryUrl,
      platform: stringValue(item.platform) || null,
      rationale: stringValue(item.rationale),
      sourceUrls,
    }];
  });

  if (competitors.length < 5) {
    throw new Error("AI chưa tìm đủ đối thủ có nguồn kiểm chứng. Cần chạy lại hoặc bổ sung nguồn neo.");
  }

  return competitors.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

export function defaultTptAnchor(): string {
  return TPT_ANCHOR;
}
