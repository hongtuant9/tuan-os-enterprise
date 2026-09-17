import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/server/auth/api-auth";
import { channelPolicySnapshot } from "@/server/channels/channel-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(channelPolicySnapshot(), { headers: { "Cache-Control": "no-store" } });
}
