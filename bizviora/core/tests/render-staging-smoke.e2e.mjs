// Manual read-only Render staging smoke test: node --test tests/render-staging-smoke.e2e.mjs
// Never runs as unit test. Does not require a bearer token or mutate data.
import test from 'node:test';
import assert from 'node:assert/strict';

const url=process.env.BIZVIORA_RENDER_STAGING_URL;
if(process.env.BIZVIORA_RENDER_SMOKE_ACK!=='READ_ONLY_STAGING')throw Error('RENDER_STAGING_SMOKE_ACK_REQUIRED');
if(!url)throw Error('RENDER_STAGING_URL_REQUIRED');
const target=new URL(url);
if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||
   !/^bizviora-[a-z0-9-]+\.onrender\.com$/i.test(target.hostname)||target.pathname!=='/')
 throw Error('UNSAFE_RENDER_STAGING_URL');
const endpoint=(path)=>new URL(path,target).toString();
async function call(path,method='GET'){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
 try{return await fetch(endpoint(path),{method,redirect:'manual',signal:controller.signal,headers:{Accept:'application/json'}});}
 finally{clearTimeout(timeout);}
}
test('staging Core health is reachable and marked STAGING_ONLY',async()=>{
 const r=await call('/health');
 assert.equal(r.status,200);const json=await r.json();
 assert.equal(json.scope,'STAGING_ONLY');
 assert.equal(json.autoSend,false);assert.equal(json.bookingWrite,false);
});
test('unauthenticated Founder access is denied (401)',async()=>{
 const r=await call('/v1/founder/access');assert.equal(r.status,401);
 assert.equal((await r.json()).error,'AUTH_REQUIRED');
});
test('unauthenticated tenant tasks are denied (401)',async()=>{
 const r=await call('/v1/tasks?tenantId=00000000-0000-4000-8000-000000000001');
 assert.equal(r.status,401);
});
test('unsupported mutation method is not accepted',async()=>{
 const r=await call('/v1/founder/access','PATCH');assert.equal(r.status,405);
});
