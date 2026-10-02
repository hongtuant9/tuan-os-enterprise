import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { google } from "googleapis";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getAdminContainer } from "@/server/container";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import {
  getSheetValues,
  setSheetValue,
} from "@/server/integrations/google/drive-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TAB = "SHADOW_CONTENT_QUEUE";
const MAX_ROWS = 300;
const MEDIA_LIBRARY_FOLDERS = {
  EXPERIENCE: "1tyy8PhTOLMCwK2mkSNKgm2PDjrWMxkj6",
  COZY_GARDEN: "1cRd-duz3eGh7d0ekak44bUC_a5gCIgVs",
  LAVENDER: "1PguwKr3YFVwX-nFD-pJD3Knef8J397FN",
  RUBY: "1yJVDm9aVBay58-pw3-S6lw9oba3568BF",
} as const;

function q(name: string) {
  return `'${name.replaceAll("'", "''")}'`;
}
function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const requestDb = await createRequestClient();
  const session = await getCurrentSession(requestDb);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasMinimumRole(session.role, "manager")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const contentId = clean(form.get("contentId"));
    const file = form.get("file");
    const attachToCanonical = clean(form.get("attachToCanonical")) !== "false";
    if (!contentId)
      return NextResponse.json(
        { error: "missing_content_id" },
        { status: 400 },
      );
    if (!(file instanceof File))
      return NextResponse.json({ error: "missing_file" }, { status: 400 });
    if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: "file_size_out_of_range" },
        { status: 400 },
      );
    }
    const allowed =
      /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm))$/i.test(file.type);
    if (!allowed)
      return NextResponse.json(
        { error: "unsupported_media_type" },
        { status: 400 },
      );

    const admin = getAdminContainer();
    const source = await admin.syncSources.findByKey(
      "marketing-shadow-content",
    );
    if (!source?.sheet_id)
      return NextResponse.json(
        { error: "canonical_workbook_missing" },
        { status: 500 },
      );

    const auth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const values = await getSheetValues(
      source.sheet_id,
      `${q(CONTENT_TAB)}!A1:AK${MAX_ROWS}`,
      auth,
    );
    const rowIndex = values.findIndex(
      (row, index) => index > 0 && clean(row[0]) === contentId,
    );
    if (rowIndex < 0)
      return NextResponse.json({ error: "content_not_found" }, { status: 404 });
    const row = values[rowIndex] ?? [];
    const existingAssets = clean(row[18]);
    const serviceLine = clean(row[14]).toUpperCase();
    const parentId = serviceLine.includes("COZY")
      ? MEDIA_LIBRARY_FOLDERS.COZY_GARDEN
      : serviceLine.includes("LAVENDER")
        ? MEDIA_LIBRARY_FOLDERS.LAVENDER
        : serviceLine.includes("RUBY")
          ? MEDIA_LIBRARY_FOLDERS.RUBY
          : MEDIA_LIBRARY_FOLDERS.EXPERIENCE;

    const drive = google.drive({ version: "v3", auth });

    const bytes = Buffer.from(await file.arrayBuffer());
    const created = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [parentId],
      },
      media: {
        mimeType: file.type,
        body: Readable.from(bytes),
      },
      fields: "id,name,mimeType,size,parents",
    });
    const fileId = created.data.id;
    if (!fileId)
      return NextResponse.json(
        { error: "drive_upload_missing_id" },
        { status: 502 },
      );

    if (attachToCanonical) {
      const nextAsset = `${file.name} | Drive ${fileId}`;
      const nextAssets = existingAssets
        ? `${existingAssets}
${nextAsset}`
        : nextAsset;
      await setSheetValue(
        source.sheet_id,
        `${q(CONTENT_TAB)}!S${rowIndex + 1}`,
        nextAssets,
        auth,
      );

      const verify = await getSheetValues(
        source.sheet_id,
        `${q(CONTENT_TAB)}!S${rowIndex + 1}:S${rowIndex + 1}`,
        auth,
      );
      if (!clean(verify?.[0]?.[0]).includes(fileId)) {
        return NextResponse.json(
          { error: "canonical_readback_failed" },
          { status: 502 },
        );
      }

      const sync = await admin.sync.run(
        "marketing-shadow-content",
        "manual",
        session.email ?? session.userId,
      );
      if (sync.status === "failed") {
        return NextResponse.json(
          { error: "runtime_sync_failed", detail: sync.errorMessage ?? null },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      file: { id: fileId, name: file.name, mimeType: file.type },
      libraryFolderId: parentId,
      attachedToCanonical: attachToCanonical,
      message: attachToCanonical
        ? "Upload vào Owner-approved TCE media library + canonical attach + read-back PASS"
        : "Upload platform rendition vào Owner-approved TCE media library; canonical original assets không bị thay đổi.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_error";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
