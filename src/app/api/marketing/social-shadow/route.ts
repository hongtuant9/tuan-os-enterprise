import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/server/auth/api-auth";
import { generateSocialContent, type SocialContentGenerationInput } from "@/server/social/content-engine";
import { decideSocialContent, type SocialContentCandidate } from "@/server/social/content-policy";

export const dynamic = "force-dynamic";

type RequestBody = SocialContentCandidate & Partial<SocialContentGenerationInput> & { generate?: boolean };

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: RequestBody;
  try { body = await request.json() as RequestBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body?.entity || !body?.topic || typeof body.factsVerified !== "boolean") {
    return NextResponse.json({ error: "entity, topic and factsVerified are required" }, { status: 400 });
  }

  const decision = decideSocialContent(body);
  if (!body.generate) return NextResponse.json({ mode: "SHADOW", decision }, { headers: { "Cache-Control": "no-store" } });
  if (decision.risk === "HOLD" || decision.risk === "RED") {
    return NextResponse.json({ mode: "SHADOW", decision, generated: false, error: "Content generation blocked by policy" }, { status: 409 });
  }
  if (!body.objective || !Array.isArray(body.verifiedFacts) || body.verifiedFacts.length === 0) {
    return NextResponse.json({ error: "objective and verifiedFacts are required when generate=true" }, { status: 400 });
  }

  try {
    const content = await generateSocialContent({
      entity: body.entity,
      topic: body.topic,
      objective: body.objective,
      audience: body.audience,
      verifiedFacts: body.verifiedFacts,
      realAssets: body.realAssets,
      language: body.language,
    });
    return NextResponse.json({ mode: "SHADOW", publishAllowed: false, decision, generated: true, content }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Content generation failed";
    const status = message.startsWith("HOLD_") ? 409 : 500;
    return NextResponse.json({ mode: "SHADOW", publishAllowed: false, decision, generated: false, error: message }, { status });
  }
}
