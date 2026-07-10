import { NextResponse } from "next/server";
import { getRequestContainer } from "@/server/container";

export async function GET() {
  const container = await getRequestContainer();
  const approvals = await container.approvals.list();
  return NextResponse.json({ approvals });
}
