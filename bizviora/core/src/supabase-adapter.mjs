import { createClient } from '@supabase/supabase-js';
import { ApiError } from './access.mjs';

// Existing approved staging remains the default. V2 QA is a separate isolated target.
// Keep the named legacy reference visible for old static contract tests.
import { resolveDatabaseTarget, LEGACY_STAGING_REF as APPROVED_STAGING_PROJECT_REF } from './database-target-guard.mjs';
export function createSupabaseDependencies(env=process.env) {
  const target=resolveDatabaseTarget(env);
  const url=target.url;
  const anonKey=env.BIZVIORA_SUPABASE_ANON_KEY;
  if(target.mode==='LEGACY_STAGING' && target.projectRef!==APPROVED_STAGING_PROJECT_REF)
    throw Error('STAGING_REF_MISMATCH');

  const clientFor=token=>createClient(url,anonKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:{Authorization:`Bearer ${token}`}}
  });
  const checked=result=>{
    if(result.error)throw Error('STAGING_DB_QUERY_FAILED');
    return result.data;
  };
  return {
    targetMode:target.mode,
    readOnly:target.readOnly,
    async verifyBearer(token) {
      const {data,error}=await clientFor(token).auth.getUser(token);
      if(error||!data?.user?.id)throw new ApiError(401,'AUTH_INVALID');
      return {id:data.user.id};
    },
    repository(token) {
      const db=clientFor(token); // Không dùng service role. RLS dùng chính JWT của người gửi.
      return {
        async membership({tenantId,userId}) {
          const rows=checked(await db.from('bv_memberships')
            .select('tenant_id,user_id,role').eq('tenant_id',tenantId).eq('user_id',userId).limit(1));
          return rows?.[0]||null;
        },
        async context(actor) {
          const [t,u,p]=await Promise.all([
            db.from('bv_tenants').select('id,name,slug').eq('id',actor.tenantId).single(),
            db.from('bv_business_units').select('id,name').eq('tenant_id',actor.tenantId).limit(100),
            db.from('bv_properties').select('id,business_unit_id,name').eq('tenant_id',actor.tenantId).limit(100)
          ]);
          return {tenant:checked(t),businessUnits:checked(u),properties:checked(p)};
        },
        async updateTenantProfileAtomic(actor,{name,expectedVersion}) {
          // Single Postgres RPC transaction; no split UPDATE followed by audit INSERT.
          const result=await db.rpc('bv_update_tenant_profile_atomic',{
            p_tenant_id:actor.tenantId,p_expected_version:expectedVersion,p_name:name
          });
          if(result.error){
            if(result.error.code==='40001')throw new ApiError(409,'SETTINGS_VERSION_CONFLICT');
            if(result.error.code==='42501')throw new ApiError(403,'SETTINGS_WRITE_DENIED');
            throw new ApiError(503,'SETTINGS_WRITE_UNAVAILABLE');
          }
          const row=Array.isArray(result.data)?result.data[0]:result.data;
          if(!row?.audit_event_id || row.tenant_id!==actor.tenantId)
            throw new ApiError(503,'SETTINGS_WRITE_UNVERIFIED');
          return {tenantId:row.tenant_id,name:row.name,
            version:Number(row.version),auditEventId:row.audit_event_id};
        },
        async tasks(actor) {
          return checked(await db.from('bv_tasks')
            .select('id,tenant_id,business_unit_id,property_id,title,status,assigned_to,created_at')
            .eq('tenant_id',actor.tenantId).order('created_at',{ascending:false}).limit(50));
        },
        async createTask(actor,input) {
          return checked(await db.from('bv_tasks')
            .insert({...input,tenant_id:actor.tenantId,created_by:actor.userId})
            .select('id,tenant_id,title,status,created_by,created_at').single());
        },
        async approvals(actor) {
          return checked(await db.from('bv_approvals')
            .select('id,tenant_id,task_id,status,requested_by,created_at')
            .eq('tenant_id',actor.tenantId).order('created_at',{ascending:false}).limit(50));
        },
        async requestApproval(actor,{taskId}) {
          if(taskId){
            const task=checked(await db.from('bv_tasks').select('id').eq('id',taskId).eq('tenant_id',actor.tenantId).maybeSingle());
            if(!task)throw new ApiError(404,'TASK_NOT_FOUND');
          }
          return checked(await db.from('bv_approvals')
            .insert({tenant_id:actor.tenantId,task_id:taskId,requested_by:actor.userId,status:'PENDING'})
            .select('id,tenant_id,task_id,status,requested_by,created_at').single());
        },
        async decideApproval(actor,{approvalId,decision}) {
          const {data,error}=await db.from('bv_approvals')
            .update({status:decision}).eq('id',approvalId).eq('tenant_id',actor.tenantId).eq('status','PENDING')
            .select('id,tenant_id,task_id,status,requested_by,created_at').maybeSingle();
          if(error)throw new ApiError(403,'APPROVAL_DECISION_DENIED');
          if(!data)throw new ApiError(409,'APPROVAL_NOT_PENDING');
          return data;
        }
      };
    }
  };
}
