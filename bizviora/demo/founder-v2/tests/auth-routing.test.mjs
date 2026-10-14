import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const read=rel=>readFile(new URL(rel,base),'utf8');
const root=new URL('../founder/',base);
const canonical=rel=>readFile(new URL(rel,root),'utf8');
test('branded founder is complete V2.5 shell and has no redirect to onrender',async()=>{
 const s=await canonical('index.html');
 assert.match(s,/Founder Control Center/);
 assert.match(s,/id="bv-founder-demo-source"/);
 assert.match(s,/src="\/founder-v2\/auth.js"/);
 assert.match(s,/src="\/founder-v2\/ai-workforce.js"/);
 assert.doesNotMatch(s,/http-equiv="refresh"/);
 assert.doesNotMatch(s,/location\.replace\('https:\/\/bizviora-synthetic-demo/);
});
test('Google button available and canonical OAuth callback required only on branded hostname',async()=>{
 const s=await read('auth.js');
 assert.match(s,/id="bv-founder-google"/);
 assert.match(s,/addEventListener\('click'/);
 assert.match(s,/signInWithOAuth/);
 assert.match(s,/provider:'google'/);
 assert.match(s,/GOOGLE_CALLBACK='https:\/\/bizviora.com\/founder\/'/);
 assert.match(s,/location\.hostname==='bizviora.com'/);
 assert.match(s,/mountFounderOps\(client\)/);
 assert.match(s,/\/v1\/founder\/access/);
});
test('Founder has a same-page Forgot Password request using exact recovery redirect',async()=>{
 const s=await read('auth.js');
 assert.match(s,/id="bv-founder-forgot"/);
 assert.match(s,/id="bv-founder-recovery"/);
 assert.match(s,/resetPasswordForEmail/);
 assert.match(s,/RECOVERY_CALLBACK='https:\/\/bizviora.com\/founder\/reset-password\/'/);
});
test('Founder recovery page exists and fails closed on invalid links',async()=>{
 const h=await canonical('reset-password/index.html');
 const js=await canonical('reset-password/reset.js');
 assert.match(h,/id="reset-form" hidden/);
 assert.match(js,/if\(error\|\|\(!isImplicit&&!isOtp&&!isCode\)\)/);
 assert.match(js,/type:'recovery',token_hash:tokenHash/);
 assert.match(js,/auth\.getUser\(\)/);
 assert.match(js,/auth\.updateUser\(\{password\}\)/);
 assert.match(js,/auth\.signOut\(\{scope:'global'\}\)/);
 assert.match(js,/auth\.signOut\(\{scope:'local'\}\)/);
 assert.match(js,/history\.replaceState/);
 assert.doesNotMatch(js,/auth\.getSession\(\)/);
});
test('account navigation opens /founder/ rather than the legacy technical path',async()=>{
 const s=await read('../account/app.js');
 assert.match(s,/location\.assign\('\/founder\/'\)/);
 assert.doesNotMatch(s,/location\.assign\('\/founder-v2\/'\)/);
});
