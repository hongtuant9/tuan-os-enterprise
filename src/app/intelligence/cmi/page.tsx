import Sidebar from "@/components/Sidebar";
import CmiWorkspace from "@/components/cmi/CmiWorkspace";
import { getRequestContainer } from "@/server/container";

export const dynamic = "force-dynamic";

export default async function CmiPage() {
  const container = await getRequestContainer();

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
  } catch (error) {
    setupError =
      error instanceof Error
        ? error.message
        : "Không thể đọc dữ liệu CMI. Cần kiểm tra migration Supabase.";
  }

  const businessUnits = await container.businessUnits.list();

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
              Hãy chạy Migration <code>supabase/migrations/0013_cmi_marketing.sql</code> trước khi dùng dữ liệu thật.
              Chi tiết kỹ thuật: {setupError}
            </p>
          </div>
        )}
        <CmiWorkspace dashboard={dashboard} businessUnits={businessUnits} />
      </main>
    </div>
  );
}
