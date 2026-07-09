import { createClient } from "@/lib/supabase/server";
import type { Approval, ApprovalStatus } from "@/data/approvals";

export async function getApprovals(): Promise<Approval[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("getApprovals failed:", error?.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary ?? "",
    unit: row.unit,
    requestedBy: row.requested_by,
    submittedAt: row.created_at,
    status: row.status as ApprovalStatus,
  }));
}
