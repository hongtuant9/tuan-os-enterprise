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

export const tasks: Task[] = [
  {
    id: "task-01",
    title: "Approve July marketing budget reallocation",
    unit: "Finance AI",
    owner: "Finance AI",
    status: "in-progress",
    priority: "high",
    dueDate: "2026-07-09",
  },
  {
    id: "task-02",
    title: "Review guest complaint escalation at Ruby Homestay",
    unit: "Hospitality AI",
    owner: "Reception AI",
    status: "todo",
    priority: "high",
    dueDate: "2026-07-09",
  },
  {
    id: "task-03",
    title: "Finalize iSTEAM summer program enrollment copy",
    unit: "iSTEAM AI",
    owner: "iSTEAM AI",
    status: "in-progress",
    priority: "medium",
    dueDate: "2026-07-10",
  },
  {
    id: "task-04",
    title: "Publish Instagram carousel for Cozy Garden",
    unit: "Marketing AI",
    owner: "Marketing AI",
    status: "todo",
    priority: "medium",
    dueDate: "2026-07-09",
  },
  {
    id: "task-05",
    title: "Reconcile OTA payouts for June",
    unit: "Finance AI",
    owner: "Finance AI",
    status: "blocked",
    priority: "high",
    dueDate: "2026-07-08",
  },
  {
    id: "task-06",
    title: "Sync new knowledge base docs from Google Drive",
    unit: "Knowledge Center",
    owner: "Knowledge Sync Agent",
    status: "todo",
    priority: "low",
    dueDate: "2026-07-11",
  },
  {
    id: "task-07",
    title: "Confirm housekeeping schedule for weekend check-ins",
    unit: "Hospitality AI",
    owner: "Reception AI",
    status: "done",
    priority: "medium",
    dueDate: "2026-07-08",
  },
];
