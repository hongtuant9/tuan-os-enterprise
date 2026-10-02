import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  const requestDb = await createRequestClient();
  const session = await getCurrentSession(requestDb);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId } = await context.params;
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }

  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const drive = google.drive({ version: "v3", auth });
    const [meta, media] = await Promise.all([
      drive.files.get({ fileId, fields: "id,name,mimeType,modifiedTime" }),
      drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }),
    ]);

    const mime = meta.data.mimeType || "application/octet-stream";
    const bytes = Buffer.from(media.data as ArrayBuffer);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "drive_media_error";
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 });
  }
}
