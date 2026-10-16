import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
import {validateRegistration} from '../src/registration.mjs';
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token='valid-test-token-12345';
let created=0;
const api=createApi({
 verifyBearer:async t=>t===token?{id:uid}:null,
 repository:()=>({
   myRegistration:async userId=>({applicant_user_id:userId,status:'PENDING'}),
   createRegistration:async(userId,fields)=>{created++;return {applicant_user_id:userId,...fields,status:'PENDING'};}
 })
});
const call=async(method,body,t=token)=>{
 const response=await api(new Request('https://example.invalid/v1/registration',{
 method,headers:{Authorization:'Bearer '+t},
 ...(body?{body:JSON.stringify(body)}:{})
 }));
 return {status:response.status,data:await response.json()};
};
test('registration requires verified bearer',async()=>{
 assert.equal((await call('GET',null,'wrong-token-12345')).status,401);
});
test('applicant reads own record',async()=>{
 const r=await call('GET');assert.equal(r.status,200);assert.equal(r.data.data.applicant_user_id,uid);
});
test('registration accepts minimal fields and never trusts owner or status',async()=>{
 const r=await call('POST',{businessName:' Demo Company ',contactName:' Demo Owner ',planCode:'BASIC_001'});
 assert.equal(r.status,201);assert.equal(r.data.data.business_name,'Demo Company');
 assert.equal(r.data.data.applicant_user_id,uid);assert.equal(r.data.data.status,'PENDING');
});
test('reject client-controlled tenant, owner, status',async()=>{
 for(const field of ['tenant_id','applicant_user_id','status','reviewer_user_id']){
 const r=await call('POST',{businessName:'Demo',contactName:'Owner',planCode:'BASIC_001',[field]:'fake'});
 assert.equal(r.status,400);
 }
});
test('reject malformed values and empty input',()=>{
 assert.throws(()=>validateRegistration({businessName:'',contactName:'Joe',planCode:'BASIC_001'}),/INVALID_REGISTRATION/);
 assert.throws(()=>validateRegistration({businessName:'Demo',contactName:'Joe',planCode:'bad'}),/INVALID_REGISTRATION/);
});
test('invalid payload does not write',async()=>{
 const before=created;
 assert.equal((await call('POST',{businessName:'x',contactName:'a',planCode:'BASIC_001'})).status,400);
 assert.equal(created,before);
});
