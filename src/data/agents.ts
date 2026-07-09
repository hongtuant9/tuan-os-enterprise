export type AgentStatus = "online" | "offline" | "idle";

export type Agent = {
  id: string;
  name: string;
  unit: string;
  status: AgentStatus;
  currentTask: string;
  lastActive: string;
};

export const agents: Agent[] = [
  {
    id: "agent-reception",
    name: "Reception AI",
    unit: "Hospitality AI",
    status: "online",
    currentTask: "Replying to guest messages",
    lastActive: "Just now",
  },
  {
    id: "agent-marketing",
    name: "Marketing AI",
    unit: "Marketing AI",
    status: "online",
    currentTask: "Scheduling social content",
    lastActive: "2 min ago",
  },
  {
    id: "agent-finance",
    name: "Finance AI",
    unit: "Finance AI",
    status: "online",
    currentTask: "Reconciling OTA payouts",
    lastActive: "5 min ago",
  },
  {
    id: "agent-isteam",
    name: "iSTEAM AI",
    unit: "iSTEAM AI",
    status: "idle",
    currentTask: "Waiting on enrollment copy approval",
    lastActive: "24 min ago",
  },
  {
    id: "agent-knowledge",
    name: "Knowledge Sync Agent",
    unit: "Knowledge Center",
    status: "offline",
    currentTask: "Google Drive sync (v0.3)",
    lastActive: "Not yet deployed",
  },
  {
    id: "agent-ceo",
    name: "CEO Assistant AI",
    unit: "CEO Overview",
    status: "online",
    currentTask: "Compiling daily priority brief",
    lastActive: "1 min ago",
  },
];
