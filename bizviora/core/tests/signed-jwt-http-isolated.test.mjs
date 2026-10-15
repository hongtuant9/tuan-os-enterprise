import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {createServer} from 'node:http';
import {createApi} from '../src/api.mjs';
import {ApiError} from '../src/access.mjs';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UO='11111111-1111-4111-8111-111111111111';
const US='33333333-3333-4333-8333-333333333333';
const UB='22222222-2222-4222-8222-222222222222';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const issuer='https://synthetic.invalid/realms/biz2';
const audience='biz2-core';
function token(id,overrides={}){
 const header=enc({alg:'RS256',typ:'JWT',kid:'synthetic-ci'});
 const body=enc({sub:id,iss:issuer,aud:audience,iat:1700000000,exp:4102444800,...overrides});
 const payload=header+'.'+body;
 return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');
}
async function verifyBearer(jwt){
 const parts=jwt.split('.');
 if(parts.length!==3)throw new ApiError(401,'AUTH_INVALID');
 const [h,p,s]=parts;
 const hdr=JSON.parse(Buffer.from(h,'base64url').toString());
 const claims=JSON.parse(Buffer.from(p,'base64url').toString());
 if(hdr.alg!=='RS256'||!verify('RSA-SHA256',Buffer.from(h+'.'+p),publicKey,Buffer.from(s,'base64url')))
  throw new ApiError(401,'AUTH_INVALID');
 if(claims.iss!==issuer||claims.aud!==audience||claims.exp<=Date.now()/1000)throw new ApiError(401,'AUTH_INVALID');
 return {id:claims.sub};
}
const membership={
 [A]:{[UO]:'owner',[US]:'staff'},
 [B]:{[UB]:'owner'}
};
let version=1,name='Synthetic Tenant A',audit=[];
const api=createApi({
 verifyBearer,
 repository:()=>({
  membership:async ({tenantId,userId})=>membership[tenantId]?.[userId]?
   {tenant_id:tenantId,user_id:userId,role:membership[tenantId][userId]}:null,
  context:async actor=>({tenant:{id:actor.tenantId,name,settings_version:version},businessUnits:[],properties:[]}),
  updateTenantProfileAtomic:async (actor,{name:newName,expectedVersion})=>{
   if(expectedVersion!==version){throw new ApiError(409,'SETTINGS_VERSION_CONFLICT');}
   name=newName;version++;const id='audit-'+version;audit.push({id,tenantId:actor.tenantId});
   return {tenantId:actor.tenantId,name,version,auditEventId:id};
  }
 })
});
let server,origin;
test.before(async()=>{
 server=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const response=await api(new Request('http://localhost'+req.url,{
   method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})
  }));
  res.writeHead(response.status,Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));});
async function http(jwt,tenant=A,body={displayName:'Updated Tenant A',expectedVersion:version}){
 const r=await fetch(origin+'/v1/tenant-settings/profile',{method:'POST',
 headers:{authorization:'Bearer '+jwt,'content-type':'application/json'},
 body:JSON.stringify({tenantId:tenant,...body})});
 return {status:r.status,data:await r.json()};
}
test('signed RS256 Owner A HTTP write returns audit',async()=>{
 const r=await http(token(UO));assert.equal(r.status,200);assert.equal(r.data.version,2);
 assert.equal(audit.length,1);
});
test('signed RS256 Staff A rejected',async()=>assert.equal((await http(token(US))).status,403));
test('signed RS256 Owner B cannot update tenant A',async()=>assert.equal((await http(token(UB))).status,403));
test('signed RS256 Owner B cannot masquerade as A',async()=>assert.equal((await http(token(UB),A)).status,403));
test('tampered signature rejected',async()=>{
 const t=token(UO);assert.equal((await http(t.slice(0,-2)+'00')).status,503);
});
test('wrong issuer and audience rejected',async()=>{
 assert.equal((await http(token(UO,{iss:'https://evil.invalid'}))).status,401);
 assert.equal((await http(token(UO,{aud:'wrong-api'}))).status,503);
});
test('stale optimistic version rejected without changing audit',async()=>{
 const r=await http(token(UO),A,{displayName:'Overwrite',expectedVersion:1});
 assert.notEqual(r.status,200);assert.equal(audit.length,1);
});
