"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { LogEntry, LogType } from "@/data/logs";

type PushLogInput = {
  agent: string;
  unit: string;
  message: string;
  type: LogType;
};

type ActivityFeedValue = {
  logs: LogEntry[];
  pushLog: (entry: PushLogInput) => string;
  removeLog: (id: string) => void;
};

const ActivityFeedContext = createContext<ActivityFeedValue | null>(null);

export function ActivityFeedProvider({
  initialLogs,
  children,
}: {
  initialLogs: LogEntry[];
  children: ReactNode;
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [syncedInitialLogs, setSyncedInitialLogs] = useState(initialLogs);

  // Re-sync with the authoritative server data whenever the dashboard revalidates.
  // (Adjusting state during render, per https://react.dev/learn/you-might-not-need-an-effect)
  if (initialLogs !== syncedInitialLogs) {
    setSyncedInitialLogs(initialLogs);
    setLogs(initialLogs);
  }

  function pushLog(entry: PushLogInput): string {
    const id = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setLogs((current) => [{ id, timestamp: new Date().toISOString(), ...entry }, ...current]);
    return id;
  }

  function removeLog(id: string) {
    setLogs((current) => current.filter((log) => log.id !== id));
  }

  return (
    <ActivityFeedContext.Provider value={{ logs, pushLog, removeLog }}>
      {children}
    </ActivityFeedContext.Provider>
  );
}

export function useActivityFeed(): ActivityFeedValue {
  const ctx = useContext(ActivityFeedContext);
  if (!ctx) throw new Error("useActivityFeed must be used within an ActivityFeedProvider");
  return ctx;
}
