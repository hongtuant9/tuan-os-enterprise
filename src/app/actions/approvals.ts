"use server";

import { revalidatePath } from "next/cache";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getAdminContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

async function setApprovalStatus(id: string, status: "approved" | "rejected"): Promise<ActionResult> {
  const requestDb = await createRequestClient();
  const session = await getCurrentSession(requestDb);

  if (!session) {
    return { ok: false, error: "You must be signed in to do that." };
  }

  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Your role doesn't have permission to decide approvals." };
  }

  try {
    await getAdminContainer().approvals.decide(id, status, session.email ?? session.userId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function approveRequest(id: string): Promise<ActionResult> {
  return setApprovalStatus(id, "approved");
}

export async function rejectRequest(id: string): Promise<ActionResult> {
  return setApprovalStatus(id, "rejected");
}
