"use server";

import { revalidatePath } from "next/cache";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { buildContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import type { TaskStatus } from "@/data/tasks";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<ActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);

  if (!session) {
    return { ok: false, error: "You must be signed in to do that." };
  }

  try {
    await buildContainer(db).tasks.updateStatus(id, status, session.email ?? session.userId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }

  revalidatePath("/");
  return { ok: true };
}
