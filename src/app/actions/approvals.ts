"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

async function setApprovalStatus(id: string, status: "approved" | "rejected"): Promise<ActionResult> {
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
