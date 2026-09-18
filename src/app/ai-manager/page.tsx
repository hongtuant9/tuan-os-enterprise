import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";
import { buildManagerBrief, type AuthoritySnapshot, type ManagerWorkItem } from "@/server/ai-operations/control-plane";
import { buildManagerItems } from "@/server/ai-operations/manager-data";
import TceManagerChat from "@/components/ai-manager/TceManagerChat";
import { TCE_AGENT_REGISTRY } from "@/server/agents/tce-registry";
import { TCE_EXECUTIVE_ORG, type TceExecutiveRoleId } from "@/server/agents/tce-executive-org";

const DAY_MS = 24 * 60 * 60 * 1000;

function freshness(updatedAt?: string | null, status?: string | null): AuthoritySnapshot["state"] {
  if (status === "error") return "unavailable";
  if (!updatedAt) return "unavailable";
  return Date.now() - new Date(updatedAt).getTime() <= DAY_MS ? "verified" : "stale";
}

function sourceStateClass(state: AuthoritySnapshot["state"]) {
  if (state === "verified") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (state === "stale") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-rose-500/10 text-rose-300 border-rose-500/20";
}

function sourceStateLabel(state: AuthoritySnapshot["state"]) {
  if (state === "verified") return "Đã xác minh";
  if (state === "stale") return "Dữ liệu cũ";
  return "Chưa sẵn sàng";
}

const ROLE_NAMES: Record<TceExecutiveRoleId, string> = {
  ai_ceo_delegate: "TUAN OS — Đại diện CEO bằng AI",
  chief_of_staff: "AI Chánh văn phòng",
  audit_risk: "AI Kiểm toán và rủi ro",
  cmo: "AI Marketing và tăng trưởng",
  cco: "AI Bán hàng và doanh thu",
  coo: "AI Vận hành",
  cpo: "AI Sản phẩm và trải nghiệm",
  cfo: "AI Tài chính và kế hoạch",
  chro: "AI Nhân sự và văn hóa",
  cto: "AI Công nghệ và dữ liệu",
  cxo: "AI Trải nghiệm khách hàng",
};

function permissionLabel(permission: string) {
  if (permission === "L0_READ") return "L0 · Chỉ đọc";
  if (permission === "L1_SAFE") return "L1 · An toàn";
  if (permission === "L2_APPROVAL") return "L2 · Cần phê duyệt";
  if (permission === "L3_CRITICAL") return "L3 · Tối quan trọng";
  return permission;
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-white/[0.08] bg-[var(--surface)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-xs text-[var(--ink-muted)] transition-transform group-open:rotate-90">›</span>
          <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
        </div>
        {count !== undefined ? <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-muted)]">{count}</span> : null}
      </summary>
      <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

function WorkList({ title, items, empty, tone = "default", defaultOpen = false }: { title: string; items: ManagerWorkItem[]; empty: string; tone?: "default" | "ceo" | "waiting" | "system"; defaultOpen?: boolean }) {
  const toneClass = tone === "ceo"
    ? "border-rose-500/20"
    : tone === "waiting"
      ? "border-slate-500/20"
      : tone === "system"
        ? "border-amber-500/20"
        : "border-white/[0.08]";

  return (
    <details open={defaultOpen} className={`group rounded-2xl border ${toneClass} bg-[var(--surface)]`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-xs text-[var(--ink-muted)] transition-transform group-open:rotate-90">›</span>
          <h2 className="truncate text-sm font-semibold text-[var(--ink-primary)]">{title}</h2>
        </div>
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-muted)]">{items.length}</span>
      </summary>
      <div className="space-y-2 border-t border-white/[0.06] px-5 pb-5 pt-3">
        {items.length === 0 ? <p className="text-sm text-[var(--ink-muted)]">{empty}</p> : items.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-[var(--ink-primary)]">{item.title}</span>
              <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[var(--ink-muted)]">{item.priority}</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{item.id}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${item.needsCeoSupport ? "border-rose-500/20 bg-rose-500/[0.07] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"}`}>
                Cần CEO hỗ trợ: {item.needsCeoSupport ? "CÓ" : "KHÔNG"}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-[var(--ink-secondary)]">
                Phụ trách: {item.resolutionOwner ?? item.owner ?? item.agent}
              </span>
            </div>
            {item.ceoSupportReason ? <p className="mt-2 text-xs leading-5 text-rose-200">{item.ceoSupportReason}</p> : null}
            {item.ceoSupportAction ? (
              <div className="mt-2 rounded-lg border border-sky-500/15 bg-sky-500/[0.05] px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">CEO cần làm gì</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{item.ceoSupportAction}</p>
                {item.ceoSupportTiming ? <p className="mt-1 text-[10px] font-semibold text-amber-300">Thời điểm: {item.ceoSupportTiming}</p> : null}
              </div>
            ) : null}
            {item.blocker ? <p className="mt-2 text-xs leading-5 text-[var(--ink-secondary)]">Tình trạng: {item.blocker}</p> : null}
            {item.nextAction ? <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Tiếp theo: {item.nextAction}</p> : null}
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function AiManagerPage() {
  const container = await getRequestContainer();
  const [{ data: taskRows }, { data: activityRows }, { data: syncRows }, { data: syncSources }] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at").order("updated_at", { ascending: false }),
    container.db.from("activity_logs").select("id,agent,message,type,created_at").order("created_at", { ascending: false }).limit(8),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.db.from("sync_sources").select("key,status,last_synced_at,last_error").in("key", ["task-001", "approval-001", "l3-channel-tracking"]),
  ]);

  const tasks = taskRows ?? [];
  const syncRecords = syncRows ?? [];
  const sourceByKey = new Map((syncSources ?? []).map((item) => [item.key, item]));
  const taskSource = sourceByKey.get("task-001");
  const approvalSource = sourceByKey.get("approval-001");
  const l3Source = sourceByKey.get("l3-channel-tracking");
  const latestTask = taskSource?.last_synced_at ?? null;
  const latestApproval = approvalSource?.last_synced_at ?? null;
  const latestL3 = l3Source?.last_synced_at ?? null;
  const authorities: AuthoritySnapshot[] = [
    { authority: "TASK-001", state: freshness(latestTask, taskSource?.status), checkedAt: new Date().toISOString(), lastUpdatedAt: latestTask ?? undefined, note: taskSource?.last_error ? `Lỗi đồng bộ: ${taskSource.last_error}` : "Bản đồng bộ Supabase; Google Drive vẫn là nguồn chính thức." },
    { authority: "APPROVAL-001", state: freshness(latestApproval, approvalSource?.status), checkedAt: new Date().toISOString(), lastUpdatedAt: latestApproval ?? undefined, note: approvalSource?.last_error ? `Lỗi đồng bộ: ${approvalSource.last_error}` : "Bản đồng bộ Supabase; Google Drive vẫn là nguồn chính thức." },
    { authority: "L3", state: freshness(latestL3, l3Source?.status), checkedAt: new Date().toISOString(), lastUpdatedAt: latestL3 ?? undefined, note: l3Source?.last_error ? `Lỗi đồng bộ: ${l3Source.last_error}` : "Bản chỉ đọc dữ liệu L3; Google Drive vẫn là nguồn chính thức." },
    { authority: "RUNTIME", state: "verified", checkedAt: new Date().toISOString(), note: "Phiên web đã xác thực và runtime đang phản hồi." },
  ];

  const items: ManagerWorkItem[] = buildManagerItems(tasks, syncRecords);
  const brief = buildManagerBrief(items, authorities);
  const ceoSupportItems = items
    .filter((item) => item.status !== "DONE" && item.needsCeoSupport)
    .sort((a, b) => (a.pendingCeoApproval === b.pendingCeoApproval ? 0 : a.pendingCeoApproval ? -1 : 1));

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 xl:px-8">
        <div className="mx-auto max-w-[1600px]">
          <header className="mb-5 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(21,23,27,0.96)_46%)] p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Điều hành công ty trí tuệ nhân tạo <span className="text-[10px] font-normal italic text-[var(--ink-muted)]">(AI Operations)</span></p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Bàn điều hành TUAN OS</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">
                  TUAN OS — AI CEO Delegate chạy liên tục trên VPS, dùng TASK-001, APPROVAL-001, L3 và runtime để điều phối. Mọi hành động tài chính hoặc tối quan trọng vẫn khóa theo cổng phê duyệt.
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-xs font-semibold text-amber-300">Đang khóa các thay đổi vượt quyền</div>
            </div>
          </header>

          <section className="grid gap-2.5 md:grid-cols-4">
            {authorities.map((source) => (
              <div key={source.authority} className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--ink-primary)]">{source.authority}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sourceStateClass(source.state)}`}>{sourceStateLabel(source.state)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{source.note}</p>
                {source.lastUpdatedAt ? <p className="mt-1 text-[10px] text-[var(--ink-muted)]">Cập nhật: {new Date(source.lastUpdatedAt).toLocaleString("vi-VN")}</p> : null}
              </div>
            ))}
          </section>

          <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Tóm tắt điều hành</h2>
                <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                  {brief.staleAuthorities.length > 0
                    ? `Có nguồn chưa đạt trạng thái xác minh: ${brief.staleAuthorities.join(", ")}. Hệ thống không được mutation dựa trên nguồn này.`
                    : `Nguồn điều hành đã xác minh. Có ${brief.blockedItems.length} việc bị chặn vì chờ CEO phê duyệt, ${brief.waitingItems.length} việc đang chờ điều kiện, ${brief.systemIssueItems.length} vấn đề hệ thống/kỹ thuật và ${brief.nextItems.length} việc đủ điều kiện tiếp tục.`}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-xl bg-white/[0.03] px-3 py-2"><b className="block text-lg text-white">{brief.nextItems.length}</b><span className="text-[var(--ink-muted)]">Tiếp theo</span></div>
                <div className="rounded-xl bg-white/[0.03] px-3 py-2"><b className="block text-lg text-rose-300">{brief.blockedItems.length}</b><span className="text-[var(--ink-muted)]">Bị chặn bởi CEO gate</span></div>
                <div className="rounded-xl bg-white/[0.03] px-3 py-2"><b className="block text-lg text-slate-300">{brief.waitingItems.length}</b><span className="text-[var(--ink-muted)]">Chờ điều kiện</span></div>
                <div className="rounded-xl bg-white/[0.03] px-3 py-2"><b className="block text-lg text-amber-300">{brief.systemIssueItems.length}</b><span className="text-[var(--ink-muted)]">Vấn đề hệ thống</span></div>
              </div>
            </div>
          </section>

          <div id="executive-org" className="mt-5 scroll-mt-6">
            <CollapsibleSection title="Cơ cấu điều hành TCE + TUAN OS" count={`${TCE_EXECUTIVE_ORG.length} vai trò`}>
              <p className="mb-3 text-xs text-[var(--ink-muted)]">CEO Tuấn → TUAN OS AI CEO Delegate → các AI Trưởng phòng. Mở phần này khi cần xem quyền, nhiệm vụ và quan hệ báo cáo.</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {TCE_EXECUTIVE_ORG.map((role) => (
                <div key={role.id} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <b className="text-sm text-white">{ROLE_NAMES[role.id]}</b>
                      <p className="mt-0.5 text-[10px] italic text-[var(--ink-muted)]">({role.name})</p>
                    </div>
                    <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-[var(--ink-muted)]">{permissionLabel(role.permission)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">Báo cáo cho: {role.reportsTo === "CEO_TUAN" ? "CEO Tuấn" : "TUAN OS — AI CEO Delegate"}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--ink-secondary)]">{role.mission}</p>
                  <p className="mt-2 text-[10px] text-[var(--ink-muted)]">Tác nhân chuyên môn: {role.mappedAgents.join(", ")}</p>
                </div>
              ))}
              </div>
            </CollapsibleSection>
          </div>

          <div id="agent-registry" className="mt-5 scroll-mt-6">
            <CollapsibleSection title={`Danh mục ${TCE_AGENT_REGISTRY.length} tác nhân AI`} count={TCE_AGENT_REGISTRY.length}>
              <p className="mb-3 text-xs text-[var(--ink-muted)]">Mở khi cần kiểm tra nhiệm vụ, quyền hoặc nguồn dữ liệu của từng tác nhân.</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {TCE_AGENT_REGISTRY.map((agent) => (
                <div key={agent.id} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <b className="text-sm text-white">{agent.name}</b>
                    <span className="text-[9px] italic text-[var(--ink-muted)]">{agent.mode}</span>
                  </div>
                  <p className="mt-1 text-[10px] italic text-[var(--ink-muted)]">{agent.permission} · {agent.domain}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--ink-secondary)]">{agent.mission}</p>
                </div>
              ))}
              </div>
            </CollapsibleSection>
          </div>

          <div className="mt-5">
            <WorkList title="CEO cần hỗ trợ — hành động cụ thể" items={ceoSupportItems} empty="Hiện không có công việc nào cần CEO thao tác hoặc quyết định." tone="ceo" defaultOpen={ceoSupportItems.length > 0} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <WorkList title="Bị chặn — cần CEO quyết định/phê duyệt" items={brief.blockedItems} empty="Không có công việc nào đang bị chặn bởi cổng phê duyệt CEO." tone="ceo" defaultOpen={brief.blockedItems.length > 0} />
            <WorkList title="Đang chờ điều kiện / công việc trước" items={brief.waitingItems} empty="Không có công việc nào đang chờ dependency hoặc sequence." tone="waiting" />
            <WorkList title="Vấn đề hệ thống / kỹ thuật cần đội phụ trách xử lý" items={brief.systemIssueItems} empty="Không có vấn đề kỹ thuật đang cản trở thực thi." tone="system" />
            <WorkList title="Ưu tiên tiếp theo" items={brief.nextItems} empty="Chưa có công việc đủ điều kiện để đề xuất chạy." defaultOpen />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <CollapsibleSection title="Giao việc cho quản lý AI của TCE" defaultOpen>
              <p className="mb-3 text-sm text-[var(--ink-muted)]">Giao việc trực tiếp tại đây. Các thay đổi L2/L3 vẫn đi qua cổng phê duyệt.</p>
              <TceManagerChat />
            </CollapsibleSection>

            <CollapsibleSection title="Hoạt động gần đây" count={(activityRows ?? []).length}>
              <div className="space-y-3">
                {(activityRows ?? []).length === 0 ? <p className="text-sm text-[var(--ink-muted)]">Chưa có nhật ký hoạt động.</p> : (activityRows ?? []).map((row) => (
                  <div key={row.id} className="border-b border-white/[0.06] pb-2 last:border-0">
                    <p className="text-sm text-[var(--ink-secondary)]">{row.message}</p>
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{row.agent} · {new Date(row.created_at).toLocaleString("vi-VN")}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </main>
    </div>
  );
}
