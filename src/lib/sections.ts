export type Section = {
  id: string;
  name: string;
  description: string;
  status: "online" | "monitoring" | "idle";
};

export const sections: Section[] = [
  {
    id: "ceo-dashboard",
    name: "CEO Dashboard",
    description: "Company-wide performance at a glance",
    status: "online",
  },
  {
    id: "hospitality-ai",
    name: "Hospitality AI",
    description: "Guest messaging & reception automation",
    status: "online",
  },
  {
    id: "isteam-ai",
    name: "iSTEAM AI",
    description: "Education programs & learning ops",
    status: "monitoring",
  },
  {
    id: "marketing-ai",
    name: "Marketing AI",
    description: "Campaigns, content & channel performance",
    status: "monitoring",
  },
  {
    id: "finance-ai",
    name: "Finance AI",
    description: "Revenue, expenses & forecasting",
    status: "online",
  },
  {
    id: "logs",
    name: "Logs",
    description: "System & agent activity history",
    status: "idle",
  },
  {
    id: "settings",
    name: "Settings",
    description: "Workspace, integrations & access",
    status: "idle",
  },
];
