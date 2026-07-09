import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { approvals as mockApprovals, type Approval, type ApprovalStatus } from "@/data/approvals";

export async function getApprovals(): Promise<Approval[]> {
  if (!isSupabaseConfigured()) {
    return mockApprovals;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return mockApprovals;
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
