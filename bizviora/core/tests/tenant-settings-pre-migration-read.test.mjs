import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/supabase-adapter.mjs',import.meta.url),'utf8');
test('Settings read does not require settings_version before migration 005',()=>{
 assert.match(source,/db\.from\('bv_tenants'\)\.select\('id,name,slug'\)/);
 assert.doesNotMatch(source,/db\.from\('bv_tenants'\)\.select\('id,name,slug,settings_version'\)/);
 assert.match(source,/APPROVED_STAGING_PROJECT_REF/);
 assert.match(source,/STAGING_REF_MISMATCH/);
});
