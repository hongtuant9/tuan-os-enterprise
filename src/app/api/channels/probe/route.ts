import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import { channelPolicySnapshot } from "@/server/channels/channel-policy";

export const dynamic = "force-dynamic";

type ProbeChannel = "facebook" | "whatsapp";

type GraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

function safeGraphError(error: GraphError | undefined) {
  if (!error) return null;
  return {
    type: error.type ?? null,
    code: error.code ?? null,
    subcode: error.error_subcode ?? null,
    message: (error.message ?? "Graph API error").slice(0, 240),
  };
}

async function probeFacebook() {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  const version = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v23.0";
  if (!token) return { ok: false, reachable: false, reason: "missing_page_access_token" };
  const url = new URL(`https://graph.facebook.com/${version}/me`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
  const body = await response.json().catch(() => null) as { id?: string; name?: string; error?: GraphError } | null;
  return {
    ok: response.ok && Boolean(body?.id),
    reachable: true,
    httpStatus: response.status,
    pageId: response.ok ? body?.id ?? null : null,
    pageName: response.ok ? body?.name ?? null : null,
    error: safeGraphError(body?.error),
  };
}

async function probeWhatsApp() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v23.0";
  if (!token || !phoneNumberId) return { ok: false, reachable: false, reason: "missing_whatsapp_credentials" };

  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
  const body = await response.json().catch(() => null) as { id?: string; display_phone_number?: string; verified_name?: string; error?: GraphError } | null;
  return {
    ok: response.ok && Boolean(body?.id),
    reachable: true,
    httpStatus: response.status,
    phoneNumberId: response.ok ? body?.id ?? null : null,
    displayPhoneNumber: response.ok ? body?.display_phone_number ?? null : null,
    verifiedName: response.ok ? body?.verified_name ?? null : null,
    error: safeGraphError(body?.error),
  };
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!principalHasMinimumRole(principal, "manager")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let channel: ProbeChannel;
  try {
    const payload = await request.json() as { channel?: string };
    if (payload.channel !== "facebook" && payload.channel !== "whatsapp") {
      return NextResponse.json({ error: "Unsupported channel" }, { status: 400 });
    }
    channel = payload.channel;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const snapshot = channelPolicySnapshot();
  const policy = snapshot.channels.find((item) => item.id === channel) ?? null;
  try {
    const probe = channel === "facebook" ? await probeFacebook() : await probeWhatsApp();
    return NextResponse.json({ channel, stage: snapshot.stage, policy, probe, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      channel,
      stage: snapshot.stage,
      policy,
      probe: {
        ok: false,
        reachable: false,
        reason: error instanceof Error ? error.message.slice(0, 240) : "probe_failed",
      },
      checkedAt: new Date().toISOString(),
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
