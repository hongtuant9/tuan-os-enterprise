import StatusPill from "./StatusPill";
import { agents } from "@/data/agents";

export default function AgentsStatus() {
  const onlineCount = agents.filter((a) => a.status === "online").length;

  return (
    <section id="ai-agents" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          AI Agents Status
        </h2>
        <span className="text-xs text-[var(--ink-muted)]">{onlineCount}/{agents.length} online</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{agent.name}</h3>
                <p className="text-xs text-[var(--ink-muted)]">{agent.unit}</p>
              </div>
              <StatusPill status={agent.status} pulse={agent.status === "online"} />
            </div>
            <p className="text-sm text-[var(--ink-secondary)]">{agent.currentTask}</p>
            <p className="text-xs text-[var(--ink-muted)]">Last active: {agent.lastActive}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
