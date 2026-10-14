/**
 * Synthetic-testable registration review protocol.
 * Privileged writes occur only in existing audited staging RPC, never in client SQL.
 */
export const LIVE_ROUTES = Object.freeze(['tenants','onboarding','approvals','audit']);
export const validUuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function businessRows(rows) {
  return (Array.isArray(rows)?rows:[]).filter(r=>r && r.status==='APPROVED' && validUuid(r.tenant_id))
    .map(r=>({id:r.id,tenant_id:r.tenant_id,name:r.business_name,plan:r.plan_code,
      state:'APPROVED',reviewed_at:r.reviewed_at}));
}
export async function reviewWithEvidence(gate,{id,approve,note}) {
  if(!validUuid(id)||typeof approve!=='boolean'||typeof note!=='string'||note.trim().length<10||note.length>600)
    throw Error('INVALID_REVIEW_INPUT');
  if(await gate.isManager()!==true)throw Error('MANAGER_REQUIRED');
  const before=await gate.getRequest(id);
  if(!before||before.id!==id||before.status!=='PENDING'||before.tenant_id!=null)
    throw Error('REQUEST_NOT_PENDING');
  const committed=await gate.commit({id,approve,note:note.trim()});
  const expected=approve?'APPROVED':'REJECTED';
  if(!committed||committed.request_id!==id||committed.status!==expected)
    throw Error('REVIEW_RESULT_MISMATCH');
  const after=await gate.getRequest(id);
  if(!after||after.id!==id||after.status!==expected||
      (approve?!validUuid(after.tenant_id):after.tenant_id!=null) ||
      (approve?committed.tenant_id!==after.tenant_id:false))
    throw Error('REVIEW_READBACK_FAILED');
  const evidence=await gate.getReview(id,expected);
  if(!evidence||evidence.request_id!==id||evidence.result!==expected)
    throw Error('AUDIT_READBACK_FAILED');
  return {status:expected,tenantId:after.tenant_id||null,verified:true};
}
