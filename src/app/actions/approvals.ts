"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type ActionResult = { ok: true } | { ok: false; error: string };

async function setApprovalStatus(id: string, status: "approved" | "rejected"): Promise<ActionResult> {
  if (!isSupabaseAdminConfigured()) {
    // No database connected yet — the UI falls back to local mock data,
    // so there is nothing to persist server-side.
    return { ok: true };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("approvals").update({ status }).eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
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
