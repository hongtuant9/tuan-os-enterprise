import Sidebar from "@/components/Sidebar";
import CmiWorkspace from "@/components/cmi/CmiWorkspace";
import CmiAutomationPanel from "@/components/cmi/CmiAutomationPanel";
import CmiOneClickPanel from "@/components/cmi/CmiOneClickPanel";
import CmiAiControl from "@/components/cmi/CmiAiControl";
import { getRequestContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getCmiAutomationStatus } from "@/server/cmi/automation.service";
import { getCmiAiRuntimeStatus, type CmiAiRuntimeStatus } from "@/server/cmi/ai-runtime";

export const dynamic = "force-dynamic";

const fallbackAiRuntime: CmiAiRuntimeStatus = {
  enabled: false,
  providerConfigured: false,
  effectiveEnabled: false,
  monthlyBudgetUsd: 5,
  monthlyEstimatedUsedUsd: 0,
  dailyLimit: 10,
  dailyUsed: 0,
};

export default async function CmiPage() {
  const container = await getRequestContainer();
  const session = await getCurrentSession(container.db);
  const canManage = session ? hasMinimumRole(session.role, "manager") : false;
  const baseAutomationStatus = getCmiAutomationStatus();

  let aiRuntime = fallbackAiRuntime;
  try {
    aiRuntime = await getCmiAiRuntimeStatus();
  } catch {
    // Giữ trang đọc được trong lúc migration V0.9 chưa áp dụng.
  }

  const automationStatus = {
    ...baseAutomationStatus,
    aiAnalysisConnected: aiRuntime.effectiveEnabled,
  };

  let setupError = "";
  let dashboard = {
    researchJobs: [],
    competitors: [],
    sources: [],
    evidence: [],
    insights: [],
    opportunities: [],
    marketingStrategies: [],
    metrics: {
      researchJobs: 0,
      competitors: 0,
      selectedCompetitors: 0,
      evidence: 0,
      verifiedEvidence: 0,
      insights: 0,
      opportunities: 0,
      marketingStrategies: 0,
    },
    automation: {
      browserConnected: false,
      aiAnalysisConnected: false,
      note: "Chưa kết nối.",
    },
  } as Awaited<ReturnType<typeof container.cmi.dashboard>>;
  let queueByResearch: Record<string, { queued: number; running: number; completed: number; failed: number }> = {};

  try {
    dashboard = await container.cmi.dashboard();
    dashboard.automation = {
      browserConnected: automationStatus.browserConnected,
      aiAnalysisConnected: automationStatus.aiAnalysisConnected,
      note: automationStatus.aiAnalysisConnected
        ? "Browser tự động và AI có phí đang hoạt động theo quota/ngân sách đã duyệt."
        : automationStatus.browserConnected
          ? "Browser tự động đang hoạt động. AI có phí hiện đang tắt."
          : "Browser tự động và AI có phí hiện đang tắt.",
    };

    const queueRows = await Promise.all(
      dashboard.researchJobs.slice(0, 8).map(async (job) => [job.id, await container.cmiCollectionQueue.summary(job.id)] as const)
    );
    queueByResearch = Object.fromEntries(queueRows);
  } catch (error) {
    setupError =
      error instanceof Error
        ? error.message
        : "Không thể đọc dữ liệu CMI. Cần kiểm tra migration Supabase.";
  }

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        {setupError && (
          <div className="mb-6 rounded-xl border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/5 p-5">
            <p className="text-sm font-semibold text-[var(--status-warn)]">
              Chưa hoàn tất cài đặt cơ sở dữ liệu CMI
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">
              Kiểm tra migration CMI trên Supabase trước khi dùng dữ liệu thật. Chi tiết kỹ thuật: {setupError}
            </p>
          </div>
        )}

        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--ink-secondary)]">
            <span>
              Browser: <b className="text-[var(--ink-primary)]">{automationStatus.browserConnected ? "Hoạt động" : "Tắt"}</b>
            </span>
            <span>
              AI có phí: <b className="text-[var(--ink-primary)]">{automationStatus.aiAnalysisConnected ? "Bật" : "Tắt"}</b>
            </span>
            <span>
              Bằng chứng: <b className="text-[var(--ink-primary)]">{dashboard.metrics.evidence}</b>
            </span>
            <span>
              Cơ hội: <b className="text-[var(--ink-primary)]">{dashboard.metrics.opportunities}</b>
            </span>
          </div>

          <CmiAiControl status={aiRuntime} canManage={canManage} />

          <CmiOneClickPanel
            dashboard={dashboard}
            status={automationStatus}
            canManage={canManage}
            queueByResearch={queueByResearch}
          />

          <details className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
            <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-[var(--ink-primary)]">
              Công cụ nâng cao / Nhập thủ công
              <span className="ml-2 text-xs font-normal text-[var(--ink-muted)]">
                Chỉ mở khi cần kiểm tra Browser, bổ sung nguồn/bằng chứng hoặc xử lý ngoại lệ.
              </span>
            </summary>
            <div className="space-y-8 border-t border-[var(--border-hairline)] p-5">
              <CmiAutomationPanel dashboard={dashboard} status={automationStatus} canManage={canManage} />
              <CmiWorkspace dashboard={dashboard} />
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
