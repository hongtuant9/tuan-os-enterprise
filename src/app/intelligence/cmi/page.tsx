import Sidebar from "@/components/Sidebar";
import CmiWorkspace from "@/components/cmi/CmiWorkspace";
import CmiAutomationPanel from "@/components/cmi/CmiAutomationPanel";
import { getRequestContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getCmiAutomationStatus } from "@/server/cmi/automation.service";

export const dynamic = "force-dynamic";

export default async function CmiPage() {
  const container = await getRequestContainer();
  const session = await getCurrentSession(container.db);
  const canManage = session ? hasMinimumRole(session.role, "manager") : false;
  const automationStatus = getCmiAutomationStatus();

  let setupError = "";
  let dashboard = {
    researchJobs: [],
    sources: [],
    evidence: [],
    insights: [],
    opportunities: [],
    marketingStrategies: [],
    metrics: {
      researchJobs: 0,
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

  try {
    dashboard = await container.cmi.dashboard();
    dashboard.automation = {
      browserConnected: automationStatus.browserConnected,
      aiAnalysisConnected: automationStatus.aiAnalysisConnected,
      note: automationStatus.aiAnalysisConnected
        ? "Browser tự động và AI phân tích CMI đang được bật theo chế độ có kiểm soát. Mọi kết luận vẫn phải dựa trên bằng chứng nguồn và cơ hội phải được Quản lý duyệt trước khi chuyển sang AI Marketing."
        : automationStatus.browserConnected
          ? "Browser tự động đã được nối vào production. AI phân tích CMI hiện đang tắt; dữ liệu thu thập vẫn phải có bằng chứng nguồn trước khi kết luận và mọi cơ hội cần được Quản lý duyệt."
          : "Browser tự động và AI phân tích CMI hiện đang tắt. Có thể tiếp tục nhập dữ liệu thủ công theo quy trình bằng chứng trước khi kết luận.",
    };
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
        <div className="space-y-8">
          <CmiAutomationPanel dashboard={dashboard} status={automationStatus} canManage={canManage} />
          <CmiWorkspace dashboard={dashboard} />
        </div>
      </main>
    </div>
  );
}
