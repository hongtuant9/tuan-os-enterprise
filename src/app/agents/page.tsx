import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";
import { TCE_AGENT_REGISTRY } from "@/server/agents/tce-registry";

export default async function AgentsPage() {
  const container = await getRequestContainer();
  const live = await container.agents.list();
  const byName = new Map(live.map((item) => [item.name, item]));

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">15 AI Agent</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">Đội AI của Tam Coc Experience</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">Anh không cần chọn Agent khi giao việc. Chỉ cần hỏi AI Manager; hệ thống tự route tới đúng Agent. Trang này dùng để xem chức năng và trạng thái.</p>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TCE_AGENT_REGISTRY.map((agent) => {
            const runtime = byName.get(agent.name);
            const status = runtime?.status ?? "idle";
            return (
              <article key={agent.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="text-sm font-semibold text-[var(--ink-primary)]">{agent.name}</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">{agent.permission} · {agent.mode}</p></div>
                  <span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-[11px] font-semibold uppercase text-[var(--ink-secondary)]">{status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-secondary)]">{agent.mission}</p>
                <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]"><b>Nguồn:</b> {agent.sources.join(" · ")}</p>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
