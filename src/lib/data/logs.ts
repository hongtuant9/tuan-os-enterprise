import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { logs as mockLogs, type LogEntry, type LogType } from "@/data/logs";

export async function getLogs(): Promise<LogEntry[]> {
  if (!isSupabaseConfigured()) {
    return mockLogs;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return mockLogs;
  }

  return data.map((row) => ({
    id: row.id,
    timestamp: row.created_at,
    agent: row.agent,
    unit: row.unit,
    message: row.message,
    type: row.type as LogType,
  }));
}
