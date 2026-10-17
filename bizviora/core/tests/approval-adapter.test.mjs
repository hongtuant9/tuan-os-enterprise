// Contract tests execute the actual adapter with an in-memory SDK boundary.
// These do not replace signed JWT/PostgREST/RLS/Audit integration tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/supabase-adapter.mjs',import.meta.url),'utf8');
const access=new URL('../src/access.mjs',import.meta.url).href;
const targetGuard=new URL('../src/database-target-guard.mjs',import.meta.url).href;
const env={BIZVIORA_STAGING_ACK:'STAGING_ONLY',BIZVIORA_STAGING_PROJECT_REF:'oxakhhpyvvymujiwuvnm',BIZVIORA_SUPABASE_URL:'https://oxakhhpyvvymujiwuvnm.supabase.co',BIZVIORA_SUPABASE_ANON_KEY:'synthetic-publishable-key'};
const actor={tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',role:'owner'};
const approvalId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let sequence=0;
async function fixture(results){
 const traces=[];const key='bv-adapter-test-'+sequence++;
 globalThis[key]=()=>({from(table){const trace={table,steps:[]};traces.push(trace);const builder={};for(const name of ['select','eq','insert','update','order','limit'])builder[name]=(...args)=>{trace.steps.push([name,...args]);return builder};for(const name of ['single','maybeSingle'])builder[name]=async()=>{trace.steps.push([name]);return results.shift()};return builder}});
 const code=source.replace("import { createClient } from '@supabase/supabase-js';",'const createClient=globalThis['+JSON.stringify(key)+'];').replace("'./access.mjs'",JSON.stringify(access))
  .replace("'./database-target-guard.mjs'",JSON.stringify(targetGuard));
 const module=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// '+key).toString('base64'));
 delete globalThis[key];return {repo:module.createSupabaseDependencies(env).repository('synthetic-token'),traces};
}
test('adapter rejects task outside visible tenant before inserting approval',async()=>{const f=await fixture([{data:null,error:null}]);await assert.rejects(f.repo.requestApproval(actor,{taskId:approvalId}),e=>e.status===404);assert.equal(f.traces.length,1);assert.deepEqual(f.traces[0].steps.filter(x=>x[0]==='eq'),[['eq','id',approvalId],['eq','tenant_id',actor.tenantId]])});
test('adapter sets requester and pending status from trusted actor',async()=>{const f=await fixture([{data:{id:approvalId},error:null}]);await f.repo.requestApproval(actor,{taskId:null});assert.deepEqual(f.traces[0].steps.find(x=>x[0]==='insert')[1],{tenant_id:actor.tenantId,task_id:null,requested_by:actor.userId,status:'PENDING'})});
for(const decision of ['APPROVED','REJECTED'])test('adapter decision '+decision+' constrains id tenant and pending',async()=>{const f=await fixture([{data:{id:approvalId,status:decision},error:null}]);const data=await f.repo.decideApproval(actor,{approvalId,decision});assert.equal(data.status,decision);assert.deepEqual(f.traces[0].steps.filter(x=>x[0]==='eq'),[['eq','id',approvalId],['eq','tenant_id',actor.tenantId],['eq','status','PENDING']]);assert.deepEqual(f.traces[0].steps.find(x=>x[0]==='update')[1],{status:decision})});
test('empty conditional update returns 409 for repeated or hidden decision',async()=>{const f=await fixture([{data:null,error:null}]);await assert.rejects(f.repo.decideApproval(actor,{approvalId,decision:'APPROVED'}),e=>e.status===409&&e.code==='APPROVAL_NOT_PENDING')});
test('database denial returns safe 403 without SQL details',async()=>{const f=await fixture([{data:null,error:{message:'sensitive database details'}}]);await assert.rejects(f.repo.decideApproval(actor,{approvalId,decision:'APPROVED'}),e=>e.status===403&&e.code==='APPROVAL_DECISION_DENIED'&&!e.message.includes('sensitive'))});
