import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
test('Google and reset UI have same-origin callbacks',async()=>{
 const html=await read('login/index.html');
 const code=await read('login/login.js');
 assert.ok(html.includes('id="google-login"'));
 assert.ok(html.includes('id="reset-request-form"'));
 assert.ok(code.includes("provider:'google'"));
 assert.ok(code.includes("redirectTo:location.origin+'/login/'"));
 assert.ok(code.includes("redirectTo:location.origin+'/reset-password/'"));
});
test('Reset has clear fallback and session verification',async()=>{
 const html=await read('reset-password/index.html');
 const code=await read('reset-password/reset.js');
 assert.ok(html.includes('id="reset-form"'));
 assert.ok(code.includes('hasRecoveryMarker'));
 assert.ok(code.includes('client.auth.getSession()'));
 assert.ok(code.includes('client.auth.getUser()'));
 assert.ok(code.includes('client.auth.updateUser({password})'));
});
