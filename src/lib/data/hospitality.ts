import { createClient } from "@/lib/supabase/server";
import type { Property, PropertyStatus } from "@/data/hospitality";

export async function getProperties(): Promise<Property[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("getProperties failed:", error?.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status as PropertyStatus,
    occupancy: row.occupancy,
    checkInsToday: row.check_ins_today,
    checkOutsToday: row.check_outs_today,
    pendingGuestMessages: row.pending_guest_messages,
  }));
}
