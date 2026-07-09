export type LogType = "info" | "action" | "approval" | "alert";

export type LogEntry = {
  id: string;
  timestamp: string;
  agent: string;
  unit: string;
  message: string;
  type: LogType;
};
