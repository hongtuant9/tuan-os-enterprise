import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDatabaseTarget,LEGACY_STAGING_REF,BIZVIORA_V2_QA_REF} from '../src/database-target-guard.mjs';
import {createApi} from '../src/api.mjs';

const legacy=()=>({
  BIZVIORA_STAGING_ACK:'STAGING_ONLY',
  BIZVIORA_STAGING_PROJECT_REF:LEGACY_STAGING_REF,
  BIZVIORA_SUPABASE_URL:`https://${LEGACY_STAGING_REF}.supabase.co`,
  BIZVIORA_SUPABASE_ANON_KEY:'publishable-test-fixture-not-a-secret',
});
const qa=()=>({
  BIZVIORA_STAGING_ACK:'STAGING_ONLY',
  BIZVIORA_STAGING_PROJECT_REF:BIZVIORA_V2_QA_REF,
  BIZVIORA_SUPABASE_URL:`https://${BIZVIORA_V2_QA_REF}.supabase.co`,
  BIZVIORA_SUPABASE_ANON_KEY:'publishable-test-fixture-not-a-secret',
  BIZVIORA_V2_QA_ACK:'BIZVIORA_V2_SYNTHETIC_READ_ONLY',
  BIZVIORA_V2_QA_MODE:'LOCAL_READ_ONLY',
  BIZVIORA_HOSTING_TARGET:'LOCAL_STAGING',
  NODE_ENV:'test'
});
test('legacy approved staging still resolves without V2 migration',()=>{
  assert.deepEqual(resolveDatabaseTarget(legacy()),{
    mode:'LEGACY_STAGING',projectRef:LEGACY_STAGING_REF,
    url:`https://${LEGACY_STAGING_REF}.supabase.co`,readOnly:false
  });
});
test('approved V2 QA requires exact URL, explicit local synthetic mode and read-only',()=>{
  const cfg=resolveDatabaseTarget(qa());
  assert.equal(cfg.mode,'V2_SYNTHETIC_QA');
  assert.equal(cfg.readOnly,true);
  assert.ok(Object.isFrozen(cfg));
});
test('no production/live customer, no arbitrary ref, no service role and no public ingress',()=>{
  const changes=[
    {BIZVIORA_STAGING_PROJECT_REF:'mmxgthzafjoienokyplw'},
    {BIZVIORA_STAGING_PROJECT_REF:'third-party-project',BIZVIORA_SUPABASE_URL:'https://third-party-project.supabase.co'},
    {BIZVIORA_SUPABASE_URL:'https://evil.invalid'},
    {BIZVIORA_SUPABASE_URL:`http://${BIZVIORA_V2_QA_REF}.supabase.co`},
    {BIZVIORA_SUPABASE_URL:`https://${BIZVIORA_V2_QA_REF}.supabase.co/other`},
    {BIZVIORA_SUPABASE_URL:`https://${BIZVIORA_V2_QA_REF}.supabase.co?token=bad`},
    {BIZVIORA_V2_QA_ACK:''},
    {BIZVIORA_V2_QA_MODE:''},
    {NODE_ENV:'production'},
    {BIZVIORA_HOSTING_TARGET:'RENDER_STAGING'},
    {BIZVIORA_RENDER_PUBLIC_STAGING_ACK:'ALLOW_STAGING_INGRESS'},
    {SUPABASE_SERVICE_ROLE_KEY:'forbidden-fixture'},
    {BIZVIORA_SUPABASE_SERVICE_ROLE_KEY:'forbidden-fixture'},
    {BIZVIORA_STAGING_ACK:''},
    {BIZVIORA_SUPABASE_ANON_KEY:''}
  ];
  for(const override of changes)
    assert.throws(()=>resolveDatabaseTarget({...qa(),...override}),undefined,
      'must deny '+Object.keys(override).join(','));
});
test('cannot accidentally mix QA acknowledgement into existing staging',()=>{
  assert.throws(()=>resolveDatabaseTarget({...legacy(),BIZVIORA_V2_QA_ACK:'BIZVIORA_V2_SYNTHETIC_READ_ONLY'}),/MIXED_DATABASE_ENV_FORBIDDEN/);
});
test('QA health explicitly discloses not customer ready; no login means 401',async()=>{
  const api=createApi({
    qaReadOnly:true,
    verifyBearer:async()=>{throw Error('AUTH_NOT_YET_MIGRATED');},
    repository:()=>{throw Error('DB_MUST_NOT_BE_QUERIED_WITHOUT_AUTH');}
  });
  const health=await api(new Request('http://qa.invalid/health'));
  assert.equal(health.status,200);
  const body=await health.json();
  assert.equal(body.scope,'V2_SYNTHETIC_QA');
  assert.equal(body.readyForCustomerData,false);
  assert.equal(body.autoSend,false);
  assert.equal(body.bookingWrite,false);
  const noToken=await api(new Request('http://qa.invalid/v1/context?tenantId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  assert.equal(noToken.status,401);
});
test('V2 QA rejects POST before Auth/DB access, including attempted mutations',async()=>{
  let authCalls=0,dbCalls=0;
  const api=createApi({
    qaReadOnly:true,
    verifyBearer:async()=>{authCalls++;return{id:'11111111-1111-4111-8111-111111111111'};},
    repository:()=>{dbCalls++;return{};}
  });
  for(const path of ['/v1/tasks','/v1/approvals','/v1/company-applications','/v1/tenant-settings']) {
    const response=await api(new Request('http://qa.invalid'+path,{
      method:'POST',
      headers:{Authorization:'Bearer fixture-test-token-0123456789'},
      body:JSON.stringify({tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
    }));
    assert.equal(response.status,405,'failed path '+path);
    assert.equal((await response.json()).error,'V2_QA_WRITE_DISABLED');
  }
  assert.equal(authCalls,0);
  assert.equal(dbCalls,0);
});
