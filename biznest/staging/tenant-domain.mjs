/** BIZNEST tenant/domain resolution contract — synthetic staging only.
 * Pure functions: no DB access, no credentials, no production configuration.
 * Integrations must supply a trusted proxy-normalized hostname and an authenticated
 * membership resolver; this module NEVER trusts client-provided tenant IDs.
 */
import {domainToASCII} from "node:url";

const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeHostname(input) {
  if (typeof input !== "string" || !input || input.length > 300) return null;
  const raw = input.trim().toLowerCase();
  if (raw.includes("/") || raw.includes("@") || raw.includes("\\") || raw.includes(",") || raw.includes("#") || raw.includes("?")) return null;
  const host = raw.endsWith(".") ? raw.slice(0, -1) : raw;
  // Host parsing is intentionally strict: no forwarded lists, embedded ports or IPs.
  if (host.includes(":") || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const ascii = domainToASCII(host);
  return ascii && HOST_RE.test(ascii) ? ascii : null;
}

export class TenantRoutingError extends Error {
  constructor(code) { super(code); this.name = "TenantRoutingError"; this.code = code; }
}

/** @param {{trustedHostname:string, lookupDomain:Function, userId:string, lookupMembership:Function}} options */
export async function resolveTenantContext({trustedHostname, lookupDomain, userId, lookupMembership}) {
  const hostname = normalizeHostname(trustedHostname);
  if (!hostname) throw new TenantRoutingError("INVALID_HOST");
  if (!userId || typeof userId !== "string") throw new TenantRoutingError("UNAUTHENTICATED");
  const record = await lookupDomain(hostname);
  if (!record || record.hostname !== hostname || record.status !== "ACTIVE" ||
      record.verification_status !== "VERIFIED" || record.certificate_status !== "ACTIVE" ||
      !record.tenant_id) throw new TenantRoutingError("UNMAPPED_HOST");
  const membership = await lookupMembership({tenantId:record.tenant_id, userId});
  if (!membership || membership.status !== "ACTIVE" || !["owner","admin","employee"].includes(membership.role))
    throw new TenantRoutingError("NOT_A_MEMBER");
  return Object.freeze({tenantId:record.tenant_id, userId, role:membership.role, hostname});
}
