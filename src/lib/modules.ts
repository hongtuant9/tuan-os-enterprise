export type CommandCenterModule = {
  id: string;
  name: string;
};

export const commandCenterModules: CommandCenterModule[] = [
  { id: "ceo-overview", name: "CEO Overview" },
  { id: "approval-queue", name: "Approval Queue" },
  { id: "task-center", name: "Task Center" },
  { id: "ai-agents", name: "AI Agents Status" },
  { id: "hospitality-operations", name: "Hospitality Operations" },
  { id: "knowledge-center", name: "Knowledge Center" },
  { id: "sync-status", name: "Sync Status" },
  { id: "activity-logs", name: "Activity Logs" },
];
