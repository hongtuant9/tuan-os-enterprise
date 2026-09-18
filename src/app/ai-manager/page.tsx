import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";
import { buildManagerBrief, type AuthoritySnapshot, type ManagerWorkItem } from "@/server/ai-operations/control-plane";
import { buildManagerItems, latestSyncAt } from "@/server/ai-operations/manager-data";
import TceManagerChat from "@/components/ai-manager/TceManagerChat";
import { TCE_AGENT_REGISTRY } from "@/server/agents/tce-registry";
import { TCE_EXECUTIVE_ORG } from "@/server/agents/tce-executive-org";

const DAY_MS = 24 * 60 * 60 * 1000;

function freshness(updatedAt?: string | null): AuthoritySnapshot["state"] {
  if (!updatedAt) return "unavailable";
  return Date.now() - new Date(updatedAt).getTime() <= DAY_MS ? "verified" : "stale";
}

function sourceStateClass(state: AuthoritySnapshot["state"]) {
  if (state === "verified") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (state === "stale") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function WorkList({ title, items, empty }: { title: string; items: ManagerWorkItem[]; empty: string }) {
  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? <p className="text-sm text-[var(--ink-muted)]">{empty}</p> : items.map((item) => (
          <div key={item.id} className="rounded-lg bg-[var(--surface-raised)] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--ink-primary)]">{item.title}</span>
              <span className="text-xs text-[var(--ink-muted)]">{item.priority}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{item.id} · {item.agent}</p>
            {item.blocker ? <p className="mt-1 text-xs text-amber-700">Blocker: {item.blocker}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
export default async function AiManagerPage() {
  const container = await getRequestContainer();
  const [{ data: taskRows }, { data: approvalRows }, { data: activityRows }, { data: syncRows }] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at").order("updated_at", { ascending: false }),
    container.db.from("approvals").select("id,title,status,updated_at").order("updated_at", { ascending: false }),
    container.db.from("activity_logs").select("id,agent,message,type,created_at").order("created_at", { ascending: false }).limit(8),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001", "l3-channel-tracking"]),
  ]);

  const tasks = taskRows ?? [];
  const approvals = approvalRows ?? [];
  const syncRecords = syncRows ?? [];
  const latestTask = latestSyncAt(syncRecords, "task-001");
  const latestApproval = latestSyncAt(syncRecords, "approval-001");
  const latestL3 = latestSyncAt(syncRecords, "l3-channel-tracking");
  const authorities: AuthoritySnapshot[] = [
    { authority: "TASK-001", state: freshness(latestTask), checkedAt: new Date().toISOString(), lastUpdatedAt: latestTask ?? undefined, note: "Supabase mirror; Google Drive remains canonical." },
    { authority: "APPROVAL-001", state: freshness(latestApproval), checkedAt: new Date().toISOString(), lastUpdatedAt: latestApproval ?? undefined, note: "Supabase mirror; Google Drive remains canonical." },
    { authority: "L3", state: freshness(latestL3), checkedAt: new Date().toISOString(), lastUpdatedAt: latestL3 ?? undefined, note: "Read-only mirror of L3 12_CHANNEL_TRACKING; Google Drive remains canonical." },
    { authority: "RUNTIME", state: "verified", checkedAt: new Date().toISOString(), note: "Current authenticated web request succeeded." },
  ];

  const items: ManagerWorkItem[] = buildManagerItems(tasks, syncRecords);
  const brief = buildManagerBrief(items, authorities);
  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="flex-1 px-6 py-8 md:px-10">
        <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">AI Operations / Manager Agent</p>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">CEO Operations Cockpit</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">TUAN OS — AI CEO Delegate chạy liên tục trên VPS, dùng TASK-001 / APPROVAL-001 / L3 / runtime để điều phối. Financial và critical mutations tiếp tục fail-closed theo approval rules.</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">MUTATION LOCKED</div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          {authorities.map((source) => (
            <div key={source.authority} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--ink-primary)]">{source.authority}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${sourceStateClass(source.state)}`}>{source.state}</span>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">{source.note}</p>
              {source.lastUpdatedAt ? <p className="mt-1 text-[11px] text-[var(--ink-muted)]">Updated: {new Date(source.lastUpdatedAt).toLocaleString("vi-VN")}</p> : null}
            </div>
          ))}
        </section>
        <section className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Manager Brief</h2>
              <p className="mt-1 text-sm text-[var(--ink-secondary)]">{brief.summary}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-[var(--surface-raised)] px-3 py-2"><b className="block text-base text-[var(--ink-primary)]">{brief.nextItems.length}</b>Next</div>
              <div className="rounded-lg bg-[var(--surface-raised)] px-3 py-2"><b className="block text-base text-[var(--ink-primary)]">{brief.blockedItems.length}</b>Blocked</div>
              <div className="rounded-lg bg-[var(--surface-raised)] px-3 py-2"><b className="block text-base text-[var(--ink-primary)]">{approvals.filter((item) => item.status === "pending").length}</b>Approval</div>
            </div>
          </div>
        </section>

        <section id="executive-org" className="mt-6 scroll-mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink-primary)]">TCE + TUAN OS Executive AI Organization</h2>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">CEO Tuấn → TUAN OS AI CEO Delegate → các AI Trưởng phòng. Đây là lớp tổ chức; 15 specialist agents bên dưới dùng chung runtime, không tạo 11 server riêng.</p>
            </div>
            <span className="text-xs text-[var(--ink-muted)]">{TCE_EXECUTIVE_ORG.length} executive roles</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {TCE_EXECUTIVE_ORG.map((role) => (
              <div key={role.id} className="rounded-lg bg-[var(--surface-raised)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm text-[var(--ink-primary)]">{role.name}</b>
                  <span className="text-[10px] uppercase text-[var(--ink-muted)]">{role.permission}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Reports to: {role.reportsTo === "CEO_TUAN" ? "CEO Tuấn" : "TUAN OS — AI CEO Delegate"}</p>
                <p className="mt-2 text-xs text-[var(--ink-secondary)]">{role.mission}</p>
                <p className="mt-2 text-[11px] text-[var(--ink-muted)]">Mapped agents: {role.mappedAgents.join(", ")}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="agent-registry" className="mt-6 scroll-mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-[var(--ink-primary)]">TCE Agent Registry</h2><span className="text-xs text-[var(--ink-muted)]">{TCE_AGENT_REGISTRY.length}/15 registered</span></div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {TCE_AGENT_REGISTRY.map((agent) => <div key={agent.id} className="rounded-lg bg-[var(--surface-raised)] p-3"><div className="flex items-center justify-between gap-2"><b className="text-sm text-[var(--ink-primary)]">{agent.name}</b><span className="text-[10px] uppercase text-[var(--ink-muted)]">{agent.mode}</span></div><p className="mt-1 text-xs text-[var(--ink-muted)]">{agent.permission} · {agent.domain}</p><p className="mt-2 text-xs text-[var(--ink-secondary)]">{agent.mission}</p></div>)}
          </div>
        </section>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <WorkList title="Ưu tiên tiếp theo" items={brief.nextItems} empty="Chưa có task đủ điều kiện để đề xuất chạy." />
          <WorkList title="Blocked" items={brief.blockedItems} empty="Không có blocker trong mirror hiện tại." />
          <WorkList title="Chờ Owner / Approval" items={brief.waitingOwnerItems} empty="Không có task được map rõ là đang chờ Owner trong mirror hiện tại." />
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Giao tiếp với TCE AI Manager</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Lệnh được route tới một trong 15 AI Agent theo intent. Các mutation L2/L3 vẫn đi qua Approval Queue và guardrail hiện hành.</p>
            <div className="mt-4"><TceManagerChat /></div>
          </section>

          <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Hoạt động gần đây</h2>
            <div className="mt-3 space-y-3">
              {(activityRows ?? []).length === 0 ? <p className="text-sm text-[var(--ink-muted)]">Chưa có activity log.</p> : (activityRows ?? []).map((row) => (
                <div key={row.id} className="border-b border-[var(--border-hairline)] pb-2 last:border-0">
                  <p className="text-sm text-[var(--ink-secondary)]">{row.message}</p>
                  <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{row.agent} · {new Date(row.created_at).toLocaleString("vi-VN")}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
