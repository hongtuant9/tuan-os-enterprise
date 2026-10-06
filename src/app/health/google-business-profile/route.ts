import { NextResponse } from "next/server";
import { googleBusinessProfileBrowserPolicy, googleBusinessProfileBrowserStatus } from "@/server/browser/google-business-profile-browser";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET() {
  const status = await googleBusinessProfileBrowserStatus();
  return NextResponse.json({
    status: status.state === "READY" ? "ok" : "hold",
    checkedAt: new Date().toISOString(),
    googleBusinessProfile: status,
    policy: googleBusinessProfileBrowserPolicy(),
  }, { headers:{"Cache-Control":"no-store"} });
}
