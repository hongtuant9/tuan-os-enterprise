import test from 'node:test';
import assert from 'node:assert/strict';
import {LIVE_ROUTES,businessRows,reviewWithEvidence} from '../ops-review.mjs';
const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function gate(overrides={}){
 const before={id:ID,status:'PENDING',tenant_id:null};
 const after={id:ID,status:'APPROVED',tenant_id:TENANT};
 return {
  isManager:async()=>true,
  getRequest:async()=>gate.calls++===0?before:after,
  commit:async()=>({request_id:ID,status:'APPROVED',tenant_id:TENANT}),
  getReview:async()=>({request_id:ID,result:'APPROVED'}),
  ...overrides
 };
}
test('live operational routes replace demo only for four constrained workspaces',()=>{
 assert.deepEqual([...LIVE_ROUTES],['tenants','onboarding','approvals','audit']);
});
test('tenant list is derived from audited approved requests only',()=>{
 const rows=businessRows([{id:ID,business_name:'QA Company',plan_code:'TRIAL_7D',status:'APPROVED',tenant_id:TENANT},
 {id:'p',status:'PENDING',tenant_id:null},{id:'bad',status:'APPROVED',tenant_id:null}]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].tenant_id,TENANT);
});
test('approval checks manager, RPC outcome, request readback and audit',async()=>{
 const x=gate();x.calls=0;
 const r=await reviewWithEvidence(x,{id:ID,approve:true,note:'Approved synthetic QA only'});
 assert.deepEqual(r,{status:'APPROVED',tenantId:TENANT,verified:true});
});
test('nonmanager denied before any mutation',async()=>{
 let called=false;
 const g=gate({isManager:async()=>false,commit:async()=>{called=true}});
 await assert.rejects(reviewWithEvidence(g,{id:ID,approve:true,note:'Synthetic test review'}),/MANAGER_REQUIRED/);
 assert.equal(called,false);
});
test('request not pending fails closed',async()=>{
 let called=false;
 const g=gate({getRequest:async()=>({id:ID,status:'APPROVED',tenant_id:TENANT}),commit:async()=>{called=true}});
 await assert.rejects(reviewWithEvidence(g,{id:ID,approve:true,note:'Synthetic test review'}),/REQUEST_NOT_PENDING/);
 assert.equal(called,false);
});
test('failed audit readback is not reported as pass',async()=>{
 const g=gate({getReview:async()=>null});g.calls=0;
 await assert.rejects(reviewWithEvidence(g,{id:ID,approve:true,note:'Synthetic test review'}),/AUDIT_READBACK_FAILED/);
});
test('failed tenant activation readback is not reported as pass',async()=>{
 const g=gate({getRequest:async()=>({id:ID,status:'PENDING',tenant_id:null})});g.calls=0;
 await assert.rejects(reviewWithEvidence(g,{id:ID,approve:true,note:'Synthetic test review'}),/REVIEW_READBACK_FAILED/);
});
test('invalid notes cannot mutate',async()=>{
 const g=gate();g.calls=0;
 await assert.rejects(reviewWithEvidence(g,{id:ID,approve:true,note:'short'}),/INVALID_REVIEW_INPUT/);
});
test('reject path requires no tenant and audit rejection',async()=>{
 let calls=0;
 const g=gate({
  getRequest:async()=>++calls===1?{id:ID,status:'PENDING',tenant_id:null}:{id:ID,status:'REJECTED',tenant_id:null},
  commit:async()=>({request_id:ID,status:'REJECTED',tenant_id:null}),
  getReview:async()=>({request_id:ID,result:'REJECTED'})
 });
 const v=await reviewWithEvidence(g,{id:ID,approve:false,note:'QA rejected with evidence'});
 assert.equal(v.status,'REJECTED');assert.equal(v.tenantId,null);
});
