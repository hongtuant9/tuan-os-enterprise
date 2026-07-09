export type TaskStatus = "todo" | "in-progress" | "blocked" | "done";
export type TaskPriority = "high" | "medium" | "low";

export type Task = {
  id: string;
  title: string;
  unit: string;
  owner: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
};
