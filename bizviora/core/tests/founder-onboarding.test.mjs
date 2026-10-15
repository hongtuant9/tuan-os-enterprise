import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
const founder='11111111-1111-4111-8111-111111111111';
const applicant='22222222-2222-4222-8222-222222222222';
const application='33333333-3333-4333-8333-333333333333';
const tokenOf=u=>'testtoken_'+u.replace(/-/g,'');
function setup(){
 const calls=[];
 const api=createApi({
  verifyBearer:async token=>({id:token===tokenOf(founder)?founder:applicant}),
  requireFounder:async(_token,u)=>({userId:u.id,platformManager:u.id===founder}),
  repository:()=>({
   listCompanies:async id=>{calls.push(['list',id]);return[]},
   submitCompany:async input=>{calls.push(['submit',input]);return {id:application,status:'PENDING'}},
   decideCompany:async input=>{calls.push(['decide',input]);return {application_id:application,decision_status:input.decision}},
  })
 });
 return {api,calls};
}
const req=(path,token,body,method='POST')=>new Request('http://localhost'+path,{
 method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},
 ...(body===undefined?{}:{body:JSON.stringify(body)})
});
test('registered applicant creates pending only',async()=>{
 const {api,calls}=setup();
 const r=await api(req('/v1/company-applications',tokenOf(applicant),{companyName:'Test Café',requestedSlug:'test-cafe'}));
 assert.equal(r.status,201);assert.equal(calls[0][0],'submit');assert.equal(calls[0][1].userId,applicant);
});
test('invalid company input returns 400 before insert',async()=>{
 const {api,calls}=setup();
 const r=await api(req('/v1/company-applications',tokenOf(applicant),{companyName:'A',requestedSlug:'A BAD SLUG'}));
 assert.equal(r.status,400);assert.equal(calls.length,0);
});
test('non-founder decision fails closed 403',async()=>{
 const {api,calls}=setup();
 const r=await api(req('/v1/company-applications/decision',tokenOf(applicant),{applicationId:application,decision:'APPROVED'}));
 assert.equal(r.status,403);assert.equal(calls.length,0);
});
test('founder decision invokes repository only on approved decision enum',async()=>{
 const {api,calls}=setup();
 const wrong=await api(req('/v1/company-applications/decision',tokenOf(founder),{applicationId:application,decision:'ACTIVATE'}));
 assert.equal(wrong.status,400);
 const ok=await api(req('/v1/company-applications/decision',tokenOf(founder),{applicationId:application,decision:'APPROVED'}));
 assert.equal(ok.status,200);assert.equal(calls.length,1);assert.equal(calls[0][1].userId,founder);
});
test('anonymous registration rejected and no data changes',async()=>{
 const {api,calls}=setup();
 const r=await api(new Request('http://localhost/v1/company-applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyName:'T',requestedSlug:'test-tenant'})}));
 assert.equal(r.status,401);assert.equal(calls.length,0);
});
