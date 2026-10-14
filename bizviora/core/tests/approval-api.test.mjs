import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function fixture(role='owner') {
 const writes=[];
 const api=createApi({verifyBearer:async()=>({id:user}),repository:()=>({
 membership:async({tenantId})=>tenantId===tenant?{tenant_id:tenant,user_id:user,role}:null,
 requestApproval:async(actor,input)=>{writes.push({actor,input});return {tenant_id:actor.tenantId,status:'PENDING'}},
 decideApproval:async(actor,input)=>{writes.push({actor,input});return {tenant_id:actor.tenantId,status:input.decision}}
 })});
 const call=async(path,body)=>{const r=await api(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer synthetic-token-12345'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};
 return {call,writes};
}
for(const role of ['owner','staff']) test(role+' requests pending approval',async()=>{const f=fixture(role);const r=await f.call('/v1/approvals',{tenantId:tenant,status:'APPROVED',requested_by:other});assert.equal(r.status,201);assert.equal(r.body.data.status,'PENDING');assert.deepEqual(f.writes[0].input,{taskId:null});assert.equal(f.writes[0].actor.userId,user)});
for(const decision of ['APPROVED','REJECTED']) test('owner decides '+decision,async()=>{const f=fixture();const r=await f.call('/v1/approvals/decision',{tenantId:tenant,approvalId:other,decision});assert.equal(r.status,200);assert.equal(r.body.data.status,decision)});
for(const path of ['/v1/approvals','/v1/approvals/decision']) test('foreign tenant denied '+path,async()=>{const f=fixture();assert.equal((await f.call(path,{tenantId:other,approvalId:other,decision:'APPROVED'})).status,403);assert.equal(f.writes.length,0)});
test('staff decision denied without write',async()=>{const f=fixture('staff');assert.equal((await f.call('/v1/approvals/decision',{tenantId:tenant,approvalId:other,decision:'APPROVED'})).status,403);assert.equal(f.writes.length,0)});
for(const body of [{approvalId:'invalid',decision:'APPROVED'},{approvalId:other,decision:'PENDING'}]) test('invalid decision input denied '+JSON.stringify(body),async()=>{const f=fixture();assert.equal((await f.call('/v1/approvals/decision',{tenantId:tenant,...body})).status,400);assert.equal(f.writes.length,0)});
