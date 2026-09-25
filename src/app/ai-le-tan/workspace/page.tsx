import Sidebar from "@/components/Sidebar";
import AiReceptionistWorkspace from "@/components/ai-receptionist/AiReceptionistWorkspace";
import type { ReceptionistDashboard } from "@/data/ai-receptionist";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getRequestContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getReceptionistMode, isKiotVietDirectBookingWriteEnabled } from "@/server/ai-receptionist/config";
import { channelPolicySnapshot } from "@/server/channels/channel-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleOAuthConnectionsRepository } from "@/server/repositories/google-oauth-connections.repository";
import {
  GMAIL_MAILBOXES,
  GOOGLE_GMAIL_PROVIDER_KEYS,
} from "@/server/integrations/google/gmail-mailboxes";

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
    missingDataBacklog: [],
  };
}

export default async function AiReceptionistWorkspacePage() {
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
  let mailboxStatuses = GMAIL_MAILBOXES.map((mailbox) => ({
    entity: mailbox.entity,
    propertyLabel: mailbox.propertyLabel,
    canonicalEmail: mailbox.canonicalEmail,
    purpose: mailbox.purpose,
    connected: false,
    googleEmail: null as string | null,
    emailMatchesCanonical: false,
    connectedAt: null as string | null,
    lastError: null as string | null,
    gmailReadScope: false,
    gmailSendScope: false,
    oauthHref: `/api/integrations/google/oauth/start?mailbox=${mailbox.entity}`,
  }));

  if (session) {
    try {
      const repo = new GoogleOAuthConnectionsRepository(createAdminClient());
      const connections = await repo.findByUserIdAndProviders(session.userId, GOOGLE_GMAIL_PROVIDER_KEYS);
      const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));

      mailboxStatuses = GMAIL_MAILBOXES.map((mailbox) => {
        const connection = byProvider.get(mailbox.provider);
        const scopes = new Set((connection?.scope ?? "").split(/[\s,]+/).filter(Boolean));
        const googleEmail = connection?.google_email ?? null;
        return {
          entity: mailbox.entity,
          propertyLabel: mailbox.propertyLabel,
          canonicalEmail: mailbox.canonicalEmail,
          purpose: mailbox.purpose,
          connected: Boolean(connection),
          googleEmail,
          emailMatchesCanonical: Boolean(
            googleEmail && googleEmail.trim().toLowerCase() === mailbox.canonicalEmail.toLowerCase()
          ),
          connectedAt: connection?.connected_at ?? null,
          lastError: connection?.last_error ?? null,
          gmailReadScope: scopes.has("https://www.googleapis.com/auth/gmail.readonly"),
          gmailSendScope: scopes.has("https://www.googleapis.com/auth/gmail.send"),
          oauthHref: `/api/integrations/google/oauth/start?mailbox=${mailbox.entity}`,
        };
      });
    } catch {
      // Mailbox readiness is informational; do not block the AI Receptionist workspace.
    }
  }
  const channelSnapshot = channelPolicySnapshot();
  const channels = channelSnapshot.channels.map((channel) => ({
    id: channel.id,
    label: channel.label,
    readiness: channel.readiness,
    transport: channel.transport,
    mode: channel.mode,
    providerConfig: channel.providerConfig,
    providerVerification: channel.providerVerification,
  }));

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
        <AiReceptionistWorkspace dashboard={dashboard} canManage={canManage} channels={channels} mailboxStatuses={mailboxStatuses} />
      </main>
    </div>
  );
}
