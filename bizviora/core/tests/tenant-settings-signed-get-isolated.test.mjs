import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {createApi} from '../src/api.mjs';
import {ApiError} from '../src/access.mjs';

// Synthetic signed-JWT GET regression only. This does not substitute for Supabase Auth staging E2E.
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UA='11111111-1111-4111-8111-111111111111',UB='22222222-2222-4222-8222-222222222222';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const issue=(sub,extra={})=>{
 const h=enc({alg:'RS256',typ:'JWT'}),p=enc({sub,iss:'synthetic-ci',aud:'settings',exp:4102444800,...extra});
 return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
};
const api=createApi({
 verifyBearer:async jwt=>{
  try {
   const [h,p,s]=jwt.split('.');
   const payload=JSON.parse(Buffer.from(p,'base64url').toString());
   if(!verify('RSA-SHA256',Buffer.from(h+'.'+p),publicKey,Buffer.from(s,'base64url'))||
      payload.iss!=='synthetic-ci'||payload.aud!=='settings'||payload.exp<=Date.now()/1000)
     throw Error('bad token');
   return {id:payload.sub};
  } catch {throw new ApiError(401,'AUTH_INVALID');}
 },
 repository:()=>({
  membership:async({tenantId,userId})=>(tenantId===A&&userId===UA)||(tenantId===B&&userId===UB)?
    {tenant_id:tenantId,user_id:userId,role:'owner'}:null,
  context:async actor=>({tenant:{id:actor.tenantId,name:actor.tenantId===A?'Tenant A':'Tenant B',slug:'synthetic'},
    businessUnits:[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Unit',tenant_id:actor.tenantId}],
    properties:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Property',tenant_id:actor.tenantId,business_unit_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]})
 })
});
async function get(jwt,tenant=A){
 const r=await api(new Request('http://localhost/v1/tenant-settings?tenantId='+tenant,{
  headers:jwt?{authorization:'Bearer '+jwt}:{}
 }));
 return {status:r.status,body:await r.json()};
}
test('signed member A GET only A, no synthetic fallback',async()=>{
 const r=await get(issue(UA),A);
 assert.equal(r.status,200);
 assert.equal(r.body.tenantId,A);
 assert.equal(r.body.sections.knowledge.status,'NOT_CONFIGURED');
 assert.equal(r.body.capabilities.profileWrite,false);
});
test('signed member B cannot read A',async()=>assert.equal((await get(issue(UB),A)).status,403));
test('missing token denied',async()=>assert.equal((await get(null,A)).status,401));
test('wrong audience denied',async()=>assert.equal((await get(issue(UA,{aud:'wrong'}),A)).status,401));
test('expired token denied',async()=>assert.equal((await get(issue(UA,{exp:1}),A)).status,401));
