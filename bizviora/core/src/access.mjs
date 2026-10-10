/** BIZVIORA — xác thực quyền ở lớp dịch vụ, bắt buộc kết hợp RLS. */
export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ROLE_RANK = Object.freeze({ staff: 1, manager: 2, admin: 3, owner: 4 });
export function requireUuid(value, field='id') {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new ApiError(400, 'INVALID_' + field.toUpperCase());
  return value.toLowerCase();
}
export function requireMembership({userId, tenantId, membership, minRole='staff'}) {
  const uid=requireUuid(userId,'user_id'), tid=requireUuid(tenantId,'tenant_id');
  if (!membership || typeof membership !== 'object' ||
    String(membership.user_id).toLowerCase() !== uid ||
    String(membership.tenant_id).toLowerCase() !== tid ||
    !Object.hasOwn(ROLE_RANK,membership.role))
    throw new ApiError(403,'TENANT_ACCESS_DENIED');
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole])
    throw new ApiError(403,'INSUFFICIENT_ROLE');
  return Object.freeze({userId:uid,tenantId:tid,role:membership.role});
}
export function validateTaskInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(400,'INVALID_BODY');
  const title=typeof body.title==='string'?body.title.trim():'';
  if (!title || title.length > 180) throw new ApiError(400,'INVALID_TITLE');
  if (body.status!==undefined && body.status!=='TODO')
    throw new ApiError(400,'STATUS_MUTATION_NOT_ALLOWED');
  return {
    title, status:'TODO',
    business_unit_id:body.businessUnitId==null?null:requireUuid(body.businessUnitId,'business_unit_id'),
    property_id:body.propertyId==null?null:requireUuid(body.propertyId,'property_id'),
    assigned_to:body.assignedTo==null?null:requireUuid(body.assignedTo,'assigned_to')
  };
}
