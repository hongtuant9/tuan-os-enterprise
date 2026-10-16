import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U='11111111-1111-4111-8111-111111111111';
let role='owner', count=0, isReady=false;
const api=createApi({
 verifyBearer:async t=>t==='qa-owner-token'?{id:U}:null,
 repository:()=>({
  membership:async ({tenantId,userId})=>tenantId===A&&userId===U?
    {tenant_id:A,user_id:U,role}:null,
  updateTenantProfileAtomic:undefined
 })
});
async function call(payload,tenant=A){
 const response=await api(new Request('http://synthetic.invalid/v1/tenant-settings/profile',{
  method:'POST',headers:{Authorization:'Bearer qa-owner-token'},
  body:JSON.stringify({tenantId:tenant,...payload})
 }));
 return {status:response.status,body:await response.json()};
}
test('safe default: authenticated owner cannot write without atomic audited adapter',async()=>{
 const r=await call({displayName:'TUAN OS',expectedVersion:1});
 assert.equal(r.status,503);assert.equal(r.body.error,'SETTINGS_WRITE_NOT_ENABLED');
});
test('staff cannot mutate settings',async()=>{
 role='staff';
 assert.equal((await call({displayName:'TUAN OS',expectedVersion:1})).status,403);
 role='owner';
});
test('forged target tenant rejected',async()=>{
 assert.equal((await call({displayName:'TUAN OS',expectedVersion:1},B)).status,403);
});
test('bad version, extra privileged fields and blank name rejected',async()=>{
 for(const input of [
  {displayName:'TUAN OS',expectedVersion:0},
  {displayName:' ',expectedVersion:1},
  {displayName:'TUAN OS',expectedVersion:1,userId:U},
  {displayName:'TUAN OS',expectedVersion:1,role:'owner'}
 ])assert.equal((await call(input)).status,400);
});
test('invalid auth denies write',async()=>{
 const r=await api(new Request('http://synthetic.invalid/v1/tenant-settings/profile',{
  method:'POST',body:JSON.stringify({tenantId:A,displayName:'X Company',expectedVersion:1})
 }));
 assert.equal(r.status,401);
});
