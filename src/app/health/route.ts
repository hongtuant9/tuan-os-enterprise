import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const { db } = getAdminContainer();
    const { error } = await db.from("sync_sources").select("id").limit(1);
    if (error) {
      return NextResponse.json(
        {
          status: "degraded",
          service: "tuan-os-enterprise",
          runtime: "tce-15-agent-v2",
          agentRegistry: 15,
          checkedAt,
          checks: { app: "ok", database: "error" },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        service: "tuan-os-enterprise",
        runtime: "tce-15-agent-v2",
        agentRegistry: 15,
        checkedAt,
        checks: { app: "ok", database: "ok" },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "tuan-os-enterprise",
        runtime: "tce-15-agent-v2",
        agentRegistry: 15,
        checkedAt,
        checks: { app: "ok", database: "unavailable" },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
