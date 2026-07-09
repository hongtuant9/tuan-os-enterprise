import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { properties as mockProperties, type Property, type PropertyStatus } from "@/data/hospitality";

export async function getProperties(): Promise<Property[]> {
  if (!isSupabaseConfigured()) {
    return mockProperties;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hospitality_properties")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data) {
    return mockProperties;
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
