import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import { channelPolicySnapshot } from "@/server/channels/channel-policy";
import { facebookLegacyPageId, facebookPageEntityMap, parseStringMapEnv } from "@/server/social/facebook-pages";

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

async function probeFacebookToken(token: string, pageId?: string) {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  const version = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v23.0";
  if (!appId || !appSecret) return { ok: false, reachable: false, reason: "missing_facebook_app_credentials" };

  const url = new URL(`https://graph.facebook.com/${version}/debug_token`);
  url.searchParams.set("input_token", token);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
  const body = await response.json().catch(() => null) as { data?: { app_id?: string; type?: string; is_valid?: boolean; scopes?: string[]; expires_at?: number; data_access_expires_at?: number; profile_id?: string }; error?: GraphError } | null;
  const data = body?.data;
  const scopes = data?.scopes ?? [];
  const hasMessaging = scopes.includes("pages_messaging");

  let tokenPage: { id: string | null; name: string | null } | null = null;
  if (response.ok && data?.is_valid === true) {
    const meUrl = new URL(`https://graph.facebook.com/${version}/me`);
    meUrl.searchParams.set("fields", "id,name");
    meUrl.searchParams.set("access_token", token);
    const meResponse = await fetch(meUrl, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const meBody = await meResponse.json().catch(() => null) as { id?: string; name?: string } | null;
    tokenPage = {
      id: meResponse.ok ? meBody?.id ?? null : null,
      name: meResponse.ok ? meBody?.name ?? null : null,
    };
  }

  let page: { id: string | null; name: string | null; matchesExpectedId: boolean | null } | null = null;
  if (pageId && response.ok && data?.is_valid === true) {
    const pageUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}`);
    pageUrl.searchParams.set("fields", "id,name");
    pageUrl.searchParams.set("access_token", token);
    const pageResponse = await fetch(pageUrl, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const pageBody = await pageResponse.json().catch(() => null) as { id?: string; name?: string } | null;
    page = { id: pageResponse.ok ? pageBody?.id ?? null : null, name: pageResponse.ok ? pageBody?.name ?? null : null, matchesExpectedId: pageResponse.ok ? pageBody?.id === pageId : false };
  }

  const identityMatchesExpectedId = pageId
    ? data?.profile_id === pageId || page?.matchesExpectedId === true
    : true;

  return { ok: response.ok && data?.is_valid === true && hasMessaging && identityMatchesExpectedId, reachable: true, httpStatus: response.status, tokenValid: data?.is_valid ?? false, tokenType: data?.type ?? null, tokenProfileId: data?.profile_id ?? null, identityMatchesExpectedId, appIdMatches: data?.app_id ? data.app_id === appId : null, scopes, hasPagesMessaging: hasMessaging, expiresAt: data?.expires_at ?? null, dataAccessExpiresAt: data?.data_access_expires_at ?? null, tokenPage, page, error: safeGraphError(body?.error) };
}

async function probeFacebook() {
  const tokenMap = parseStringMapEnv("FACEBOOK_PAGE_ACCESS_TOKENS_JSON");
  const entityMap = facebookPageEntityMap();
  if (Object.keys(tokenMap).length > 0) {
    const pages = await Promise.all(Object.entries(tokenMap).map(async ([pageId, token]) => ({ pageId, entity: entityMap[pageId] ?? "unknown", probe: await probeFacebookToken(token.trim(), pageId) })));
    return { ok: pages.length > 0 && pages.every((item) => item.probe.ok), reachable: true, mode: "multi_page", pageCount: pages.length, pages };
  }
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, reachable: false, reason: "missing_page_access_token" };
  const pageId = facebookLegacyPageId();
  return { ...(await probeFacebookToken(token, pageId)), mode: "single_page_legacy", pageId, entity: entityMap[pageId] ?? "unknown" };
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
    return NextResponse.json(
      { channel, stage: snapshot.stage, policy, probe, checkedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
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
