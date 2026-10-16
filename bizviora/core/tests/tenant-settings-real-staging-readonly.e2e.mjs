/**
 * Read-only real Supabase Auth staging HTTP E2E for /v1/tenant-settings.
 * Manual execution only, never print tokens/PII. No database writes.
 * Requires staging QA bearer tokens via secure environment, not chat or repo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseDependencies} from '../src/supabase-adapter.mjs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createApi} from '../src/api.mjs';
const e=process.env;
if(e.BIZVIORA_STAGING_E2E_ACK!=='RUN_ON_ISOLATED_STAGING'||e.BIZVIORA_STAGING_ACK!=='STAGING_ONLY')throw Error('STAGING_ACK_REQUIRED');
if(e.BIZVIORA_STAGING_PROJECT_REF!=='oxakhhpyvvymujiwuvnm')throw Error('STAGING_REF_REQUIRED');
if(new URL(e.BIZVIORA_SUPABASE_URL||'https://invalid.local').hostname!=='oxakhhpyvvymujiwuvnm.supabase.co')throw Error('STAGING_URL_REQUIRED');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const a=e.BIZVIORA_TEST_TENANT_A,b=e.BIZVIORA_TEST_TENANT_B;
if(!uuid.test(a||'')||!uuid.test(b||'')||a===b)throw Error('TWO_TENANT_IDS_REQUIRED');
const tokens=[e.BIZVIORA_TEST_JWT_OWNER_A,e.BIZVIORA_TEST_JWT_OWNER_B];
if(tokens.some(t=>!t||t.length<50)||tokens[0]===tokens[1])throw Error('TWO_REAL_JWT_REQUIRED');
if(!e.BIZVIORA_SUPABASE_ANON_KEY)throw Error('STAGING_PUBLISHABLE_KEY_REQUIRED');
const dependencies=createSupabaseDependencies(e);
const api=createApi(dependencies);
const server=createServer(async(req,res)=>{
 try {
  const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers});
  const response=await api(request);
  res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
  res.end(await response.text());
 }catch {res.writeHead(500);res.end('INTERNAL_ERROR');}
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
const call=async(token,tenantId)=>{
 const response=await fetch(base+'/v1/tenant-settings?tenantId='+tenantId,{
  headers:token?{Authorization:'Bearer '+token}:{},redirect:'error'
 });
 return {status:response.status,data:await response.json()};
};
process.on('exit',()=>server.close());
test('real Supabase Auth owner A reads only own tenant',async()=>{
 const result=await call(tokens[0],a);
 assert.equal(result.status,200);
 assert.equal(result.data.tenantId,a);
 assert.equal(result.data.profile.id,a);
 assert.equal(result.data.source,'BIZVIORA_CORE_VERIFIED_CONTEXT');
 assert.equal(result.data.status,'READ_ONLY_QA');
 assert.equal(result.data.sections.knowledge.status,'NOT_CONFIGURED');
});
test('real Supabase Auth owner B cannot read tenant A',async()=>{
 assert.equal((await call(tokens[1],a)).status,403);
});
test('real Supabase Auth owner A cannot read tenant B',async()=>{
 assert.equal((await call(tokens[0],b)).status,403);
});
test('no token returns 401',async()=>{
 assert.equal((await call(null,a)).status,401);
});
test('malformed token returns 401',async()=>{
 assert.equal((await call('not-a-real-jwt',a)).status,401);
});

test.after(()=>server.close());
