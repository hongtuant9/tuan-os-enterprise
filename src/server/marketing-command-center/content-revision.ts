import "server-only";
import { assertTceAiBudget, estimatePreflightCostUsd, recordTceAiUsage } from "@/server/agents/tce-cost-guard";

export type ContentRevisionDraft = {
  draftVi: string;
  facebookVariant: string;
  instagramVariant: string;
  googleBusinessVariant: string;
  tripadvisorVariant: string;
  rationale: string;
  mediaDirection: string;
};

function enabled(): boolean {
  const explicitlyDisabled = process.env.TCE_AGENT_AI_ENABLED?.trim().toLowerCase() === "false";
  return !explicitlyDisabled && Boolean(process.env.OPENAI_API_KEY?.trim());
}

function modelName() {
  return process.env.TCE_AGENT_MODEL_LUNA?.trim() || process.env.TCE_AGENT_MODEL?.trim() || "gpt-5.6-luna";
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
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const cleaned = text.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "");
    const value = JSON.parse(cleaned) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function s(value: unknown) {
  return String(value ?? "").trim();
}

export async function generateContentRevision(input: {
  contentId: string;
  instruction: string;
  brand: string;
  pillar: string;
  objective: string;
  format: string;
  language: string;
  serviceLine: string;
  journeyStage: string;
  hook: string;
  cta: string;
  source: string;
  verification: string;
  current: {
    draftVi: string;
    facebookVariant: string;
    instagramVariant: string;
    googleBusinessVariant: string;
    tripadvisorVariant: string;
  };
}): Promise<ContentRevisionDraft> {
  if (!enabled()) {
    throw new Error("HOLD_AI_RUNTIME: OpenAI API cho Enterprise Agent chưa được cấu hình/bật trên VPS.");
  }

  const model = modelName();
  const instructions = [
    "You are the Content/Social Agent for Tam Coc Experience (TCE).",
    "Rewrite only from the supplied verified facts and source framing. Never invent price, availability, policy, promotion, rating, review, opening hours, package inclusion, distance, transport time, or service claims.",
    "Brand character: Natural, Calm, Local, Practical, Warm, Authentic, Easy to understand.",
    "Owner feedback is binding for style: content must feel human-written, longer and more thoughtful, less promotional/PR-heavy, and should connect to genuine traveller needs, emotions, questions and motivations.",
    "Avoid ad clichés such as perfect getaway, unforgettable experience, best choice, book now, don't miss out, hidden gem, ultimate, amazing deal.",
    "Use specific human context rather than generic praise. Prefer observation, useful context, gentle invitation and a low-pressure CTA.",
    "Facebook target length: roughly 130-220 words unless the owner instruction clearly asks otherwise.",
    "Instagram target length: roughly 70-140 words, image-led and natural, not a compressed advertisement.",
    "Google Business Profile target: factual, local-intent oriented, roughly 60-120 words; no unsupported rating/review/promotion/offer claims.",
    "Tripadvisor owner-content caption: factual, restrained, roughly 35-80 words, no rating/review manipulation.",
    "DRAFT_VI is an internal Vietnamese editorial draft/angle, not necessarily customer-facing.",
    "If customer-facing language is EN, write Facebook/Instagram/Google Business/Tripadvisor variants in natural English.",
    "Return JSON only with keys: draftVi, facebookVariant, instagramVariant, googleBusinessVariant, tripadvisorVariant, rationale, mediaDirection.",
    "mediaDirection must describe how to improve the EXISTING ORIGINAL asset only: crop/light/color/cleanup/composition/text-overlay guidance. Do not invent a new property/location/product or materially falsify the scene.",
  ].join("\n");

  const payload = {
    ownerInstruction: input.instruction,
    contentId: input.contentId,
    verifiedContext: {
      brand: input.brand,
      pillar: input.pillar,
      objective: input.objective,
      format: input.format,
      language: input.language,
      serviceLine: input.serviceLine,
      journeyStage: input.journeyStage,
      hook: input.hook,
      cta: input.cta,
      source: input.source,
      verification: input.verification,
    },
    currentContent: input.current,
  };

  const inputText = JSON.stringify(payload);
  const maxOutputTokens = 1800;
  await assertTceAiBudget(
    estimatePreflightCostUsd(model, Math.ceil((instructions.length + inputText.length) / 4), maxOutputTokens)
  );

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input: inputText,
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`TCE Content Revision API lỗi ${response.status}`);

  const responsePayload = await response.json();
  const usage = responsePayload && typeof responsePayload === "object"
    ? (responsePayload as Record<string, unknown>).usage
    : undefined;
  if (usage && typeof usage === "object") {
    await recordTceAiUsage("marketing_manager", model, usage as Record<string, number>, "content-revision");
  }

  const parsed = parseJson(extractText(responsePayload));
  const result: ContentRevisionDraft = {
    draftVi: s(parsed.draftVi),
    facebookVariant: s(parsed.facebookVariant),
    instagramVariant: s(parsed.instagramVariant),
    googleBusinessVariant: s(parsed.googleBusinessVariant),
    tripadvisorVariant: s(parsed.tripadvisorVariant),
    rationale: s(parsed.rationale),
    mediaDirection: s(parsed.mediaDirection),
  };
  if (!result.draftVi && !result.facebookVariant && !result.instagramVariant && !result.googleBusinessVariant && !result.tripadvisorVariant) {
    throw new Error("AI_REWRITE_EMPTY: AI không trả về bản nháp hợp lệ.");
  }
  return result;
}
