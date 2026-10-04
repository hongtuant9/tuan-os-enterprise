import { NextRequest, NextResponse } from "next/server";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getAdminContainer } from "@/server/container";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import {
  getSheetValues,
  setSheetValue,
} from "@/server/integrations/google/drive-client";
import { reconcileMarketingContentRuntime } from "@/server/marketing-command-center/content-runtime-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TAB = "SHADOW_CONTENT_QUEUE";
const MAX_ROWS = 300;

function q(name: string) {
  return `'${name.replaceAll("'", "''")}'`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseAssetLine(line: string) {
  const match = line.match(/^(.*?)\s*\|\s*Drive\s+([^\s]+)\s*$/i);
  return {
    line,
    name: clean(match?.[1] ?? ""),
    fileId: clean(match?.[2] ?? ""),
  };
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ contentId: string }> },
) {
  const requestDb = await createRequestClient();
  const session = await getCurrentSession(requestDb);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasMinimumRole(session.role, "manager")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { contentId: rawContentId } = await context.params;
    const contentId = clean(rawContentId);
    const payload = await req.json().catch(() => ({}));
    const fileId = clean(payload?.fileId);

    if (!contentId || !fileId) {
      return NextResponse.json(
        { error: "missing_content_id_or_file_id" },
        { status: 400 },
      );
    }

    const admin = getAdminContainer();
    const source = await admin.syncSources.findByKey(
      "marketing-shadow-content",
    );
    if (!source?.sheet_id) {
      return NextResponse.json(
        { error: "canonical_workbook_missing" },
        { status: 500 },
      );
    }

    const auth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForDriveWrite();
    const values = await getSheetValues(
      source.sheet_id,
      `${q(CONTENT_TAB)}!A1:AK${MAX_ROWS}`,
      auth,
    );
    const rowIndex = values.findIndex(
      (row, index) => index > 0 && clean(row[0]) === contentId,
    );
    if (rowIndex < 0) {
      return NextResponse.json({ error: "content_not_found" }, { status: 404 });
    }

    const row = values[rowIndex] ?? [];
    const publishStatus = clean(row[9]);
    const approvalStatus = clean(row[21]);
    if (
      /SCHEDULED|PUBLISHED|FB_SCHEDULED/i.test(publishStatus) ||
      /OWNER_APPROVED_FOR_METRICOOL/i.test(approvalStatus)
    ) {
      return NextResponse.json(
        { error: "content_locked_after_approval_or_publish" },
        { status: 409 },
      );
    }

    const currentLines = clean(row[18])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = currentLines.map(parseAssetLine);
    const matched = parsed.find((asset) => asset.fileId === fileId);

    if (!matched) {
      await reconcileMarketingContentRuntime(admin.db, {
        contentId,
        assetCell: currentLines.join("\n"),
        publishStatus: publishStatus || "READY_FOR_OWNER_REVIEW",
        approvalStatus: approvalStatus || "PENDING_OWNER_APPROVAL",
        qaMedia: clean(row[26]) || "NEED VERIFY",
        qaStatus: clean(row[32]) || "HOLD",
      });
      return NextResponse.json({
        ok: true,
        alreadyDetached: true,
        deletedFromDrive: false,
        message:
          "Asset đã không còn gắn trong canonical. Runtime đã được đồng bộ lại; hãy tải lại trang.",
      });
    }

    const nextLines = parsed
      .filter((asset) => asset.fileId !== fileId)
      .map((asset) => asset.line);
    const nextAssetCell = nextLines.join("\n");
    const sheetRow = rowIndex + 1;

    await setSheetValue(
      source.sheet_id,
      `${q(CONTENT_TAB)}!S${sheetRow}`,
      nextAssetCell,
      auth,
    );
    await setSheetValue(
      source.sheet_id,
      `${q(CONTENT_TAB)}!J${sheetRow}`,
      "READY_FOR_OWNER_REVIEW",
      auth,
    );
    await setSheetValue(
      source.sheet_id,
      `${q(CONTENT_TAB)}!V${sheetRow}`,
      "PENDING_OWNER_APPROVAL",
      auth,
    );
    await setSheetValue(
      source.sheet_id,
      `${q(CONTENT_TAB)}!AA${sheetRow}`,
      "NEED VERIFY",
      auth,
    );
    await setSheetValue(
      source.sheet_id,
      `${q(CONTENT_TAB)}!AG${sheetRow}`,
      "HOLD",
      auth,
    );

    const verify = await getSheetValues(
      source.sheet_id,
      `${q(CONTENT_TAB)}!S${sheetRow}:AG${sheetRow}`,
      auth,
    );
    const verifiedAssets = clean(verify?.[0]?.[0]);
    if (verifiedAssets.includes(fileId)) {
      return NextResponse.json(
        { error: "canonical_readback_failed" },
        { status: 502 },
      );
    }

    await reconcileMarketingContentRuntime(admin.db, {
      contentId,
      assetCell: nextAssetCell,
      publishStatus: "READY_FOR_OWNER_REVIEW",
      approvalStatus: "PENDING_OWNER_APPROVAL",
      qaMedia: "NEED VERIFY",
      qaStatus: "HOLD",
      resetVariantMedia: true,
    });

    return NextResponse.json({
      ok: true,
      removed: { fileId, name: matched.name },
      remainingAssetCount: nextLines.length,
      deletedFromDrive: false,
      approvalReset: true,
      message:
        "Đã gỡ media khỏi bài viết. File gốc vẫn giữ trong thư viện; canonical và runtime đã đồng bộ, media cần xác minh lại trước khi duyệt đăng.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "detach_asset_error";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
