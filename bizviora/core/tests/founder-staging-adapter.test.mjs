import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderStagingAdapter,FounderContextError} from '../integration/founder-staging-adapter.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const jwt='header.validsignature.payload';
const payload=(role='owner',tenantId=A)=>({tenant:{id:tenantId,name:'Doanh nghiệp kiểm thử A',slug:'staging-a'},
  role,businessUnits:[{id:A,name:'Chi nhánh A'}],properties:[{id:B,business_unit_id:A,name:'Cơ sở A'}]});
const mock=(status=200,body=payload(),calls=[])=>async(url,opts)=>{calls.push({url,opts});return {status,ok:status>=200&&status<300,json:async()=>body};};
const client=(status=200,body=payload(),calls=[])=>createFounderStagingAdapter({getAccessToken:async()=>jwt,fetchImpl:mock(status,body,calls)});
const fails=async(p,code)=>assert.rejects(p,e=>e instanceof FounderContextError&&e.code===code);

test('01: verified tenant context maps Enterprise > Unit > Property from server only',async()=>{
  const calls=[];const result=await client(200,payload(),calls).loadEnterprise({tenantId:A});
  assert.equal(result.source,'VERIFIED_STAGING_CONTEXT');
  assert.equal(result.role,'owner');assert.equal(result.businessUnits.length,1);
  assert.equal(result.properties[0].businessUnitId,A);
  assert.equal(calls[0].opts.headers.Authorization,'Bearer '+jwt);
  assert.equal(calls[0].opts.cache,'no-store');assert.equal(calls[0].opts.credentials,'omit');
  assert.equal(calls[0].url,'http://127.0.0.1:4317/v1/context?tenantId='+A);
});
test('02: admin/manager can create tasks but no approval/payment/send',async()=>{
 for(const role of ['admin','manager','owner']){
  const r=await client(200,payload(role)).loadEnterprise({tenantId:A});
  assert.equal(r.permissions.canCreateTask,true);
  assert.equal(r.permissions.canApprove,false);assert.equal(r.permissions.canProcessPayments,false);
  assert.equal(r.permissions.canSendMessages,false);assert.equal(r.permissions.canEditBookings,false);
  assert.equal(r.permissions.canViewOwnerPrivateFinance,false);
 }
});
test('03: staff role cannot create task',async()=>{
 const r=await client(200,payload('staff')).loadEnterprise({tenantId:A});
 assert.equal(r.permissions.canCreateTask,false);
});
test('04: forged tenant B payload never accepted as A',async()=>{
 await fails(client(200,payload('owner',B)).loadEnterprise({tenantId:A}),'TENANT_CONTEXT_MISMATCH');
});
test('05: absent JWT fails closed before any request',async()=>{
 const calls=[];
 const c=createFounderStagingAdapter({getAccessToken:async()=>null,fetchImpl:mock(200,payload(),calls)});
 await fails(c.loadEnterprise({tenantId:A}),'AUTH_REQUIRED');assert.equal(calls.length,0);
});
test('06: 401 and 403 do not switch to DEMO data',async()=>{
 await fails(client(401).loadEnterprise({tenantId:A}),'AUTH_REQUIRED');
 await fails(client(403).loadEnterprise({tenantId:A}),'TENANT_ACCESS_DENIED');
});
test('07: network error fails closed, no leakage of token',async()=>{
 const c=createFounderStagingAdapter({getAccessToken:async()=>jwt,fetchImpl:async()=>{throw Error('Bearer '+jwt);}});
 await fails(c.loadEnterprise({tenantId:A}),'STAGING_BACKEND_UNAVAILABLE');
});
test('08: malformed payload and missing arrays rejected',async()=>{
 await fails(client(200,{tenant:{id:A},role:'owner',businessUnits:[],properties:null}).loadEnterprise({tenantId:A}),'TENANT_CONTEXT_MISMATCH');
});
test('09: nonlocal endpoints and production domain cannot be configured',()=>{
 for(const baseUrl of ['https://app.tamcocexperience.com','https://bizviora-synthetic-demo.onrender.com','https://oxakhhpyvvymujiwuvnm.supabase.co']){
  assert.throws(()=>createFounderStagingAdapter({getAccessToken:async()=>jwt,fetchImpl:mock(),baseUrl}),
    e=>e.code==='NON_STAGING_ENDPOINT_FORBIDDEN');
 }
});
test('10: invalid tenant id rejects before JWT call',async()=>{
 let count=0;
 const c=createFounderStagingAdapter({getAccessToken:async()=>{count++;return jwt;},fetchImpl:mock()});
 await fails(c.loadEnterprise({tenantId:'tenant-A'}),'INVALID_TENANT_ID');assert.equal(count,0);
});
