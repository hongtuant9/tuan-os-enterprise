/** Read-only, signed JWT staging preflight for Founder registration routes.
 * Never mutates existing applicants. No tokens or personal data in logs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
import {createSupabaseDependencies} from '../src/supabase-adapter.mjs';
import {createStagingFounderGate} from '../src/founder-adapter.mjs';

const env=process.env;
if(env.BIZVIORA_STAGING_FOUNDER_E2E_ACK!=='RUN_ON_ISOLATED_STAGING' ||
   env.BIZVIORA_STAGING_ACK!=='STAGING_ONLY' ||
   env.BIZVIORA_STAGING_PROJECT_REF!=='oxakhhpyvvymujiwuvnm' ||
   env.BIZVIORA_SUPABASE_URL!=='https://oxakhhpyvvymujiwuvnm.supabase.co')
  throw Error('ISOLATED_STAGING_ACK_REQUIRED');
const founder=env.BIZVIORA_TEST_JWT_PLATFORM_MANAGER;
const other=env.BIZVIORA_TEST_JWT_NON_MANAGER;
if(!env.BIZVIORA_SUPABASE_ANON_KEY || !founder || !other || founder===other ||
   founder.length<50 || other.length<50)
  throw Error('STAGING_AUTH_FIXTURE_MISSING');
const api=createApi({...createSupabaseDependencies(env),requireFounder:createStagingFounderGate(env)});
async function call(path,token,method='GET'){
  const response=await api(new Request('http://qa.invalid'+path,{
    method,headers:{Authorization:'Bearer '+token}
  }));
  const body=await response.json();
  return {status:response.status,body};
}
test('signed Founder JWT opens read-only registrations list',async()=>{
  const r=await call('/v1/founder/registrations',founder);
  assert.equal(r.status,200);
  assert.ok(Array.isArray(r.body.data));
  assert.ok(r.body.data.every(x=>['PENDING','APPROVED','REJECTED'].includes(x.status)));
});
test('signed non-manager cannot list applications',async()=>{
  const r=await call('/v1/founder/registrations',other);
  assert.equal(r.status,403);
});
test('signed non-manager cannot reach review endpoint',async()=>{
  const r=await call('/v1/founder/registrations/review',other);
  assert.equal(r.status,403);
});
test('no signed token denies application list',async()=>{
  const response=await api(new Request('http://qa.invalid/v1/founder/registrations'));
  assert.equal(response.status,401);
});
