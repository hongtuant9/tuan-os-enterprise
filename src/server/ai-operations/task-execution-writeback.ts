import "server-only";

import { setSheetValue } from "@/server/integrations/google/drive-client";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import type { DepartmentExecutionResult } from "./department-executor";

export const TASK_EXECUTION_WRITEBACK_VERSION = "2026-09-26.v1";

function safeCellText(value: string, max = 900): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function executionGate(result: DepartmentExecutionResult): string {
  switch (result.state) {
    case "EXECUTED_INTERNAL":
      return "AUTO_EXECUTED_INTERNAL_NEEDS_DOD_READBACK";
    case "WAITING_APPROVAL":
      return "AUTO_WAITING_APPROVAL";
    case "WAITING_EXECUTION_TRANSPORT":
      return "AUTO_WAITING_EXECUTION_TRANSPORT";
    case "NEED_EXECUTOR":
      return "AUTO_NEED_EXECUTOR";
    case "NEED_VERIFY":
      return "AUTO_NEED_VERIFY";
    case "NO_TASK":
      return "AUTO_NO_TASK";
  }
}

function blockerValue(result: DepartmentExecutionResult): string | null {
  if (!["WAITING_EXECUTION_TRANSPORT", "NEED_EXECUTOR", "NEED_VERIFY"].includes(result.state)) {
    return null;
  }
  return safeCellText(`AUTO_EXECUTION:${result.state} — ${result.reason}`, 700);
}

export async function writeTaskExecutionCheckpoint(input: {
  spreadsheetId: string;
  rowNumber: number;
  taskId: string;
  result: DepartmentExecutionResult;
  now: Date;
}): Promise<{ written: boolean; cells: string[] }> {
  if (!input.spreadsheetId || !Number.isInteger(input.rowNumber) || input.rowNumber < 2) {
    return { written: false, cells: [] };
  }
  if (!input.result.taskId || input.result.taskId !== input.taskId) {
    return { written: false, cells: [] };
  }

  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
  const cells: string[] = [];

  // TASK_MASTER columns: K=BLOCKER, S=LAST_UPDATED, X=EXECUTION_GATE.
  const blocker = blockerValue(input.result);
  if (blocker) {
    await setSheetValue(input.spreadsheetId, `TASK_MASTER!K${input.rowNumber}`, blocker, auth);
    cells.push(`K${input.rowNumber}`);
  }

  await setSheetValue(
    input.spreadsheetId,
    `TASK_MASTER!S${input.rowNumber}`,
    input.now.toISOString(),
    auth,
  );
  cells.push(`S${input.rowNumber}`);

  await setSheetValue(
    input.spreadsheetId,
    `TASK_MASTER!X${input.rowNumber}`,
    executionGate(input.result),
    auth,
  );
  cells.push(`X${input.rowNumber}`);

  return { written: true, cells };
}
