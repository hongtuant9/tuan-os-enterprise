import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';

const founder='11111111-1111-4111-8111-111111111111';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tenant='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const records=new Map([[a,{id:a,status:'PENDING',tenant_id:null}],[b,{id:b,status:'PENDING',tenant_id:null}]]);
const tenants=new Map(),memberships=[],audit=[];
let revision=0;
const db={
 founderRegistrations:async()=>[...records.values()],
 reviewRegistration:async({requestId,approve})=>{
  const x=records.get(requestId);
  if(!x || x.status!=='PENDING')throw new Error('APPLICATION_NOT_PENDING');
  x.status=approve?'APPROVED':'REJECTED';
  if(approve){x.tenant_id=tenant;tenants.set(tenant,{id:tenant});memberships.push({tenant_id:tenant,role:'owner'});}
  audit.push({request_id:requestId,status:x.status});
  revision++;
  return {request_id:requestId,status:x.status,tenant_id:x.tenant_id};
 }
};
const api=createApi({
 verifyBearer:async token=>token==='founder-token-123456789'?{id:founder}:token==='staff-token-123456789'?{id:'22222222-2222-4222-8222-222222222222'}:null,
 requireFounder:async(_token,user)=>user.id===founder?{userId:founder,platformManager:true}:null,
 repository:()=>db
});
async function review(id,approve,token='founder-token-123456789'){
 const res=await api(new Request('https://qa.invalid/v1/founder/registrations/review',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({requestId:id,approve})}));
 return {status:res.status,body:await res.json()};
}
test('staff denied on Founder action with zero mutations',async()=>{
 const before=revision;
 const r=await review(a,true,'staff-token-123456789');
 assert.equal(r.status,403);assert.equal(revision,before);
});
test('approve creates exactly one tenant and owner membership and audit',async()=>{
 const r=await review(a,true);
 assert.equal(r.status,200);assert.equal(records.get(a).status,'APPROVED');
 assert.equal(tenants.size,1);assert.equal(memberships.length,1);assert.equal(audit.length,1);
});
test('replay returns fail-closed, no duplicate tenant membership or audit',async()=>{
 const before=revision;const r=await review(a,true);
 assert.equal(r.status,503);assert.equal(revision,before);
 assert.equal(tenants.size,1);assert.equal(memberships.length,1);assert.equal(audit.length,1);
});
test('reject records decision but creates no tenant or membership',async()=>{
 const before=revision;const r=await review(b,false);
 assert.equal(r.status,200);assert.equal(records.get(b).status,'REJECTED');
 assert.equal(records.get(b).tenant_id,null);assert.equal(tenants.size,1);
 assert.equal(memberships.length,1);assert.equal(revision,before+1);assert.equal(audit.length,2);
});
test('rejected request cannot be subsequently approved',async()=>{
 const before=revision;const r=await review(b,true);
 assert.equal(r.status,503);assert.equal(revision,before);assert.equal(tenants.size,1);
});
