import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const code=(await readFile(new URL('../auth-client.js',import.meta.url),'utf8')).replace(/^import .+?;\n/,'');
const {authorizedCustomer}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const mock=(opts={})=>{
 const user=opts.user===false?null:{id:userId,email:'owner@example.test'};
 const tenant=opts.tenant===false?null:{id:tenantId,slug:opts.slug||'tuan-os-enterprise-001',name:'TUAN OS'};
 const membership=opts.member===false?null:{tenant_id:opts.memberTenant||tenantId,user_id:opts.memberUser||userId,role:opts.role||'owner'};
 return {auth:{getUser:async()=>({data:{user},error:null})},
  from:name=>({select:()=>({
   eq:()=>({eq:()=>({maybeSingle:async()=>({data:membership,error:opts.memberError||null})}),
   maybeSingle:async()=>({data:tenant,error:opts.tenantError||null})})})
  })};
};
test('anonymous never enters customer dashboard',async()=>assert.equal((await authorizedCustomer(mock({user:false}))).reason,'LOGIN_REQUIRED'));
test('verified owner with matching tenant membership is allowed',async()=>assert.deepEqual((await authorizedCustomer(mock())).ok,true));
test('other tenant has no TUAN OS dashboard',async()=>assert.equal((await authorizedCustomer(mock({tenant:false}))).reason,'TENANT_DENIED'));
test('no membership fails closed',async()=>assert.equal((await authorizedCustomer(mock({member:false}))).reason,'TENANT_DENIED'));
test('membership assigned to different user fails closed',async()=>assert.equal((await authorizedCustomer(mock({memberUser:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}))).reason,'TENANT_DENIED'));
test('membership assigned to different tenant fails closed',async()=>assert.equal((await authorizedCustomer(mock({memberTenant:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}))).reason,'TENANT_DENIED'));
test('unknown membership role fails closed',async()=>assert.equal((await authorizedCustomer(mock({role:'platform_manager'}))).reason,'TENANT_DENIED'));
test('membership read errors fail closed',async()=>assert.equal((await authorizedCustomer(mock({memberError:new Error('RLS_DENIED')}))).reason,'TENANT_DENIED'));
