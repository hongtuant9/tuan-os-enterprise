import test from 'node:test';
import assert from 'node:assert/strict';
import { createFounderGate } from '../src/founder-auth.mjs';
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JWT='synthetic.mock.jwt.abcdefghijklmnop';
const gate=(rpc,verify=async()=>({id:OWNER}))=>createFounderGate({verifyBearer:verify,platformManagerRpc:rpc});
test('valid signed-user mock and explicit true RPC allows Founder',async()=>{
 const founder=await gate(async(t,u)=>t===JWT&&u===OWNER)(JWT);
 assert.deepEqual(founder,{userId:OWNER,platformManager:true});assert.ok(Object.isFrozen(founder));
});
test('missing token fails closed before verify and RPC',async()=>{
 let called=false;
 await assert.rejects(gate(async()=>{called=true;return true})(''),{status:401});
 assert.equal(called,false);
});
test('auth verification exception is denied without RPC',async()=>{
 let called=false;
 await assert.rejects(gate(async()=>{called=true;return true},async()=>{throw Error('expired')})(JWT),{status:401});
 assert.equal(called,false);
});
test('unverified user identity cannot reach RPC',async()=>{
 let called=false;
 await assert.rejects(gate(async()=>{called=true;return true},async()=>({id:'bad-id'}))(JWT),{status:401});
 assert.equal(called,false);
});
test('false, null, and non-boolean RPC responses cannot assign Founder',async()=>{
 for(const result of [false,null,'true',1,undefined])await assert.rejects(gate(async()=>result)(JWT),{status:403});
});
test('RPC failure fails closed without exposing internals',async()=>{
 await assert.rejects(gate(async()=>{throw Error('database exception with secret')})(JWT),{status:403,code:'FOUNDER_ACCESS_DENIED'});
});
