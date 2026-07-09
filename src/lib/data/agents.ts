import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { agents as mockAgents, type Agent, type AgentStatus } from "@/data/agents";

function formatLastActive(iso: string | null): string {
  if (!iso) return "Not yet deployed";

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export async function getAgents(): Promise<Agent[]> {
  if (!isSupabaseConfigured()) {
    return mockAgents;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .select("*")
    .order("created_at", { ascending: true });

  if (error || !data) {
    return mockAgents;
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    status: row.status as AgentStatus,
    currentTask: row.current_task ?? "",
    lastActive: formatLastActive(row.last_active_at),
  }));
}
