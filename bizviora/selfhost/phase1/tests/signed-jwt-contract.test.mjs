// Exercise the exact server verifier without importing its DB/socket startup.
// This is signed JWT -> Core Request/Response with synthetic authorization state,
// NOT Keycloak/HTTP/PostgreSQL E2E. No network and no persistent key material.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {generateKeyPair,SignJWT,jwtVerify} from 'jose';
import {createApi} from '../../../core/src/api.mjs';
import {ApiError,requireUuid} from '../../../core/src/access.mjs';
const source=readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function verifyBearer(token){');
const end=source.indexOf('\nconst api=',start);
assert.ok(start>=0&&end>start,'Verifier boundary changed: update harness explicitly');
const issuer='http://127.0.0.1:18093/realms/bizviora-phase1';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const other=await generateKeyPair('RS256');
const logs=[];
const verifier=vm.runInNewContext('('+source.slice(start,end)+')',{
 jwtVerify,keySet:publicKey,issuer,ApiError,requireUuid,console:{info:(...x)=>logs.push(x.join(' ')),warn:(...x)=>logs.push(x.join(' '))}
});
const ids={founder:'11111111-1111-4111-8111-111111111111',a:'22222222-2222-4222-8222-222222222222',b:'33333333-3333-4333-8333-333333333333',staff:'44444444-4444-4444-8444-444444444444'};
let grant=true,gateCalls=0;
const api=createApi({verifyBearer:verifier,repository:()=>{throw Error('Repository not expected')},requireFounder:async(_t,u)=>{gateCalls++;return {userId:u.id,platformManager:grant&&u.id===ids.founder}}});
async function token(sub=ids.founder,claims={},key=privateKey){
 const now=Math.floor(Date.now()/1000);
 return new SignJWT({iss:issuer,sub,aud:'bizviora-phase1-qa',azp:'bizviora-phase1-qa',typ:'Bearer',iat:now,exp:now+300,...claims}).setProtectedHeader({alg:'RS256'}).sign(key);
}
async function access(t){return api(new Request('http://synthetic.invalid/v1/founder/access',{headers:t?{authorization:'Bearer '+t}:{}}))}
for(const [role,id] of Object.entries(ids))test('signed '+role+' Founder access',async()=>{
 grant=true;assert.equal((await access(await token(id))).status,role==='founder'?200:403);
});
for(const [label,claims,key] of [
 ['wrong issuer',{iss:'https://invalid.example'}],
 ['expired',{iat:Math.floor(Date.now()/1000)-400,exp:Math.floor(Date.now()/1000)-1}],
 ['wrong client',{azp:'untrusted-client'}],['missing expiry',{exp:undefined}],
 ['long lifetime',{exp:Math.floor(Date.now()/1000)+3600}],['bad signature',{},other.privateKey]
])test('reject '+label+' before authorization',async()=>{
 const before=gateCalls,t=await token(ids.founder,claims,key);
 const r=await access(t);assert.equal(r.status,401);assert.equal(gateCalls,before);
 assert.ok(!JSON.stringify(logs).includes(t));assert.ok(!(await r.text()).includes(t));
});
test('missing token rejected before authorization',async()=>{const before=gateCalls;assert.equal((await access()).status,401);assert.equal(gateCalls,before)});
test('same signed token denied immediately after synthetic grant revocation',async()=>{
 const t=await token();grant=true;assert.equal((await access(t)).status,200);
 grant=false;assert.equal((await access(t)).status,403);grant=true;
});
// Intentionally red until verifier + agreed Keycloak API audience are corrected.
test('wrong audience must be denied',async()=>{
 assert.equal((await access(await token(ids.founder,{aud:'unrelated-service'}))).status,401);
});
