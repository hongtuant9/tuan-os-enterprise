import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole, type Role } from "@/server/auth/roles";

export type ApiPrincipal =
  | { kind: "user"; userId: string; email: string | null; role: Role; businessUnitId: string | null }
  | { kind: "service"; source: "n8n" };

/**
 * Authenticates an incoming API request either as:
 *  - a machine caller presenting `x-api-key` matching N8N_API_KEY (for n8n /
 *    automation integrations), or
 *  - a signed-in dashboard user (cookie session, looked up for its role).
 * Returns null when neither is present/valid — callers must 401.
 */
export async function authenticateApiRequest(request: Request): Promise<ApiPrincipal | null> {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.N8N_API_KEY;

  if (apiKey && expectedKey && apiKey === expectedKey) {
    return { kind: "service", source: "n8n" };
  }

  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return null;

  return {
    kind: "user",
    userId: session.userId,
    email: session.email,
    role: session.role,
    businessUnitId: session.businessUnitId,
  };
}

export function principalHasMinimumRole(principal: ApiPrincipal, minimum: Role): boolean {
  // Service callers are pre-authorized by possession of the shared API key.
  if (principal.kind === "service") return true;
  return hasMinimumRole(principal.role, minimum);
}

export function principalLabel(principal: ApiPrincipal): string {
  if (principal.kind === "service") return "n8n";
  return principal.email ?? principal.userId;
}
