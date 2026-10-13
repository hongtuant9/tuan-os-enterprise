import { ApiError } from './access.mjs';

/**
 * Founder authorization gate (staging): never derive platform-admin rights
 * from email, tenant owner role, browser flags or client-supplied claims.
 * Authenticated user token must be verified by the Auth server.
 * Caller supplies a user-JWT-bound RPC client, never service_role.
 */
export function createFounderGate({ verifyBearer, platformManagerRpc }) {
  if (typeof verifyBearer !== 'function' || typeof platformManagerRpc !== 'function')
    throw Error('FOUNDER_AUTH_DEPENDENCIES_REQUIRED');
  return async function requireFounder(token) {
    if (typeof token !== 'string' || token.length < 12 || token.length > 4096)
      throw new ApiError(401,'AUTH_REQUIRED');
    let user;
    try { user = await verifyBearer(token); }
    catch { throw new ApiError(401,'AUTH_INVALID'); }
    if (!user || typeof user.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))
      throw new ApiError(401,'AUTH_INVALID');
    let permitted;
    try { permitted = await platformManagerRpc(token, user.id); }
    catch { throw new ApiError(403,'FOUNDER_ACCESS_DENIED'); }
    if (permitted !== true) throw new ApiError(403,'FOUNDER_ACCESS_DENIED');
    return Object.freeze({ userId:user.id.toLowerCase(), platformManager:true });
  };
}
