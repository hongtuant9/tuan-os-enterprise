import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const dir = new URL('.', import.meta.url);
const runner = new URL('founder-ovh-jwt.e2e.mjs', dir).pathname;
const watchdog = new URL('founder-qa-watchdog.sh', dir).pathname;
function run(base) {
  return spawnSync(process.execPath,[runner,'preflight'],{
    env:{PATH:process.env.PATH,BIZV_QA_API_BASE:base,
      BIZV_QA_FOUNDER_JWT:'',BIZV_QA_APPLICANT_A_JWT:'',BIZV_QA_APPLICANT_B_JWT:''},
    encoding:'utf8',timeout:4000
  });
}
test('remote HTTP targets fail closed before any fetch',()=>{
  for (const target of ['http://example.com:18104','http://127.0.0.1:8080',
    'https://127.0.0.1:18104','http://192.0.2.5:18104']) {
    const r=run(target);
    assert.notEqual(r.status,0,target);
    assert.doesNotMatch(r.stdout,/QA_RUN_ID|SYNTHETIC_APPLICATIONS_ONLY/);
  }
});
test('watchdog source requires explicit arm and never creates Founder privileges',()=>{
  const s=readFileSync(watchdog,'utf8');
  assert.match(s,/case "\$\{1:-\}"/);
  assert.match(s,/arm\)/);
  assert.match(s,/GRANTS_NOT_ZERO/);
  assert.match(s,/DELETE FROM bv_platform_managers WHERE user_id/);
  assert.doesNotMatch(s,/INSERT INTO bv_platform_managers|UPDATE bv_platform_managers SET/);
});
