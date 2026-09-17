import { assertTceAiBudget, estimatePreflightCostUsd, recordTceAiUsage } from "@/server/agents/tce-cost-guard";
import type { SocialEntity, SocialTopic } from "@/server/social/content-policy";

export type SocialContentGenerationInput = {
  entity: SocialEntity;
  topic: SocialTopic;
  objective: "awareness" | "engagement" | "traffic" | "direct_booking" | "cross_sell";
  audience?: string;
  verifiedFacts: string[];
  realAssets?: string[];
  language?: "en" | "vi" | "bilingual";
};

export type SocialContentPack = {
  masterAngle: string;
  hook: string;
  facebookCaption: string;
  instagramCaption: string;
  reelConcept: { opening: string; shots: string[]; overlayText: string[]; closingCta: string };
  storyFrames: string[];
  cta: string;
  hashtags: string[];
  assetBrief: string[];
};

const BRAND: Record<SocialEntity, string> = {
  tce: "Tam Coc Experience — parent discovery hub for Stay, Eat, Experience and Explore in Tam Coc",
  cozy: "Cozy Garden — garden café and restaurant in Tam Coc, Vietnamese food, signature coffee and fresh drinks",
  lavender: "Lavender Homestay — authentic Tam Coc stay with pool, garden and local hospitality",
  ruby: "Ruby Homestay — relaxed Tam Coc stay with spacious rooms and personal service",
};

function model(): string { return process.env.SOCIAL_CONTENT_MODEL?.trim() || "gpt-5.6-luna"; }
function maxTokens(): number { return 1800; }
function outputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;
  const chunks: string[] = [];
  for (const item of Array.isArray(root.output) ? root.output : []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n");
}
function cleanJson(text: string): unknown { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")); }
function strings(value: unknown, max: number): string[] { return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map(x => x.trim()).slice(0, max) : []; }

export async function generateSocialContent(input: SocialContentGenerationInput): Promise<SocialContentPack> {
  if (!input.verifiedFacts?.length) throw new Error("HOLD_FACTS: verifiedFacts is required");
  const inputText = JSON.stringify({ ...input, brandContext: BRAND[input.entity] });
  const selectedModel = model();
  await assertTceAiBudget(estimatePreflightCostUsd(selectedModel, Math.ceil(inputText.length / 4) + 700, maxTokens()));

  const instructions = [
    "You are the Social Content Agent for Tam Coc Experience.",
    "Create high-quality travel/hospitality social content that feels natural, specific, visual and useful rather than generic advertising.",
    "Use ONLY the verifiedFacts supplied. Never invent prices, availability, policies, facilities, awards, distances, guest reviews or experience details.",
    "Property/food visuals must be real assets. Never describe synthetic media as real property or real food.",
    "TCE is the parent discovery hub. Lavender, Ruby and Cozy remain distinct operational brands.",
    "Write primarily for international travellers unless audience says otherwise.",
    "Prefer concrete sensory hooks, local context and clear action over hype. Avoid cliches such as hidden gem, paradise, best ever, unforgettable unless verified evidence supports it.",
    "Facebook can be conversational and slightly longer. Instagram must be tighter and visual-first. Reel/Story ideas must be shootable with real phone footage.",
    "Return valid JSON only. No markdown.",
  ].join("\n");

  const schema = `Return: {"masterAngle":"","hook":"","facebookCaption":"","instagramCaption":"","reelConcept":{"opening":"","shots":[""],"overlayText":[""],"closingCta":""},"storyFrames":[""],"cta":"","hashtags":[""],"assetBrief":[""]}. Keep captions ready to publish but do not add unverified claims.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: selectedModel, instructions, input: `${inputText}\n\n${schema}`, max_output_tokens: maxTokens(), store: false }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`OpenAI social content error: ${response.status}`);
  const payload = await response.json();
  const rawValue = cleanJson(outputText(payload));
  const raw = rawValue && typeof rawValue === "object" ? rawValue as Record<string, unknown> : {};
  const usage = payload && typeof payload === "object" ? (payload as Record<string, unknown>).usage : undefined;
  await recordTceAiUsage("social-content-agent", selectedModel, usage && typeof usage === "object" ? usage as Record<string, number> : {}, "social-shadow");
  const reel = raw.reelConcept && typeof raw.reelConcept === "object" ? raw.reelConcept as Record<string, unknown> : {};

  return {
    masterAngle: String(raw.masterAngle ?? "").trim(),
    hook: String(raw.hook ?? "").trim(),
    facebookCaption: String(raw.facebookCaption ?? "").trim(),
    instagramCaption: String(raw.instagramCaption ?? "").trim(),
    reelConcept: {
      opening: String(reel.opening ?? "").trim(),
      shots: strings(reel.shots, 8),
      overlayText: strings(reel.overlayText, 8),
      closingCta: String(reel.closingCta ?? "").trim(),
    },
    storyFrames: strings(raw.storyFrames, 6),
    cta: String(raw.cta ?? "").trim(),
    hashtags: strings(raw.hashtags, 12),
    assetBrief: strings(raw.assetBrief, 10),
  };
}
