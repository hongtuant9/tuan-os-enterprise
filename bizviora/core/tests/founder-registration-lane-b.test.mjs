import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const token='founder-token-123456789';
let calls=0;
const api=createApi({
 verifyBearer:async t=>t===token?{id:uid}:null,
 requireFounder:async(t,u)=>t===token?{userId:u.id,platformManager:true}:null,
 repository:()=>({
  founderRegistrations:async()=>[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'PENDING'}],
  reviewRegistration:async x=>{calls++;return {request_id:x.requestId,status:x.approve?'APPROVED':'REJECTED',tenant_id:x.approve?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':null};}
 })
});
const req=(path,method='GET',payload=null,t=token)=>new Request('https://example.invalid'+path,{method,headers:{Authorization:'Bearer '+t},...(payload?{body:JSON.stringify(payload)}:{})});
async function run(...args){const r=await api(req(...args));return {status:r.status,body:await r.json()};}
test('non-founder denied before repository',async()=>assert.equal((await run('/v1/founder/registrations','GET',null,'other-token-12345')).status,401));
test('founder lists PENDING applications',async()=>{const r=await run('/v1/founder/registrations');assert.equal(r.status,200);assert.equal(r.body.data[0].status,'PENDING');});
test('approve invokes guarded RPC adapter once',async()=>{const before=calls;const r=await run('/v1/founder/registrations/review','POST',{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',approve:true});assert.equal(r.status,200);assert.equal(r.body.data.status,'APPROVED');assert.equal(calls,before+1);});
test('reject does not create tenant in returned result',async()=>{const r=await run('/v1/founder/registrations/review','POST',{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',approve:false,note:'No'});assert.equal(r.status,200);assert.equal(r.body.data.tenant_id,null);});
test('review rejects forced status, tenant_id, and invalid ID',async()=>{const before=calls;for(const body of [{requestId:'bad',approve:true},{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',approve:true,status:'APPROVED'},{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',approve:'yes'}])assert.equal((await run('/v1/founder/registrations/review','POST',body)).status,400);assert.equal(calls,before);});
test('Founder read endpoint disallows POST',async()=>assert.equal((await run('/v1/founder/registrations','POST',{approve:true})).status,405));
