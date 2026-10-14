import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectControlHandler,SHEET_ID} from './handler.mjs';
const rows=Array.from({length:19},(_,i)=>{const r=Array(26).fill('');r[0]=`TASK-BIZ-ROADMAP-20261013-${String(i+1).padStart(2,'0')}`;r[9]=i===0?'PASS':i<6?'IN_PROGRESS':i<15?'NOT_STARTED':'BLOCKED';r[20]='M'+Math.min(6,Math.floor(i/3));return r});
const url='https://staging.example/v1/founder/project-control';
const req=(token,method='GET')=>new Request(url,{method,headers:token?{authorization:'Bearer '+token}:{}});
const id='synthetic-user-id';
function setup({allow=true,read=async()=>rows,verify=async()=>({id})}={}){
 const events=[];const handler=createProjectControlHandler({verifyUser:async t=>{events.push('jwt');return verify(t)},verifyPlatformManager:async()=>{events.push('role');return allow},readSheet:async p=>{events.push('sheet');assert.equal(p.spreadsheetId,SHEET_ID);return read(p)}});return {events,handler};
}
test('anonymous denied without reads',async()=>{const s=setup();assert.equal((await s.handler(req())).status,401);assert.deepEqual(s.events,[])});
test('invalid token denied without reads',async()=>{const s=setup({verify:async()=>{throw Error('bad')}});assert.equal((await s.handler(req('invalid.token.data'))).status,401);assert.deepEqual(s.events,['jwt'])});
test('non-manager denied before sheet',async()=>{const s=setup({allow:false});assert.equal((await s.handler(req('valid.token.data'))).status,403);assert.deepEqual(s.events,['jwt','role'])});
test('authorized reads 19 tasks',async()=>{const s=setup();const response=await s.handler(req('valid.token.data'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.total,19);assert.deepEqual(s.events,['jwt','role','sheet']);assert.equal(response.headers.get('cache-control'),'no-store')});
test('source failure closes access',async()=>{const s=setup({read:async()=>{throw Error('private detail')}});const response=await s.handler(req('valid.token.data'));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'SOURCE_UNAVAILABLE'})});
test('malformed task list closes access',async()=>{const s=setup({read:async()=>rows.slice(0,2)});assert.equal((await s.handler(req('valid.token.data'))).status,503)});
test('fresh Sheets data used on each request',async()=>{let n=0;const s=setup({read:async()=>{n++;return rows.map((r,i)=>i===1?Object.assign([...r],{9:n===1?'IN_PROGRESS':'PASS'}):r)}});const a=await (await s.handler(req('valid.token.data'))).json();const b=await (await s.handler(req('valid.token.data'))).json();assert.equal(a.counts.PASS,1);assert.equal(b.counts.PASS,2);assert.equal(n,2)});
test('writes not allowed',async()=>{const s=setup();assert.equal((await s.handler(req('valid.token.data','POST'))).status,405);assert.deepEqual(s.events,[])});
