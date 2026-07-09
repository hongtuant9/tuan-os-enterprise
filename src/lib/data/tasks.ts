import { createClient } from "@/lib/supabase/server";
import type { Task, TaskPriority, TaskStatus } from "@/data/tasks";

export async function getTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("getTasks failed:", error?.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    unit: row.unit,
    owner: row.owner,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: row.due_date ?? "",
  }));
}
