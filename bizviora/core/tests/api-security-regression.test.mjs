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

test('malformed tenant UUID is rejected before membership query',async()=>{
 const api=makeApi();const r=await api(req('/v1/tasks?tenantId=invalid',{authorization:'Bearer '+token}));
 assert.equal(r.status,400);assert.equal(calls.membership,0);assert.equal(calls.read,0);
});
test('malformed POST JSON never writes a task',async()=>{
 const api=makeApi();
 const r=await api(new Request(url('/v1/tasks'),{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{"tenantId":'
 }));
 assert.equal(r.status,400);assert.equal(calls.create,0);
});
test('oversized POST payload cannot create a task',async()=>{
 const api=makeApi();
 const r=await api(req('/v1/tasks',{method:'POST',authorization:'Bearer '+token,
  body:{tenantId:tenant,title:'x'.repeat(17000)}
 }));
 assert.equal(r.status,413);assert.equal(calls.create,0);
});
test('unrecognized API route does not expose tenant data',async()=>{
 const api=makeApi();
 const r=await api(req('/v1/private-finance?tenantId='+tenant,{authorization:'Bearer '+token}));
 assert.equal(r.status,405);assert.equal(calls.read,0);
});

test('Founder endpoint rejects absent gate, even for authenticated tenant owner',async()=>{
 const api=makeApi('owner');
 const r=await api(req('/v1/founder/access',{authorization:'Bearer '+token}));
 assert.equal(r.status,503);assert.equal(calls.read,0);
});
test('Founder endpoint cannot be opened without verified bearer',async()=>{
 const api=createApi({verifyBearer:async()=>null,repository:()=>({}),
  requireFounder:async()=>({userId:user,platformManager:true})});
 const r=await api(req('/v1/founder/access',{authorization:'Bearer '+token}));
 assert.equal(r.status,401);
});
test('Founder endpoint denies different user or unverified RPC',async()=>{
 for(const actor of [{userId:other,platformManager:true},{userId:user,platformManager:false},null]){
   const api=createApi({verifyBearer:async()=>({id:user}),repository:()=>({}),requireFounder:async()=>actor});
   const r=await api(req('/v1/founder/access',{authorization:'Bearer '+token}));
   assert.equal(r.status,403);
 }
});
test('Founder access response contains only staging scope and permission flag',async()=>{
 const api=createApi({verifyBearer:async()=>({id:user}),repository:()=>({}),
  requireFounder:async()=>({userId:user,platformManager:true})});
 const r=await api(req('/v1/founder/access',{authorization:'Bearer '+token}));
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{platformManager:true,scope:'STAGING_ONLY'});
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('Founder endpoint cannot mutate permissions via POST',async()=>{
 const api=createApi({verifyBearer:async()=>({id:user}),repository:()=>({}),
  requireFounder:async()=>({userId:user,platformManager:true})});
 const r=await api(req('/v1/founder/access',{method:'POST',authorization:'Bearer '+token,
  body:{tenantId:tenant,platformManager:true}}));
 assert.equal(r.status,405);
});

test('Founder gate receives the server-verified user and does not verify the JWT twice',async()=>{
 let verified=0; let received;
 const api=createApi({verifyBearer:async()=>{verified++;return {id:user}},repository:()=>({}),
  requireFounder:async(t,serverVerifiedUser)=>{received=serverVerifiedUser;return {userId:user,platformManager:true}}});
 const r=await api(req('/v1/founder/access',{authorization:'Bearer '+token}));
 assert.equal(r.status,200);
 assert.equal(verified,1);
 assert.deepEqual(received,{id:user});
});
