import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, requireMembership, requireUuid, validateTaskInput } from '../src/access.mjs';

// Synthetic identifiers only. This suite never connects to production or Supabase.
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const member=(tenant=A,role='staff')=>({user_id:USER,tenant_id:tenant,role});
const denied=(f,status)=>assert.throws(f,e=>e instanceof ApiError&&e.status===status);

test('normalizes valid UUID and rejects malformed IDs',()=>{
  assert.equal(requireUuid(A.toUpperCase()),A);
  denied(()=>requireUuid('not-uuid'),400);
});
test('denies absent, foreign-tenant and unknown-role membership',()=>{
  denied(()=>requireMembership({userId:USER,tenantId:A,membership:null}),403);
  denied(()=>requireMembership({userId:USER,tenantId:B,membership:member(A)}),403);
  denied(()=>requireMembership({userId:USER,tenantId:A,membership:member(A,'superadmin')}),403);
});
test('staff cannot pass manager-level authorization',()=>{
  denied(()=>requireMembership({userId:USER,tenantId:A,membership:member(A),minRole:'manager'}),403);
});
test('owner keeps verified tenant identity and immutable actor context',()=>{
  const actor=requireMembership({userId:USER,tenantId:A,membership:member(A,'owner'),minRole:'manager'});
  assert.deepEqual(actor,{userId:USER,tenantId:A,role:'owner'});
  assert.ok(Object.isFrozen(actor));
});
test('task rejects status escalation and malformed property identifiers',()=>{
  denied(()=>validateTaskInput({title:'X',status:'APPROVED'}),400);
  denied(()=>validateTaskInput({title:'X',propertyId:B+'x'}),400);
});
test('task defaults to TODO and enforces title length',()=>{
  assert.deepEqual(validateTaskInput({title:'  Test task  '}),{
    title:'Test task',status:'TODO',business_unit_id:null,property_id:null,assigned_to:null
  });
  denied(()=>validateTaskInput({title:'x'.repeat(181)}),400);
});
