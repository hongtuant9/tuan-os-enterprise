import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/server/auth/api-auth";
import { decideSocialContent, type SocialContentCandidate } from "@/server/social/content-policy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let candidate: SocialContentCandidate;
  try {
    candidate = await request.json() as SocialContentCandidate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!candidate?.entity || !candidate?.topic || typeof candidate.factsVerified !== "boolean") {
    return NextResponse.json({ error: "entity, topic and factsVerified are required" }, { status: 400 });
  }

  return NextResponse.json({
    mode: "SHADOW",
    decision: decideSocialContent(candidate),
  }, { headers: { "Cache-Control": "no-store" } });
}
