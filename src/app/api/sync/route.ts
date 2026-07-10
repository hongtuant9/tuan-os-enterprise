import { NextResponse } from "next/server";
import { getRequestContainer } from "@/server/container";
import { authenticateApiRequest } from "@/server/auth/api-auth";

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const container = await getRequestContainer();
  const sources = await container.syncStatus.list();
  return NextResponse.json({ sources });
}
