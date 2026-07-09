export type AgentStatus = "online" | "offline" | "idle";

export type Agent = {
  id: string;
  name: string;
  unit: string;
  status: AgentStatus;
  currentTask: string;
  lastActive: string;
};
