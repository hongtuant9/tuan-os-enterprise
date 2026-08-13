import { cozyDashboardSnapshot } from "@/lib/cozy/cozy-dashboard-data";
import type { CozyDashboardSnapshot } from "@/lib/cozy/types";

export async function getCozyDashboardSnapshot(): Promise<CozyDashboardSnapshot> {
  return cozyDashboardSnapshot;
}
