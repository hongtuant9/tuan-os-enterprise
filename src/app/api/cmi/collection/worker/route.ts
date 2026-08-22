import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";

/**
 * Worker CMI dành cho scheduler bên ngoài (n8n Cron hoặc Coolify Scheduled Task).
 * Mỗi request chỉ claim tối đa 2 Source để tránh một HTTP request kéo dài quá lâu.
 * Có thể gọi định kỳ; claim dùng SKIP LOCKED nên không lấy trùng job đang chạy.
 */
export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ error: "Forbidden — admin role or higher required" }, { status: 403 });
  }

  let limit = 1;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && "limit" in body) {
      const parsed = Number((body as { limit?: unknown }).limit);
      if (Number.isFinite(parsed)) limit = Math.min(2, Math.max(1, Math.round(parsed)));
    }
  } catch {
    // Body rỗng là hợp lệ; mặc định xử lý 1 Source.
  }

  const container = getAdminContainer();
  const results = await container.cmiCollectionQueue.processBatch(limit);
  const summary = await container.cmiCollectionQueue.summary();

  return NextResponse.json({ processed: results.length, results, queue: summary });
}
