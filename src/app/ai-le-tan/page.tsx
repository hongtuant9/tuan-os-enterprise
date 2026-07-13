import Sidebar from "@/components/Sidebar";
import AiReceptionistWorkspace from "@/components/ai-receptionist/AiReceptionistWorkspace";
import type { ReceptionistDashboard } from "@/data/ai-receptionist";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getRequestContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getReceptionistMode, isKiotVietDirectBookingWriteEnabled } from "@/server/ai-receptionist/config";
import { MISSING_DATA_BACKLOG } from "@/server/services/ai-receptionist.service";

export const dynamic = "force-dynamic";

function emptyDashboard(): ReceptionistDashboard {
  return {
    mode: getReceptionistMode(),
    writeEnabled: isKiotVietDirectBookingWriteEnabled(),
    conversations: [],
    bookings: [],
    managerReviews: [],
    knowledgeCandidates: [],
    metrics: {
      openConversations: 0,
      pendingManagerReviews: 0,
      verifiedAiBookings: 0,
      pendingKnowledgeCandidates: 0,
    },
    missingDataBacklog: [...MISSING_DATA_BACKLOG],
  };
}

export default async function AiReceptionistPage() {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  let dashboard = emptyDashboard();
  let setupError = "";

  try {
    dashboard = await (await getRequestContainer()).aiReceptionist.dashboard();
  } catch (error) {
    setupError =
      error instanceof Error
        ? error.message
        : "Không thể đọc dữ liệu AI Lễ tân. Cần kiểm tra Migration Supabase.";
  }

  const canManage = session ? hasMinimumRole(session.role, "manager") : false;

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        {setupError && (
          <div className="mb-6 rounded-xl border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/5 p-5">
            <p className="text-sm font-semibold text-[var(--status-warn)]">
              Chưa hoàn tất cài đặt cơ sở dữ liệu AI Lễ tân
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">
              Hãy chạy Migration <code>supabase/migrations/0012_ai_receptionist.sql</code> trước khi dùng dữ liệu thật.
              Chi tiết kỹ thuật: {setupError}
            </p>
          </div>
        )}
        <AiReceptionistWorkspace dashboard={dashboard} canManage={canManage} />
      </main>
    </div>
  );
}
