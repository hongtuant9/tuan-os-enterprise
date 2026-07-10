"use server";

import { revalidatePath } from "next/cache";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { buildContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import type { SyncRunSummary } from "@/server/sync/types";

type ActionResult = { ok: true; summary: SyncRunSummary } | { ok: false; error: string };

export async function triggerSync(sourceKey: string): Promise<ActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);

  if (!session) {
    return { ok: false, error: "You must be signed in to do that." };
  }
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Your role doesn't have permission to trigger a sync." };
  }

  try {
    const summary = await buildContainer(db).sync.run(sourceKey, "manual", session.email ?? session.userId);
    revalidatePath("/");
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
