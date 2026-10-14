import pg from 'pg';
import { ApiError } from '../core/src/access.mjs';

// Independent PostgreSQL inside the isolated Docker network. Never connect to Supabase.
if(process.env.BV_PHASE1_ACK!=='ISOLATED_SYNTHETIC_ONLY' ||
   process.env.BV_PG_HOST!=='db' || process.env.BV_PG_DB!=='bizviora_phase1' ||
   process.env.BV_PG_USER!=='bv_api_login' || !process.env.BV_PG_PASSWORD)
  throw new Error('SELF_HOSTED_PHASE1_ENVIRONMENT_REQUIRED');
const pool=new pg.Pool({
 host:'db',port:5432,database:'bizviora_phase1',user:'bv_api_login',
 password:process.env.BV_PG_PASSWORD,max:20,
 connectionTimeoutMillis:5000,idleTimeoutMillis:30000,
 statement_timeout:9000,query_timeout:10000
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function withActor(userId,callback){
 if(!uuid.test(userId||''))throw new ApiError(401,'AUTH_INVALID');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  // RLS principal is not the PostgreSQL table owner and has no BYPASSRLS.
  await client.query('SET LOCAL ROLE bv_api_member');
  await client.query('SELECT set_config($1,$2,true)',['app.actor_user_id',userId]);
  const out=await callback(client);
  await client.query('COMMIT');
  return out;
 }catch(e){
  try{await client.query('ROLLBACK')}catch{}
  if(e instanceof ApiError)throw e;
  if(e.code==='42501')throw new ApiError(403,'DB_RLS_DENIED');
  if(e.code==='23505')throw new ApiError(409,'CONFLICT');
  if(e.code==='23503'||e.code==='23514'||e.code==='22P02')throw new ApiError(400,'INVALID_REFERENCE');
  throw new Error('SELFHOST_QUERY_FAILED');
 }finally{client.release()}
}
const data=result=>result.rows;
export const localRepository=()=>({
 async membership({tenantId,userId}){
  return withActor(userId,async db=>(data(await db.query(
   'SELECT tenant_id,user_id,role FROM bv_memberships WHERE tenant_id=$1 AND user_id=$2 LIMIT 1',
   [tenantId,userId]))[0]||null));
 },
 async context(actor){
  return withActor(actor.userId,async db=>{
   const t=await db.query('SELECT id,name,slug FROM bv_tenants WHERE id=$1',[actor.tenantId]);
   const u=await db.query('SELECT id,name FROM bv_business_units WHERE tenant_id=$1 LIMIT 100',[actor.tenantId]);
   const p=await db.query('SELECT id,business_unit_id,name FROM bv_properties WHERE tenant_id=$1 LIMIT 100',[actor.tenantId]);
   return {tenant:data(t)[0]||null,businessUnits:data(u),properties:data(p)};
  });
 },
 async tasks(actor){
  return withActor(actor.userId,async db=>data(await db.query(
   'SELECT id,tenant_id,business_unit_id,property_id,title,status,assigned_to,created_at FROM bv_tasks WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',[actor.tenantId])));
 },
 async createTask(actor,input){
  return withActor(actor.userId,async db=>data(await db.query(
   'INSERT INTO bv_tasks(tenant_id,title,status,business_unit_id,property_id,assigned_to,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,tenant_id,title,status,created_by,created_at',
   [actor.tenantId,input.title,input.status,input.business_unit_id,input.property_id,input.assigned_to,actor.userId]))[0]);
 },
 async approvals(actor){
  return withActor(actor.userId,async db=>data(await db.query(
   'SELECT id,tenant_id,task_id,status,requested_by,created_at FROM bv_approvals WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',[actor.tenantId])));
 },
 async requestApproval(actor,{taskId}){
  return withActor(actor.userId,async db=>{
   if(taskId){
    const task=await db.query('SELECT id FROM bv_tasks WHERE id=$1 AND tenant_id=$2',[taskId,actor.tenantId]);
    if(!task.rowCount)throw new ApiError(404,'TASK_NOT_FOUND');
   }
   return data(await db.query(
    "INSERT INTO bv_approvals(tenant_id,task_id,requested_by,status) VALUES($1,$2,$3,'PENDING') RETURNING id,tenant_id,task_id,status,requested_by,created_at",
    [actor.tenantId,taskId,actor.userId]))[0];
  });
 },
 async decideApproval(actor,{approvalId,decision}){
  return withActor(actor.userId,async db=>{
   const result=await db.query(
    "UPDATE bv_approvals SET status=$1 WHERE id=$2 AND tenant_id=$3 AND status='PENDING' RETURNING id,tenant_id,task_id,status,requested_by,created_at",
    [decision,approvalId,actor.tenantId]);
   if(!result.rowCount)throw new ApiError(409,'APPROVAL_NOT_PENDING');
   return result.rows[0];
  });
 }
});
export async function closeDb(){await pool.end()}
