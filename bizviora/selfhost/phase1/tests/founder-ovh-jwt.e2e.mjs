// Founder OVH synthetic E2E. Tokens are supplied locally via environment; never printed or persisted.
// Run only against loopback staging, with temporary Founder grant and synthetic Keycloak users.
// No credential retrieval, admin login, Docker socket access, or implicit privilege grants.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base=process.env.BIZV_QA_API_BASE||'http://127.0.0.1:18104';
const tokens={
 founder:process.env.BIZV_QA_FOUNDER_JWT||'',
 a:process.env.BIZV_QA_APPLICANT_A_JWT||'',
 b:process.env.BIZV_QA_APPLICANT_B_JWT||''
};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function check(condition,label){assert.ok(condition,label);console.log('PASS '+label)}
async function request(path,token,method='GET',body){
 const r=await fetch(base+path,{method,headers:{
   ...(token?{authorization:'Bearer '+token}:{}),
   ...(body?{'content-type':'application/json'}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));
 return {status:r.status,data};
}
function status(result,expected,name){
 check(result.status===expected,name+'_HTTP_'+expected+'_ACTUAL_'+result.status);
 return result.data;
}
export async function main(overrideTokens){
 if(overrideTokens)Object.assign(tokens,overrideTokens);
 const url=new URL(base);
 assert.equal(url.protocol,'http:','Only loopback HTTP staging');
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Non-loopback target prohibited');
 assert.equal(url.port,'18104','Only isolated Founder staging API');
 const health=await request('/health');
 status(health,200,'CORE_HEALTH');
 status(await request('/v1/founder/access'),401,'ANONYMOUS_DENIED');
 const mode=process.argv[2]||'preflight';
 assert.ok(['preflight','execute'].includes(mode),'Mode must be preflight or execute');
 if(mode==='preflight'){
  check(!Object.values(tokens).some(Boolean),'PREFLIGHT_NO_SECRETS_REQUIRED');
  console.log('READY_FOR_OWNER_TOKEN_PROVISIONING; NO_WRITES_PERFORMED');
  return;
 }
 for(const [name,value] of Object.entries(tokens)){
   assert.ok(value.length>=40 && !/\s/.test(value),'Missing locally-provided JWT '+name);
 }
 status(await request('/v1/founder/access',tokens.a),403,'APPLICANT_A_NOT_FOUNDER');
 status(await request('/v1/founder/access',tokens.b),403,'APPLICANT_B_NOT_FOUNDER');
 status(await request('/v1/founder/access',tokens.founder),200,'FOUNDER_ALLOWED');
 const suffix=randomBytes(6).toString('hex');
 const slugA='bvqa-a-'+suffix,slugB='bvqa-b-'+suffix;
 console.log('QA_RUN_ID '+suffix+'; SYNTHETIC_APPLICATIONS_ONLY');
 const createA=status(await request('/v1/company-applications',tokens.a,'POST',{companyName:'Synthetic QA A '+suffix,requestedSlug:slugA}),201,'APPLICANT_A_SUBMIT');
 const createB=status(await request('/v1/company-applications',tokens.b,'POST',{companyName:'Synthetic QA B '+suffix,requestedSlug:slugB}),201,'APPLICANT_B_SUBMIT');
 const idA=createA.data?.id||createA.data?.application_id;
 const idB=createB.data?.id||createB.data?.application_id;
 assert.match(idA||'',uuid,'Applicant A application UUID');
 assert.match(idB||'',uuid,'Applicant B application UUID');
 status(await request('/v1/company-applications/decision',tokens.a,'POST',{applicationId:idA,decision:'APPROVED'}),403,'NONFOUNDER_DECISION_DENIED');
 status(await request('/v1/company-applications/decision',tokens.founder,'POST',{applicationId:idA,decision:'APPROVED'}),200,'FOUNDER_APPROVE_A');
 status(await request('/v1/company-applications/decision',tokens.founder,'POST',{applicationId:idB,decision:'REJECTED'}),200,'FOUNDER_REJECT_B');
 status(await request('/v1/company-applications/decision',tokens.founder,'POST',{applicationId:idA,decision:'APPROVED'}),409,'REPLAY_DENIED');
 const listA=status(await request('/v1/company-applications',tokens.a),200,'APPLICANT_A_LIST');
 const listB=status(await request('/v1/company-applications',tokens.b),200,'APPLICANT_B_LIST');
 assert.ok(Array.isArray(listA.data)&&Array.isArray(listB.data),'List shape expected');
 check(listA.data.some(x=>x.id===idA||x.application_id===idA),'A_OWN_APPLICATION_VISIBLE');
 check(!listA.data.some(x=>x.id===idB||x.application_id===idB),'A_CANNOT_VIEW_B');
 check(listB.data.some(x=>x.id===idB||x.application_id===idB),'B_OWN_APPLICATION_VISIBLE');
 check(!listB.data.some(x=>x.id===idA||x.application_id===idA),'B_CANNOT_VIEW_A');
 const approvedApplication=listA.data.find(x=>x.id===idA||x.application_id===idA);
 const tenantId=approvedApplication?.tenant_id;
 assert.match(tenantId||'',uuid,'Approved tenant ID from applicant list');
 status(await request('/v1/context?tenantId='+tenantId,tokens.a),200,'APPLICANT_A_OWN_TENANT_CONTEXT');
 status(await request('/v1/context?tenantId='+tenantId,tokens.b),403,'APPLICANT_B_CROSS_TENANT_DENIED');
 console.log('E2E_HTTP_AND_TENANT_RLS_PASS; AUDIT_DB_READBACK_REQUIRED; REVOKE_FOUNDER_GRANT_IMMEDIATELY');
}
if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]){
 main().catch(e=>{console.error('FAIL '+String(e?.message||'UNKNOWN').replace(/[A-Za-z0-9_-]{45,}/g,'[REDACTED]'));process.exitCode=1});
}
