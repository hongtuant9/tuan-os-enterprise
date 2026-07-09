import { NextResponse } from "next/server";
import { getApprovals } from "@/lib/data/approvals";

export async function GET() {
  const approvals = await getApprovals();
  return NextResponse.json({ approvals });
}
