"use server";

import { revalidatePath } from "next/cache";
import { getRequestContainer } from "@/server/container";
import type { CmiBusinessLine } from "@/data/cmi";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function lines(value: string) {
  return value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function businessLine(formData: FormData): CmiBusinessLine {
  const value = text(formData, "businessLine");
  if (["cozy_garden", "homestay", "tpt_isteam", "cross_business"].includes(value)) {
    return value as CmiBusinessLine;
  }
  return "cross_business";
}

export async function createCmiResearchJob(formData: FormData) {
  const container = await getRequestContainer();
  await container.cmi.createResearchJob({
    title: text(formData, "title"),
    objective: text(formData, "objective"),
    researchType: text(formData, "researchType") || "mixed",
    businessLine: businessLine(formData),
    businessUnitId: null,
  });
  revalidatePath("/intelligence/cmi");
}

export async function createCmiSource(formData: FormData) {
  const container = await getRequestContainer();
  await container.cmi.createSource({
    researchJobId: text(formData, "researchJobId"),
    platform: text(formData, "platform") || "website",
    sourceType: text(formData, "sourceType") || "web_page",
    url: text(formData, "url"),
    title: text(formData, "sourceTitle"),
    competitorName: text(formData, "competitorName"),
  });
  revalidatePath("/intelligence/cmi");
}

export async function createCmiEvidence(formData: FormData) {
  const container = await getRequestContainer();
  await container.cmi.createEvidence({
    sourceId: text(formData, "sourceId"),
    evidenceType: text(formData, "evidenceType") || "text",
    rawText: text(formData, "rawText"),
    sourceUrl: text(formData, "sourceUrl"),
    isVerified: formData.get("isVerified") === "on",
  });
  revalidatePath("/intelligence/cmi");
}

export async function createCmiInsight(formData: FormData) {
  const container = await getRequestContainer();
  const confidenceRaw = text(formData, "confidence");
  const frequencyRaw = text(formData, "frequencyCount");
  await container.cmi.createInsight({
    researchJobId: text(formData, "researchJobId"),
    insightType: text(formData, "insightType"),
    title: text(formData, "insightTitle"),
    summary: text(formData, "summary"),
    customerSegment: text(formData, "customerSegment"),
    topic: text(formData, "topic"),
    frequencyCount: frequencyRaw ? Number(frequencyRaw) : 0,
    confidence: confidenceRaw ? Number(confidenceRaw) : null,
  });
  revalidatePath("/intelligence/cmi");
}

export async function createCmiOpportunity(formData: FormData) {
  const container = await getRequestContainer();
  await container.cmi.createOpportunity({
    researchJobId: text(formData, "researchJobId"),
    businessUnitId: null,
    title: text(formData, "opportunityTitle"),
    customerSegment: text(formData, "customerSegment"),
    problem: text(formData, "problem"),
    proposedSolution: text(formData, "proposedSolution"),
    evidenceSummary: text(formData, "evidenceSummary"),
    currentCapability: text(formData, "currentCapability"),
    capabilityGap: text(formData, "capabilityGap"),
  });
  revalidatePath("/intelligence/cmi");
}

export async function createMarketingStrategyDraft(formData: FormData) {
  const container = await getRequestContainer();
  await container.cmi.createMarketingStrategyDraft({
    opportunityId: text(formData, "opportunityId"),
    businessUnitId: null,
    targetCustomer: text(formData, "targetCustomer"),
    positioning: text(formData, "positioning"),
    valueProposition: text(formData, "valueProposition"),
    marketingIdeas: lines(text(formData, "marketingIdeas")),
    channelStrategy: lines(text(formData, "channelStrategy")),
    testHypotheses: lines(text(formData, "testHypotheses")),
    kpis: lines(text(formData, "kpis")),
    assumptions: lines(text(formData, "assumptions")),
  });
  revalidatePath("/intelligence/cmi");
}
