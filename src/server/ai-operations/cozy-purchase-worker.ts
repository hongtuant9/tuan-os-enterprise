import "server-only";

import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { SyncRecordsRepository } from "@/server/repositories/sync-records.repository";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";
import { getAdminContainer } from "@/server/container";
import type { Json } from "@/lib/supabase/types";

const SOURCE_KEY = "cozy_purchase_drive_v1";
const ROOT_FOLDER_ID = process.env.COZY_PURCHASE_DRIVE_FOLDER_ID || "1EyNErrhhCICeDiz3b-qAEycxAO1-JNYU";
const TASK_SHEET_ID = "1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM";
const TASK_ID = "TASK-COZY-PURCHASE-AUTO-001";
const MAX_SCAN_FILES = Math.min(50, Math.max(1, Number(process.env.TCE_COZY_PURCHASE_MAX_SCAN_FILES || 20)));

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  md5Checksum: string | null;
  parents: string[];
};

type ExistingState = {
  fingerprint?: string;
  status?: string;
  updatedAt?: string;
  note?: string;
};

type WorkerState =
  | "PASS_METADATA_SCAN"
  | "HOLD_GOOGLE_DRIVE_CONTENT_SCOPE"
  | "HOLD_VISION_DISABLED"
  | "HOLD_KIOTVIET_WRITE_PATH_UNVERIFIED"
  | "READY_FOR_EXTRACTION";

function enabled(name: string, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return defaultValue;
}

function fingerprint(file: DriveFile) {
  return [file.id, file.modifiedTime ?? "", file.md5Checksum ?? ""].join("|");
}

function isEvidenceMime(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

async function listFolderTree(): Promise<DriveFile[]> {
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
  const drive = google.drive({ version: "v3", auth });
  const queue = [ROOT_FOLDER_ID];
  const seenFolders = new Set<string>();
  const files: DriveFile[] = [];

  while (queue.length) {
    const folderId = queue.shift()!;
    if (seenFolders.has(folderId)) continue;
    seenFolders.add(folderId);

    let pageToken: string | undefined;
    do {
      const page = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,parents)",
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const raw of page.data.files ?? []) {
        if (!raw.id || !raw.name || !raw.mimeType) continue;
        if (raw.mimeType === "application/vnd.google-apps.folder") {
          queue.push(raw.id);
          continue;
        }
        if (!isEvidenceMime(raw.mimeType)) continue;
        files.push({
          id: raw.id,
          name: raw.name,
          mimeType: raw.mimeType,
          modifiedTime: raw.modifiedTime ?? null,
          md5Checksum: raw.md5Checksum ?? null,
          parents: raw.parents ?? [],
        });
      }
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return files
    .sort((a, b) => String(b.modifiedTime ?? "").localeCompare(String(a.modifiedTime ?? "")))
    .slice(0, MAX_SCAN_FILES);
}

async function canReadFileContent(fileId: string): Promise<boolean> {
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
  const drive = google.drive({ version: "v3", auth });
  try {
    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    return Boolean(response.data);
  } catch (error) {
    const status = Number((error as { response?: { status?: number } })?.response?.status ?? 0);
    if (status === 401 || status === 403) return false;
    throw error;
  }
}

async function updateTask(blocker: string, nextAction: string, note: string) {
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
  const sheets = google.sheets({ version: "v4", auth });
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: TASK_SHEET_ID,
    range: "'TASK_MASTER'!A1:Z1000",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = (current.data.values ?? []) as string[][];
  const index = rows.findIndex((row) => row[0] === TASK_ID);
  if (index < 0) return;

  const rowNumber = index + 1;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: TASK_SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `'TASK_MASTER'!K${rowNumber}:K${rowNumber}`, values: [[blocker]] },
        { range: `'TASK_MASTER'!M${rowNumber}:M${rowNumber}`, values: [[nextAction]] },
        { range: `'TASK_MASTER'!S${rowNumber}:T${rowNumber}`, values: [[new Date().toISOString(), note]] },
      ],
    },
  });
}

async function recordState(file: DriveFile, status: WorkerState, note: string) {
  const repo = new SyncRecordsRepository(createAdminClient());
  await repo.upsert({
    sourceKey: SOURCE_KEY,
    externalId: file.id,
    targetTable: null,
    targetId: null,
    data: {
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      md5Checksum: file.md5Checksum,
      fingerprint: fingerprint(file),
      status,
      note,
      updatedAt: new Date().toISOString(),
    } as unknown as Json,
  });
}

async function existingState(fileId: string): Promise<ExistingState | null> {
  const repo = new SyncRecordsRepository(createAdminClient());
  const row = await repo.findByExternalId(SOURCE_KEY, fileId);
  if (!row?.data || typeof row.data !== "object" || Array.isArray(row.data)) return null;
  return row.data as unknown as ExistingState;
}

export type CozyPurchaseWorkerResult = {
  ok: boolean;
  scanned: number;
  changed: number;
  state: WorkerState;
  driveContentReadable: boolean;
  visionEnabled: boolean;
  kiotVietPurchaseProbeStatus: number;
  notes: string[];
};

export async function runCozyPurchaseWorker(): Promise<CozyPurchaseWorkerResult> {
  const container = getAdminContainer();
  const notes: string[] = [];
  const files = await listFolderTree();
  let changed = 0;

  for (const file of files) {
    const existing = await existingState(file.id);
    if (existing?.fingerprint === fingerprint(file)) continue;
    await recordState(file, "PASS_METADATA_SCAN", "Drive metadata detected; awaiting extraction gate.");
    changed += 1;
  }

  const newest = files[0];
  const driveContentReadable = newest ? await canReadFileContent(newest.id) : true;
  const visionEnabled =
    enabled("TCE_COZY_PURCHASE_VISION_ENABLED", false) &&
    Boolean(process.env.OPENAI_API_KEY?.trim()) &&
    Boolean(process.env.TCE_COZY_PURCHASE_VISION_MODEL?.trim());

  const fnb = new KiotVietFnbClient();
  const probe = fnb.isConfigured()
    ? await fnb.probeRetailPurchaseOrders()
    : { ok: false, status: 0, data: null };

  let state: WorkerState = "READY_FOR_EXTRACTION";
  let blocker = "";
  let nextAction = "Scan và xử lý evidence mới theo fail-closed.";

  if (!driveContentReadable) {
    state = "HOLD_GOOGLE_DRIVE_CONTENT_SCOPE";
    blocker = "GOOGLE_DRIVE_CONTENT_SCOPE_RECONNECT";
    nextAction = "Reconnect Google một lần với drive.readonly để VPS đọc bytes của ảnh/PDF; không cần desktop sau bước consent.";
    notes.push("Google OAuth hiện chỉ đủ đọc metadata, chưa đủ đọc nội dung ảnh/PDF.");
  } else if (!visionEnabled) {
    state = "HOLD_VISION_DISABLED";
    blocker = "VISION_EXTRACTION_BUDGET_APPROVAL";
    nextAction = "Giữ metadata scan tự động; chỉ bật vision extraction sau khi Owner duyệt model + daily cost cap.";
    notes.push("Vision extraction đang fail-closed: chưa bật model/budget.");
  } else if (!probe.ok) {
    state = "HOLD_KIOTVIET_WRITE_PATH_UNVERIFIED";
    blocker = "KIOTVIET_FNB_PURCHASE_WRITE_PATH_UNVERIFIED";
    nextAction = "Tiếp tục extraction/mapping; chỉ mở KiotViet purchase write khi read-only compatibility probe PASS hoặc server-side browser path được phê duyệt.";
    notes.push("F&B token chưa được xác minh tương thích với Retail purchaseorders API.");
  }

  if (newest && state !== "READY_FOR_EXTRACTION") {
    await recordState(newest, state, notes.join(" "));
  }

  const note =
    `VPS worker scan=${files.length}, changed=${changed}, drive_content=${driveContentReadable ? "PASS" : "HOLD"}, ` +
    `vision=${visionEnabled ? "ENABLED" : "HOLD"}, kiot_purchase_probe_http=${probe.status}. ` +
    notes.join(" ");

  await updateTask(blocker, nextAction, note);
  await container.activityLog.record({
    agent: "AI CFO/COO — Cozy Purchase Worker",
    unit: "Cozy Garden",
    message: note,
    type: state === "READY_FOR_EXTRACTION" ? "action" : "alert",
  });

  return {
    ok: state === "READY_FOR_EXTRACTION",
    scanned: files.length,
    changed,
    state,
    driveContentReadable,
    visionEnabled,
    kiotVietPurchaseProbeStatus: probe.status,
    notes,
  };
}
