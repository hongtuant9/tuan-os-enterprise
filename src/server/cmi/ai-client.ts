import "server-only";

import {
  finishCmiAiUsage,
  reserveCmiAiBudget,
  type CmiAiAction,
} from "@/server/cmi/ai-runtime";

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
      const value = (part as Record<string, unknown>).text;
      if (typeof value === "string") chunks.push(value);
    }
  }
  return chunks.join("\n");
}

function parseJsonOnly(text: string): unknown {
  return JSON.parse(
    text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  );
}

export async function runCmiAiJson(input: {
  action: CmiAiAction;
  actorUserId: string;
  model: string;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  timeoutMs: number;
  tools?: Array<Record<string, unknown>>;
}): Promise<unknown> {
  const usageId = await reserveCmiAiBudget(input.action, input.actorUserId);
  let payload: unknown = null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: input.model,
        instructions: input.instructions,
        input: input.prompt,
        max_output_tokens: input.maxOutputTokens,
        store: false,
        ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI Responses API trả lỗi ${response.status}: ${body.slice(0, 500)}`);
    }

    payload = await response.json();
    await finishCmiAiUsage(usageId, payload, true);
    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error("AI không trả về nội dung JSON.");
    return parseJsonOnly(outputText);
  } catch (error) {
    try {
      await finishCmiAiUsage(usageId, payload, false);
    } catch {
      // Không che lỗi API gốc nếu việc ghi usage thất bại.
    }
    throw error;
  }
}
