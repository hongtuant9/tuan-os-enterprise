import Sidebar from "@/components/Sidebar";
import CeoOverview from "@/components/CeoOverview";
import ApprovalQueue from "@/components/ApprovalQueue";
import TaskCenter from "@/components/TaskCenter";
import AgentsStatus from "@/components/AgentsStatus";
import HospitalityOperations from "@/components/HospitalityOperations";
import KnowledgeCenter from "@/components/KnowledgeCenter";
import SyncStatus from "@/components/SyncStatus";
import ActivityLogs from "@/components/ActivityLogs";
import { ActivityFeedProvider } from "@/components/ActivityFeedContext";
import { getRequestContainer } from "@/server/container";

export default async function Home() {
  const container = await getRequestContainer();

  const [tasks, approvals, agents, properties, logs, businessUnits, syncSources] = await Promise.all([
    container.tasks.list(),
    container.approvals.list(),
    container.agents.list(),
    container.properties.list(),
    container.activityLog.list(20),
    container.businessUnits.list(),
    container.syncStatus.list(),
  ]);

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />

      <main className="flex-1 px-6 py-8 md:px-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">
            TUAN OS Command Center
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Unified control center for every AI-run business unit.
          </p>
        </header>

        <ActivityFeedProvider initialLogs={logs}>
          <CeoOverview
            tasks={tasks}
            approvals={approvals}
            agents={agents}
            properties={properties}
            businessUnits={businessUnits}
          />
          <ApprovalQueue approvals={approvals} />
          <TaskCenter tasks={tasks} />
          <AgentsStatus agents={agents} />
          <HospitalityOperations properties={properties} />
          <KnowledgeCenter />
          <SyncStatus sources={syncSources} />
          <ActivityLogs />
        </ActivityFeedProvider>
      </main>
    </div>
  );
}
