import { NextResponse } from "next/server";
import { getRequestContainer } from "@/server/container";
import { authenticateApiRequest } from "@/server/auth/api-auth";
import { isSyncSourceKey } from "@/server/sync/registry";

export async function GET(request: Request, { params }: { params: Promise<{ source: string }> }) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { source } = await params;
  if (!isSyncSourceKey(source)) {
    return NextResponse.json({ error: `Unknown sync source "${source}"` }, { status: 404 });
  }

  const container = await getRequestContainer();
  const sourceRow = await container.syncSources.findByKey(source);
  if (!sourceRow) {
    return NextResponse.json({ error: `Sync source "${source}" not found` }, { status: 404 });
  }

  const runId = new URL(request.url).searchParams.get("runId");
  const run = runId
    ? await container.syncRuns.findById(runId)
    : await container.syncRuns.findLatestForSource(sourceRow.id);

  if (!run) {
    return NextResponse.json({ run: null, logs: [] });
  }

  const logs = await container.importLogs.findForRun(run.id);
  return NextResponse.json({ run, logs });
}
