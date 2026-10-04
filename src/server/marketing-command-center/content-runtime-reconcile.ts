type DbError = { message?: string } | null;
type DbResult = { data?: unknown; error?: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  contains(column: string, value: unknown): Query;
  update(values: unknown): Query;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

function dbOf(value: unknown): UntypedDb {
  return value as UntypedDb;
}

function rowOf(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(rowOf) : [];
}

function driveFileIds(assetCell: string) {
  return assetCell
    .split(/\r?\n/)
    .map((line) => line.match(/\|\s*Drive\s+([^\s]+)\s*$/i)?.[1] ?? "")
    .filter(Boolean);
}

export async function reconcileMarketingContentRuntime(
  dbValue: unknown,
  input: {
    contentId: string;
    assetCell: string;
    publishStatus: string;
    approvalStatus: string;
    qaMedia: string;
    qaStatus: string;
    resetVariantMedia?: boolean;
  },
) {
  const db = dbOf(dbValue);
  const now = new Date().toISOString();

  const recordsResult = await db
    .from("sync_records")
    .select("id,data")
    .eq("source_key", "marketing-shadow-content")
    .contains("data", { CONTENT_ID: input.contentId });
  if (recordsResult.error) {
    throw new Error(
      recordsResult.error.message ?? "runtime_sync_records_read_failed",
    );
  }

  const records = rowsOf(recordsResult.data);
  if (!records.length) {
    throw new Error("runtime_sync_record_missing");
  }

  for (const record of records) {
    const id = String(record.id ?? "").trim();
    if (!id) continue;
    const currentData = rowOf(record.data);
    const nextData = {
      ...currentData,
      ASSET_IDS: input.assetCell,
      PUBLISH_STATUS: input.publishStatus,
      APPROVAL_STATUS: input.approvalStatus,
      QA_MEDIA: input.qaMedia,
      QA_STATUS: input.qaStatus,
    };
    const result = await db
      .from("sync_records")
      .update({ data: nextData, synced_at: now })
      .eq("id", id);
    if (result.error) {
      throw new Error(
        result.error.message ?? "runtime_sync_record_update_failed",
      );
    }
  }

  const fileIds = driveFileIds(input.assetCell);
  const itemResult = await db
    .from("marketing_content_items")
    .update({
      asset_ids: fileIds,
      publish_status: input.publishStatus,
      approval_status: input.approvalStatus,
      updated_at: now,
    })
    .eq("content_id", input.contentId);
  if (itemResult.error) {
    throw new Error(
      itemResult.error.message ?? "runtime_content_item_update_failed",
    );
  }

  if (input.resetVariantMedia) {
    const variantResult = await db
      .from("marketing_content_variants")
      .update({
        media_asset_ids: [],
        qa_status: "NEED_VERIFY",
        approval_status: "PENDING",
        publish_status: "HOLD",
        updated_at: now,
      })
      .eq("content_id", input.contentId);
    if (variantResult.error) {
      throw new Error(
        variantResult.error.message ?? "runtime_content_variant_update_failed",
      );
    }
  }

  return { recordCount: records.length, fileIds };
}
