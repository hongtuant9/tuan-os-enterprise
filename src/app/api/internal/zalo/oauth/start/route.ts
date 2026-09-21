import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import { ZaloOAuthService } from "@/server/integrations/zalo/oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await authenticateApiRequest(request);
  if (!principal || principal.kind !== "user" || !principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const url = await new ZaloOAuthService().buildAuthorizationUrl();
    return NextResponse.redirect(url, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zalo OAuth start failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
