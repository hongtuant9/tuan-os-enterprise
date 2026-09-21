import { NextRequest, NextResponse } from "next/server";
import { ZaloOAuthService } from "@/server/integrations/zalo/oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(message: string, ok: boolean) {
  return new NextResponse(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Zalo OAuth</title></head><body style="font-family:system-ui;max-width:720px;margin:48px auto;padding:0 20px"><h1>${ok ? "Zalo OA đã kết nối" : "Zalo OA chưa kết nối"}</h1><p>${message}</p><p>Có thể đóng cửa sổ này.</p></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return page("Zalo từ chối hoặc hủy cấp quyền.", false);

  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const oaId = url.searchParams.get("oa_id")?.trim() || null;
  if (!code || !state) return page("Callback thiếu code/state.", false);

  try {
    await new ZaloOAuthService().exchangeAuthorizationCode({ code, state, oaId });
    return page("Đã lưu token server-side và sẵn sàng cho VPS tự refresh.", true);
  } catch {
    return page("Không thể hoàn tất OAuth. TUAN OS đã giữ fail-closed.", false);
  }
}
