import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const dir = new URL('.', import.meta.url);
const runner = fileURLToPath(new URL('founder-ovh-jwt.e2e.mjs', dir));
const watchdog = fileURLToPath(new URL('founder-qa-watchdog.sh', dir));
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
    assert.equal(r.status,1,target);
    assert.match(r.stderr,/FAIL FOUNDER_QA_RUNNER_ABORTED/);
    assert.doesNotMatch(r.stderr,/MODULE_NOT_FOUND/);
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
