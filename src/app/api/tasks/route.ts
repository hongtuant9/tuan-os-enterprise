import { NextResponse } from "next/server";
import { getRequestContainer } from "@/server/container";

export async function GET() {
  const container = await getRequestContainer();
  const tasks = await container.tasks.list();
  return NextResponse.json({ tasks });
}
