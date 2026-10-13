/** Live read-only Founder auth gate: manual staging only, no credentials in logs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingFounderGate} from '../src/founder-adapter.mjs';
import {ApiError} from '../src/access.mjs';

const env=process.env;
if(env.BIZVIORA_STAGING_FOUNDER_E2E_ACK!=='RUN_ON_ISOLATED_STAGING')
  throw Error('EXPLICIT_STAGING_E2E_ACK_REQUIRED');
if(env.BIZVIORA_STAGING_ACK!=='STAGING_ONLY' ||
   env.BIZVIORA_STAGING_PROJECT_REF!=='oxakhhpyvvymujiwuvnm' ||
   env.BIZVIORA_SUPABASE_URL!=='https://oxakhhpyvvymujiwuvnm.supabase.co')
  throw Error('STAGING_PROJECT_IDENTITY_REJECTED');
if(!env.BIZVIORA_SUPABASE_ANON_KEY ||
   !env.BIZVIORA_TEST_JWT_PLATFORM_MANAGER ||
   !env.BIZVIORA_TEST_JWT_NON_MANAGER ||
   env.BIZVIORA_TEST_JWT_PLATFORM_MANAGER===env.BIZVIORA_TEST_JWT_NON_MANAGER)
  throw Error('INCOMPLETE_STAGING_AUTH_FIXTURE');

const gate=createStagingFounderGate(env);
test('Staging JWT Platform Manager is explicitly permitted',async()=>{
  const result=await gate(env.BIZVIORA_TEST_JWT_PLATFORM_MANAGER);
  assert.equal(result.platformManager,true);
  assert.match(result.userId,/^[0-9a-f-]{36}$/);
});
test('Staging JWT non-manager cannot access Founder gate',async()=>{
  await assert.rejects(
    gate(env.BIZVIORA_TEST_JWT_NON_MANAGER),
    err=>err instanceof ApiError && err.status===403 && err.code==='FOUNDER_ACCESS_DENIED'
  );
});
