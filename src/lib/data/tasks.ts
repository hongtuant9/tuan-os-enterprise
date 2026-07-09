import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { tasks as mockTasks, type Task, type TaskPriority, type TaskStatus } from "@/data/tasks";

export async function getTasks(): Promise<Task[]> {
  if (!isSupabaseConfigured()) {
    return mockTasks;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return mockTasks;
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
