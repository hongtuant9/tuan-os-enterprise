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
 assert.ok(code.includes('isolatedRecoveryClient()'));
 assert.ok(code.includes("fragment.get('type')"));
 assert.ok(code.includes("type:'recovery',token_hash:tokenHash"));
 assert.ok(code.includes('client.auth.setSession('));
 assert.ok(code.includes('client.auth.exchangeCodeForSession(code)'));
 assert.ok(code.includes('history.replaceState'));
 assert.ok(!code.includes('client.auth.getSession()'));
 assert.ok(code.includes('client.auth.getUser()'));
 assert.ok(code.includes('client.auth.updateUser({password})'));
});

test('Google registration requires application and does not grant a tenant',async()=>{
 const html=await read('login/index.html');
 const login=await read('login/login.js');
 const register=await read('register/register.js');
 const registrationUi=await read('register/index.html');
 assert.ok(html.includes('id="google-register"'));
 assert.ok(login.includes("sessionStorage.setItem('bv-customer-google-register','1')"));
 assert.ok(login.includes("location.replace('/register/')"));
 assert.ok(registrationUi.includes('id="application"'));
 assert.ok(register.includes("status:'PENDING'"));
 assert.ok(register.includes("from('bv_registration_requests')"));
 assert.ok(register.includes("from('bv_service_plans')"));
 assert.ok(register.includes("auth.getUser()"));
 assert.ok(!register.includes("from('bv_memberships').insert"));
});
test('password recovery client does not reuse existing logged-in user session',async()=>{
 const shared=await read('auth-client.js');
 assert.ok(shared.includes('isolatedRecoveryClient'));
 assert.ok(shared.includes('persistSession:false'));
 assert.ok(shared.includes('detectSessionInUrl:false'));
});
