/**
 * BIZVIORA — live Settings via Supabase PostgREST/RLS on the EXISTING source staging.
 * This is NOT a read from the new V2 QA project until a separately verified migration.
 * Fail closed: never accept a synthetic tenant, unverified role or fallback dataset.
 */
const TUAN_SLUG='tuan-os-enterprise-001';
const EXPECTED_UNITS=new Set(['Cozy Garden','Lavender Homestay','Ruby Homestay']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles=new Set(['owner','admin','manager','staff']);

export class LiveSettingsError extends Error {
  constructor(code){super(code);this.name='LiveSettingsError';this.code=code;}
}
function ensure(condition,code='SETTINGS_DATA_SCOPE_DENIED'){
  if(!condition)throw new LiveSettingsError(code);
}
const query=async(promise)=>{
  let result;
  try{result=await promise}catch{throw new LiveSettingsError('SETTINGS_DB_UNAVAILABLE');}
  if(result?.error)throw new LiveSettingsError('SETTINGS_DB_UNAVAILABLE');
  return result?.data;
};
export async function loadTuanSettingsFromRls({client,access}){
  ensure(client?.auth?.getUser&&typeof client.from==='function'&&access?.ok===true,
    'AUTH_OR_CONTEXT_REQUIRED');
  const tenantId=access?.tenant?.id, userId=access?.user?.id;
  ensure(uuid.test(tenantId||'')&&uuid.test(userId||'')&&
    access.tenant.slug===TUAN_SLUG&&roles.has(access.role),'TENANT_DENIED');
  const {data:verified,error:authError}=await client.auth.getUser();
  ensure(!authError&&verified?.user?.id===userId,'AUTH_REQUIRED');

  const [tenant,member,units,properties]=await Promise.all([
    query(client.from('bv_tenants').select('id,slug,name').eq('id',tenantId).maybeSingle()),
    query(client.from('bv_memberships').select('tenant_id,user_id,role').eq('tenant_id',tenantId)
      .eq('user_id',userId).maybeSingle()),
    query(client.from('bv_business_units').select('id,tenant_id,name').eq('tenant_id',tenantId)),
    query(client.from('bv_properties').select('id,tenant_id,business_unit_id,name').eq('tenant_id',tenantId))
  ]);
  ensure(tenant?.id===tenantId&&tenant.slug===TUAN_SLUG&&
    member?.tenant_id===tenantId&&member.user_id===userId&&
    member.role===access.role,'TENANT_DENIED');
  ensure(Array.isArray(units)&&Array.isArray(properties),'SETTINGS_DATA_INCOMPLETE');
  const ids=new Set(units.map(u=>u.id)), names=new Set(units.map(u=>u.name));
  ensure(units.length===3&&ids.size===3&&
    EXPECTED_UNITS.size===names.size&&[...EXPECTED_UNITS].every(name=>names.has(name)) &&
    units.every(u=>u.tenant_id===tenantId&&uuid.test(u.id)),'SETTINGS_DATA_INCOMPLETE');
  ensure(properties.length===3&&new Set(properties.map(p=>p.id)).size===3&&
    properties.every(p=>uuid.test(p.id)&&p.tenant_id===tenantId&&
      ids.has(p.business_unit_id)),'SETTINGS_PROPERTY_SCOPE_DENIED');
  ensure(units.every(u=>properties.filter(p=>p.business_unit_id===u.id).length===1),
    'SETTINGS_PROPERTY_SCOPE_DENIED');

  let audit=[];
  if(['owner','admin','manager'].includes(access.role)){
    audit=await query(client.from('bv_audit_events')
      .select('id,tenant_id,operation,entity_type,occurred_at')
      .eq('tenant_id',tenantId).order('occurred_at',{ascending:false}).limit(20));
    ensure(Array.isArray(audit)&&audit.every(e=>e.tenant_id===tenantId),
      'SETTINGS_AUDIT_SCOPE_DENIED');
  }
  return Object.freeze({
    status:'VERIFIED_SOURCE_READ_ONLY',
    source:'SUPABASE_SOURCE_POSTGREST_RLS',tenantId,
    company:Object.freeze({id:tenant.id,name:tenant.name,slug:tenant.slug}),
    role:member.role,
    businessUnits:Object.freeze(units.map(u=>Object.freeze({id:u.id,name:u.name}))),
    properties:Object.freeze(properties.map(p=>Object.freeze({
      id:p.id,name:p.name,businessUnitId:p.business_unit_id
    }))),
    auditEvents:Object.freeze(audit.map(x=>Object.freeze({
      operation:x.operation,entityType:x.entity_type,at:x.occurred_at
    }))),
    auditStatus:['owner','admin','manager'].includes(access.role)?'READ_ONLY':'DENIED',
    writeEnabled:false, customerDataReady:false
  });
}
