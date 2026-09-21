import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import { ZaloOAuthService, getZaloAppId } from "@/server/integrations/zalo/oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Zalo OAuth Bootstrap</title></head><body style="font-family:system-ui;max-width:720px;margin:48px auto;padding:0 20px"><h1>TUAN OS — Zalo OA Bootstrap</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

async function requireAdmin(request: NextRequest) {
  const principal = await authenticateApiRequest(request);
  if (!principal || principal.kind !== "user") return null;
  if (!principalHasMinimumRole(principal, "admin")) return null;
  return principal;
}

export async function GET(request: NextRequest) {
  const principal = await requireAdmin(request);
  if (!principal) return html("<p>Không có quyền.</p>", 403);

  const service = new ZaloOAuthService();
  const status = await service.connectionStatus();
  const safeStatus = status.connected ? "CONNECTED" : status.configured ? "SECRET SET / OAUTH PENDING" : "NOT CONFIGURED";

  return html(`
    <p><strong>App ID:</strong> ${getZaloAppId()}</p>
    <p><strong>Trạng thái:</strong> ${safeStatus}</p>
    <p>App Secret chỉ được gửi trực tiếp tới server và không hiển thị lại.</p>
    <form method="post">
      <label>App Secret<br><input name="appSecret" type="password" autocomplete="off" required style="width:100%;padding:10px;margin:8px 0"></label>
      <button type="submit" style="padding:10px 16px">Lưu secret & bắt đầu OAuth</button>
    </form>
  `);
}

export async function POST(request: NextRequest) {
  const principal = await requireAdmin(request);
  if (!principal) return html("<p>Không có quyền.</p>", 403);

  const form = await request.formData();
  const appSecret = String(form.get("appSecret") ?? "").trim();
  if (!appSecret) return html("<p>Thiếu App Secret.</p>", 400);

  const service = new ZaloOAuthService();
  await service.saveAppSecret(appSecret);
  return NextResponse.redirect(new URL("/api/internal/zalo/oauth/start", request.url), 303);
}
