import { NextResponse } from "next/server";
import { getAdminContainer, getRequestContainer } from "@/server/container";
import { authenticateApiRequest, principalHasMinimumRole, principalLabel } from "@/server/auth/api-auth";
import { isSyncSourceKey } from "@/server/sync/registry";

export async function POST(request: Request, { params }: { params: Promise<{ source: string }> }) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!principalHasMinimumRole(principal, "manager")) {
    return NextResponse.json({ error: "Forbidden — manager role or higher required" }, { status: 403 });
  }

  const { source } = await params;
  if (!isSyncSourceKey(source)) {
    return NextResponse.json({ error: `Unknown sync source "${source}"` }, { status: 404 });
  }

  // A service caller has no Supabase session, so RLS's authenticated-only
  // write policies (tasks, approvals, activity_logs, sync_*) would reject
  // it — use the service-role container for those, RLS-scoped for users.
  const container = principal.kind === "service" ? getAdminContainer() : await getRequestContainer();
  const trigger = principal.kind === "service" ? "n8n" : "manual";

  try {
    const summary = await container.sync.run(source, trigger, principalLabel(principal));
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
