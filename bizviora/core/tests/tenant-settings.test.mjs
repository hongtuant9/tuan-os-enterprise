import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.mjs';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U='11111111-1111-4111-8111-111111111111';
const BU='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const P='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
let corrupt=false,calls=0;
const api=createApi({
 verifyBearer:async token=>token==='valid-owner-A-token'?{id:U}:null,
 repository:()=>({
  membership:async ({tenantId,userId})=>tenantId===A&&userId===U?
    {tenant_id:A,user_id:U,role:'owner'}:null,
  context:async actor=>{
   calls++;
   return {tenant:{id:corrupt?B:actor.tenantId,name:'TUAN OS Enterprise',slug:'tuan-os'},
    businessUnits:[{id:BU,name:'Hospitality'}],
    properties:[{id:P,business_unit_id:BU,name:'Lavender Homestay'}]};
  }
 })
});
async function query(path,token='valid-owner-A-token',method='GET'){
 const headers=token?{Authorization:'Bearer '+token}:{};
 const response=await api(new Request('http://qa.invalid'+path,{headers,method}));
 return {status:response.status,body:await response.json()};
}
test('returns scoped company and property without writing secrets',async()=>{
 const r=await query('/v1/tenant-settings?tenantId='+A);
 assert.equal(r.status,200);
 assert.equal(r.body.profile.name,'TUAN OS Enterprise');
 assert.equal(r.body.profile.contactStatus,'NOT_VERIFIED');
 assert.deepEqual(r.body.properties.map(x=>x.name),['Lavender Homestay']);
 assert.equal(r.body.capabilities.profileWrite,false);
 assert.equal(JSON.stringify(r.body).includes('secret'),false);
});
test('missing bearer is 401',async()=>assert.equal((await query('/v1/tenant-settings?tenantId='+A,null)).status,401));
test('cross tenant denied before context load',async()=>{
 calls=0;assert.equal((await query('/v1/tenant-settings?tenantId='+B)).status,403);
 assert.equal(calls,0);
});
test('unexpected upstream tenant is denied',async()=>{
 corrupt=true;
 assert.equal((await query('/v1/tenant-settings?tenantId='+A)).status,403);
 corrupt=false;
});
test('writes are disabled',async()=>assert.notEqual((await query('/v1/tenant-settings','valid-owner-A-token','POST')).status,200));
