import { NextResponse } from "next/server";
import { getRequestContainer } from "@/server/container";

export async function GET() {
  const container = await getRequestContainer();
  const stats = await container.dashboard.stats();
  return NextResponse.json({ stats });
}
