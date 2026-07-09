import Sidebar from "@/components/Sidebar";
import CeoOverview from "@/components/CeoOverview";
import ApprovalQueue from "@/components/ApprovalQueue";
import TaskCenter from "@/components/TaskCenter";
import AgentsStatus from "@/components/AgentsStatus";
import HospitalityOperations from "@/components/HospitalityOperations";
import KnowledgeCenter from "@/components/KnowledgeCenter";
import ActivityLogs from "@/components/ActivityLogs";
import { getTasks } from "@/lib/data/tasks";
import { getApprovals } from "@/lib/data/approvals";
import { getAgents } from "@/lib/data/agents";
import { getProperties } from "@/lib/data/hospitality";
import { getLogs } from "@/lib/data/logs";

export default async function Home() {
  const [tasks, approvals, agents, properties, logs] = await Promise.all([
    getTasks(),
    getApprovals(),
    getAgents(),
    getProperties(),
    getLogs(),
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

        <CeoOverview tasks={tasks} approvals={approvals} agents={agents} properties={properties} />
        <ApprovalQueue approvals={approvals} />
        <TaskCenter tasks={tasks} />
        <AgentsStatus agents={agents} />
        <HospitalityOperations properties={properties} />
        <KnowledgeCenter />
        <ActivityLogs logs={logs} />
      </main>
    </div>
  );
}
