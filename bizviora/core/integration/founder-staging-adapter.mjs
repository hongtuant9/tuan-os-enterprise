/**
 * BIZVIORA Founder V2 — Giai đoạn 1, chỉ đọc ngữ cảnh doanh nghiệp.
 * ONLY local isolated staging, no production/domain/provider writes.
 * Supply an ephemeral Supabase Auth JWT via getAccessToken(), never embed it in source,
 * URL, localStorage, browser logs or error messages.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE = new Set(['staff', 'manager', 'admin', 'owner']);
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:4317', 'http://localhost:4317']);

export class FounderContextError extends Error {
  constructor(code) { super(code); this.name = 'FounderContextError'; this.code = code; }
}

export function createFounderStagingAdapter({
  getAccessToken,
  fetchImpl = globalThis.fetch,
  baseUrl = 'http://127.0.0.1:4317'
} = {}) {
  if (typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function') {
    throw new FounderContextError('AUTH_AND_FETCH_REQUIRED');
  }
  let origin;
  try { origin = new URL(baseUrl).origin; } catch {
    throw new FounderContextError('STAGING_ENDPOINT_INVALID');
  }
  if (!LOCAL_ORIGINS.has(origin) || baseUrl.replace(/\/$/, '') !== origin) {
    throw new FounderContextError('NON_STAGING_ENDPOINT_FORBIDDEN');
  }

  return Object.freeze({
    async loadEnterprise({ tenantId }) {
      if (typeof tenantId !== 'string' || !UUID.test(tenantId)) {
        throw new FounderContextError('INVALID_TENANT_ID');
      }
      const token = await getAccessToken();
      if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]{12,4096}$/.test(token)) {
        throw new FounderContextError('AUTH_REQUIRED');
      }
      let response;
      try {
        response = await fetchImpl(origin + '/v1/context?tenantId=' + encodeURIComponent(tenantId), {
          method: 'GET',
          headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'},
          credentials: 'omit', cache: 'no-store', redirect: 'error'
        });
      } catch {
        throw new FounderContextError('STAGING_BACKEND_UNAVAILABLE');
      }
      if (response.status === 401) throw new FounderContextError('AUTH_REQUIRED');
      if (response.status === 403) throw new FounderContextError('TENANT_ACCESS_DENIED');
      if (!response.ok) throw new FounderContextError('STAGING_BACKEND_UNAVAILABLE');
      let data;
      try { data = await response.json(); } catch {
        throw new FounderContextError('INVALID_CONTEXT_RESPONSE');
      }
      if (!data || !data.tenant || typeof data.tenant.id !== 'string' ||
          data.tenant.id.toLowerCase() !== tenantId.toLowerCase() ||
          !ROLE.has(data.role) || !Array.isArray(data.businessUnits) ||
          !Array.isArray(data.properties) ||
          data.businessUnits.some(b => typeof b.id !== 'string' || typeof b.name !== 'string') ||
          data.properties.some(p => typeof p.id !== 'string' || typeof p.name !== 'string')) {
        throw new FounderContextError('TENANT_CONTEXT_MISMATCH');
      }
      // No simulated fallback. Business/product/marketing views are not live yet.
      return {
        source: 'VERIFIED_STAGING_CONTEXT', tenantId: data.tenant.id,
        tenant: {id: data.tenant.id, name: data.tenant.name, slug: data.tenant.slug},
        role: data.role,
        businessUnits: data.businessUnits.map(b => ({id: b.id, name: b.name})),
        properties: data.properties.map(p => ({id: p.id, businessUnitId: p.business_unit_id, name: p.name})),
        permissions: {canReadEnterprise: true, canCreateTask: ['owner', 'admin', 'manager'].includes(data.role),
          canApprove: false, canSendMessages: false, canEditBookings: false,
          canViewOwnerPrivateFinance: false, canProcessPayments: false}
      };
    }
  });
}
