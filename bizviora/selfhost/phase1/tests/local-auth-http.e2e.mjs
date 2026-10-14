// Synthetic, local-only Keycloak JWT -> Core API -> PostgreSQL RLS/Audit test.
// No production services, emails, business data or persisted credentials.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const authBase='http://127.0.0.1:18093';
const apiBase='http://127.0.0.1:18094';
const realm='bizviora-phase1';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const idFormat=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeInput=value=>{assert.match(value,idFormat);return value};
const password='qa-synthetic-'+randomBytes(24).toString('hex');
async function postForm(url,params){
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
 const result=await response.json().catch(()=>({}));
 if(response.status!==200){
  // Only expose Keycloak's classified error; never credentials, JWT or raw response.
  const reason=String(result.error||'unknown').replace(/[^a-z_]/gi,'').slice(0,36);
  const detail=String(result.error_description||'').replace(/[^a-zA-Z .]/g,'').slice(0,70);
  throw Error('KEYCLOAK_LOGIN_DENIED_HTTP_'+response.status+'_'+reason+'_'+detail);
 }
 assert.ok(result.access_token&&typeof result.access_token==='string');
 return result.access_token;
}
const admin=await postForm(authBase+'/realms/master/protocol/openid-connect/token',{
 grant_type:'password',client_id:'admin-cli',username:'lab-admin',
 password:process.env.LAB_AUTH_ADMIN_PASSWORD
});
async function createSyntheticUser(name){
 const url=authBase+'/admin/realms/'+realm+'/users';
 const result=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+admin,'content-type':'application/json'},body:JSON.stringify({
  username:name,enabled:true,email:name+'@qa.invalid',emailVerified:true,
  firstName:'Synthetic',lastName:'QATester',requiredActions:[],
  credentials:[{type:'password',value:password,temporary:false}]
 })});
 assert.equal(result.status,201,'Synthetic Keycloak user creation failed HTTP '+result.status);
 const id=result.headers.get('location')?.split('/').pop()||'';
 return safeInput(id);
}
const suffix=randomBytes(5).toString('hex');
const accountA='qa-a-'+suffix,accountB='qa-b-'+suffix,accountStaff='qa-staff-'+suffix;
const users={A:await createSyntheticUser(accountA),B:await createSyntheticUser(accountB),S:await createSyntheticUser(accountStaff)};
function db(sql){
 return execFileSync('docker',['compose','-f','bizviora/selfhost/phase1/compose.yaml','exec','-T','db','psql',
  '-U','postgres','-d','bizviora_phase1','-v','ON_ERROR_STOP=1','-Atc',sql],{
   encoding:'utf8',timeout:15000,env:process.env,stdio:['ignore','pipe','pipe']
 }).trim();
}
db(`INSERT INTO bv_tenants(id,slug,name) VALUES
('${a}','qa-a','Synthetic QA A'),('${b}','qa-b','Synthetic QA B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO bv_memberships(tenant_id,user_id,role) VALUES
('${a}','${users.A}','owner'),('${a}','${users.S}','staff'),
('${b}','${users.B}','owner') ON CONFLICT DO NOTHING;`);
async function getToken(user){
 return postForm(authBase+'/realms/'+realm+'/protocol/openid-connect/token',{
  grant_type:'password',client_id:'bizviora-phase1-qa',username:user,password
 });
}
const tokens={A:await getToken(accountA),B:await getToken(accountB),S:await getToken(accountStaff)};
async function request(path,{method='GET',token,body}={}){
 const headers={};
 if(token)headers.authorization='Bearer '+token;
 if(body!==undefined)headers['content-type']='application/json';
 const res=await fetch(apiBase+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const json=await res.json().catch(()=>({}));
 return {status:res.status,data:json};
}
async function expect(path,options,status){
 const result=await request(path,options);
 assert.equal(result.status,status,methodLabel(path,options,status)+' returned HTTP '+result.status);
 return result.data;
}
function methodLabel(path,opts,s){return (opts?.method||'GET')+' '+path+' expected '+s}
assert.equal((await expect('/health',{},200)).scope,'SELF_HOSTED_PHASE1_SYNTHETIC');
await expect('/v1/context?tenantId='+a,{},401);
await expect('/v1/context?tenantId='+a,{token:'invalid-token'},401);
await expect('/v1/context?tenantId='+a,{token:tokens.A},200);
await expect('/v1/context?tenantId='+b,{token:tokens.A},403);
await expect('/v1/context?tenantId='+a,{token:tokens.B},403);
await expect('/v1/context?tenantId='+b,{token:tokens.B},200);
const taskA=(await expect('/v1/tasks',{method:'POST',token:tokens.A,body:{tenantId:a,title:'QA task A'}},201)).data;
assert.equal(taskA.tenant_id,a);safeInput(taskA.id);
await expect('/v1/tasks',{method:'POST',token:tokens.S,body:{tenantId:a,title:'Staff forbidden'}},403);
await expect('/v1/tasks',{method:'POST',token:tokens.A,body:{tenantId:b,title:'Cross tenant'}},403);
const taskB=(await expect('/v1/tasks',{method:'POST',token:tokens.B,body:{tenantId:b,title:'QA task B'}},201)).data;
assert.equal(taskB.tenant_id,b);safeInput(taskB.id);
await expect('/v1/approvals',{method:'POST',token:tokens.A,body:{tenantId:b,taskId:taskB.id}},403);
const approvalA=(await expect('/v1/approvals',{method:'POST',token:tokens.A,body:{tenantId:a,taskId:taskA.id}},201)).data;
assert.equal(approvalA.status,'PENDING');safeInput(approvalA.id);
await expect('/v1/approvals/decision',{method:'POST',token:tokens.S,body:{tenantId:a,approvalId:approvalA.id,decision:'REJECTED'}},403);
await expect('/v1/approvals/decision',{method:'POST',token:tokens.B,body:{tenantId:a,approvalId:approvalA.id,decision:'APPROVED'}},403);
const decisionA=(await expect('/v1/approvals/decision',{method:'POST',token:tokens.A,body:{tenantId:a,approvalId:approvalA.id,decision:'APPROVED'}},200)).data;
assert.equal(decisionA.status,'APPROVED');
await expect('/v1/approvals/decision',{method:'POST',token:tokens.A,body:{tenantId:a,approvalId:approvalA.id,decision:'REJECTED'}},409);
const approvalB=(await expect('/v1/approvals',{method:'POST',token:tokens.B,body:{tenantId:b,taskId:taskB.id}},201)).data;
safeInput(approvalB.id);
assert.equal((await expect('/v1/approvals/decision',{method:'POST',token:tokens.B,body:{tenantId:b,approvalId:approvalB.id,decision:'REJECTED'}},200)).data.status,'REJECTED');
for(const [tenant,user,task,approval] of [[a,users.A,taskA.id,approvalA.id],[b,users.B,taskB.id,approvalB.id]]){
 const result=db(`SELECT CASE WHEN
 (SELECT COUNT(*) FROM bv_audit_events WHERE tenant_id='${tenant}' AND actor_user_id='${user}' AND entity_type='task' AND entity_id='${task}' AND operation='INSERT')=1
 AND (SELECT COUNT(*) FROM bv_audit_events WHERE tenant_id='${tenant}' AND actor_user_id='${user}' AND entity_type='approval' AND entity_id='${approval}' AND operation='INSERT')=1
 AND (SELECT COUNT(*) FROM bv_audit_events WHERE tenant_id='${tenant}' AND actor_user_id='${user}' AND entity_type='approval' AND entity_id='${approval}' AND operation='UPDATE')=1
 THEN 'PASS' ELSE 'FAIL' END;`);
 assert.equal(result,'PASS','PostgreSQL Audit correlation failure');
}
console.log('PASS: Local Keycloak synthetic JWT, Core API own/cross/staff, approve/reject, duplicate denial and PostgreSQL Audit (zero external data)');
