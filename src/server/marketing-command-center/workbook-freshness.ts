import "server-only";

import { getAdminContainer } from "@/server/container";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getFileMetadata } from "@/server/integrations/google/drive-client";
import { runMarketingCommandCenterCycle } from "@/server/marketing-command-center/cycle";

const MARKETING_WORKBOOK_SOURCE_KEYS = [
  "marketing-campaign-plan",
  "marketing-channel-plan",
  "marketing-action-plan",
  "marketing-market-intelligence",
  "marketing-shadow-content",
] as const;

export type MarketingWorkbookFreshness = {
  state: "LIVE" | "PARTIAL" | "ERROR";
  workbookId: string | null;
  workbookModifiedAt: string | null;
  lastSyncedAt: string | null;
  changed: boolean;
  sourcesChecked: number;
  sourcesSynced: string[];
  errors: string[];
};

function latestIso(values: Array<string | null | undefined>): string | null {
  const valid = values.filter((value): value is string => Boolean(value));
  if (!valid.length) return null;
  return valid.sort().at(-1) ?? null;
}

export async function ensureMarketingWorkbookFresh(
  now = new Date(),
): Promise<MarketingWorkbookFreshness> {
  const container = getAdminContainer();
  const errors: string[] = [];

  try {
    const sourceRows = (
      await Promise.all(
        MARKETING_WORKBOOK_SOURCE_KEYS.map((key) => container.syncSources.findByKey(key)),
      )
    ).filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (!sourceRows.length) {
      return {
        state: "ERROR",
        workbookId: null,
        workbookModifiedAt: null,
        lastSyncedAt: null,
        changed: false,
        sourcesChecked: 0,
        sourcesSynced: [],
        errors: ["Không tìm thấy marketing workbook sync source."],
      };
    }

    const workbookIds = [...new Set(sourceRows.map((row) => row.sheet_id).filter(Boolean))] as string[];
    if (workbookIds.length !== 1) {
      return {
        state: "ERROR",
        workbookId: workbookIds[0] ?? null,
        workbookModifiedAt: null,
        lastSyncedAt: latestIso(sourceRows.map((row) => row.last_synced_at)),
        changed: false,
        sourcesChecked: sourceRows.length,
        sourcesSynced: [],
        errors: ["Marketing workbook sources không cùng trỏ về một Workbook canonical."],
      };
    }

    const workbookId = workbookIds[0];
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const metadata = await getFileMetadata(workbookId, auth);
    const modifiedAt = metadata.modifiedTime || null;

    if (!modifiedAt) {
      return {
        state: "ERROR",
        workbookId,
        workbookModifiedAt: null,
        lastSyncedAt: latestIso(sourceRows.map((row) => row.last_synced_at)),
        changed: false,
        sourcesChecked: sourceRows.length,
        sourcesSynced: [],
        errors: ["Không đọc được modifiedTime của Workbook."],
      };
    }

    const staleSources = sourceRows.filter((source) => source.last_cursor !== modifiedAt);
    const synced: string[] = [];

    const outcomes = await Promise.all(
      staleSources.map(async (source) => ({
        source,
        summary: await container.sync.run(
          source.key,
          "manual",
          "marketing-workbook-freshness-gate",
        ),
      })),
    );
    for (const { source, summary } of outcomes) {
      if (summary.status === "failed") {
        errors.push(source.key + ": " + (summary.errorMessage || "sync failed"));
      } else {
        synced.push(source.key);
      }
    }

    if (staleSources.length) {
      const cycle = await runMarketingCommandCenterCycle(now);
      if (cycle.runtimeError) errors.push("marketing-command-center: " + cycle.runtimeError);
    }

    const refreshed = (
      await Promise.all(
        MARKETING_WORKBOOK_SOURCE_KEYS.map((key) => container.syncSources.findByKey(key)),
      )
    ).filter((row): row is NonNullable<typeof row> => Boolean(row));

    const allCurrent = refreshed.length === sourceRows.length &&
      refreshed.every((source) => source.last_cursor === modifiedAt);

    return {
      state: errors.length ? "PARTIAL" : allCurrent ? "LIVE" : "PARTIAL",
      workbookId,
      workbookModifiedAt: modifiedAt,
      lastSyncedAt: latestIso(refreshed.map((row) => row.last_synced_at)),
      changed: staleSources.length > 0,
      sourcesChecked: refreshed.length,
      sourcesSynced: synced,
      errors,
    };
  } catch (error) {
    return {
      state: "ERROR",
      workbookId: null,
      workbookModifiedAt: null,
      lastSyncedAt: null,
      changed: false,
      sourcesChecked: 0,
      sourcesSynced: [],
      errors: [error instanceof Error ? error.message : "Unknown workbook freshness error"],
    };
  }
}
