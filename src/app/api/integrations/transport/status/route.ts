import { NextResponse } from "next/server";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { providerTransportSnapshot } from "@/server/integrations/provider-transport";

export async function GET() {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(session.role, "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    policy: "API → Terminal/script → self-hosted DOM/browser → GUI",
    paidBrowserSaasAllowed: false,
    providers: providerTransportSnapshot(),
  });
}
