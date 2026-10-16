import test from 'node:test';
import assert from 'node:assert/strict';
import {loadVerifiedSettings,SettingsGateError} from './settings-live-gate.mjs';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const valid={tenantId:A,source:'BIZVIORA_CORE_VERIFIED_CONTEXT',status:'READ_ONLY_QA',
 membership:{verified:true,role:'owner'},profile:{id:A,name:'Real tenant'},
 businessUnits:[{id:U,name:'Unit'}],properties:[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',businessUnitId:U,name:'Property'}],
 sections:{knowledge:{status:'NOT_CONFIGURED'}},capabilities:{profileWrite:false,propertyWrite:false}};
const options=(body=valid,status=200)=>({apiOrigin:'https://staging.example.invalid',tenantId:A,
 getAccessToken:async()=> 'signed-test-token',
 fetchImpl:async(url,init)=>{assert.equal(new URL(url).searchParams.get('tenantId'),A);
 assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');
 return {status,ok:status>=200&&status<300,json:async()=>body};}});
test('valid live API contract accepted',async()=>assert.equal((await loadVerifiedSettings(options())).profile.name,'Real tenant'));
test('no token denied',async()=>assert.rejects(()=>loadVerifiedSettings({...options(),getAccessToken:async()=>null}),/AUTH_REQUIRED/));
test('foreign tenant response denied',async()=>assert.rejects(()=>loadVerifiedSettings(options({...valid,tenantId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'})),/SETTINGS_SCOPE_OR_SOURCE_INVALID/));
test('synthetic source rejected',async()=>assert.rejects(()=>loadVerifiedSettings(options({...valid,source:'SYNTHETIC'})),/SETTINGS_SCOPE_OR_SOURCE_INVALID/));
test('unauthorized 401 denied',async()=>assert.rejects(()=>loadVerifiedSettings(options(valid,401)),/AUTH_REQUIRED/));
test('forbidden 403 denied',async()=>assert.rejects(()=>loadVerifiedSettings(options(valid,403)),/TENANT_ACCESS_DENIED/));
test('unavailable API no fallback',async()=>assert.rejects(()=>loadVerifiedSettings({...options(),fetchImpl:async()=>{throw Error('offline');}}),/SETTINGS_API_UNAVAILABLE/));
test('invalid property scope denied',async()=>assert.rejects(()=>loadVerifiedSettings(options({...valid,properties:[{id:'x',businessUnitId:'other'}]})),/SETTINGS_SCOPE_OR_SOURCE_INVALID/));
