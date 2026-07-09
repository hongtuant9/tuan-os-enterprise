import Sidebar from "@/components/Sidebar";
import CeoOverview from "@/components/CeoOverview";
import ApprovalQueue from "@/components/ApprovalQueue";
import TaskCenter from "@/components/TaskCenter";
import AgentsStatus from "@/components/AgentsStatus";
import HospitalityOperations from "@/components/HospitalityOperations";
import KnowledgeCenter from "@/components/KnowledgeCenter";
import ActivityLogs from "@/components/ActivityLogs";

export default function Home() {
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

        <CeoOverview />
        <ApprovalQueue />
        <TaskCenter />
        <AgentsStatus />
        <HospitalityOperations />
        <KnowledgeCenter />
        <ActivityLogs />
      </main>
    </div>
  );
}
