import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.mjs';
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const token='synthetic.jwt.value0000000';
let calls;
function makeApi(role='owner'){
 calls={membership:0,create:0,read:0};
 return createApi({
  verifyBearer:async t=>t===token?{id:user}:null,
  repository:()=>({
   membership:async ({tenantId})=>{calls.membership++;return tenantId===tenant?{tenant_id:tenant,user_id:user,role}:null},
   context:async ()=>({tenant:{id:tenant},businessUnits:[],properties:[]}),
   tasks:async ()=>{calls.read++;return []},
   approvals:async ()=>[],
   createTask:async ()=>{calls.create++;return {id:'synthetic'}}
  })
 });
}
const url=(path)=>'http://127.0.0.1:4317'+path;
const req=(path,{method='GET',body,authorization}={})=>new Request(url(path),{method,headers:{...(authorization?{Authorization:authorization}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
test('anonymous request denied without repository call',async()=>{
 const api=makeApi();const r=await api(req('/v1/tasks?tenantId='+tenant));
 assert.equal(r.status,401);assert.equal(calls.membership,0);
});
test('invalid bearer denied',async()=>{
 const api=makeApi();const r=await api(req('/v1/tasks?tenantId='+tenant,{authorization:'Bearer '+token+'invalid'}));
 assert.equal(r.status,401);assert.equal(calls.membership,0);
});
test('foreign tenant denied before read',async()=>{
 const api=makeApi();const r=await api(req('/v1/tasks?tenantId='+other,{authorization:'Bearer '+token}));
 assert.equal(r.status,403);assert.equal(calls.read,0);
});
test('staff cannot POST task',async()=>{
 const api=makeApi('staff');const r=await api(req('/v1/tasks',{method:'POST',authorization:'Bearer '+token,body:{tenantId:tenant,title:'Synthetic'}}));
 assert.equal(r.status,403);assert.equal(calls.create,0);
});
test('approval mutation remains disabled',async()=>{
 const api=makeApi();const r=await api(req('/v1/approvals',{method:'POST',authorization:'Bearer '+token,body:{tenantId:tenant,status:'APPROVED'}}));
 assert.equal(r.status,405);assert.equal(calls.create,0);
});
test('health response never enables outbound or booking writes',async()=>{
 const api=makeApi();const r=await api(req('/health'));const body=await r.json();
 assert.equal(r.status,200);assert.equal(body.autoSend,false);assert.equal(body.bookingWrite,false);
});
test('authorized task read is tenant scoped',async()=>{
 const api=makeApi();const r=await api(req('/v1/tasks?tenantId='+tenant,{authorization:'Bearer '+token}));
 assert.equal(r.status,200);assert.equal((await r.json()).tenantId,tenant);assert.equal(calls.read,1);
});
