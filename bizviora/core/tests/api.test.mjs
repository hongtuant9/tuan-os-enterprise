import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.mjs';
import {requireMembership,requireUuid,validateTaskInput} from '../src/access.mjs';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UA='11111111-1111-4111-8111-111111111111';
const SA='22222222-2222-4222-8222-222222222222';
const UB='33333333-3333-4333-8333-333333333333';
const tokens={'owner-A-token-12345':UA,'staff-A-token-12345':SA,'owner-B-token-12345':UB};
const members=[
 {tenant_id:A,user_id:UA,role:'owner'},
 {tenant_id:A,user_id:SA,role:'staff'},
 {tenant_id:B,user_id:UB,role:'owner'}
];
let calls=[];
const api=createApi({
 verifyBearer:async token=>tokens[token]?{id:tokens[token]}:null,
 repository:token=>({
  membership:async({tenantId,userId})=>members.find(m=>m.tenant_id===tenantId&&m.user_id===userId)||null,
  context:async actor=>{calls.push(['context',actor]);return{tenant:{id:actor.tenantId},businessUnits:[],properties:[]};},
  tasks:async actor=>{calls.push(['tasks',actor]);return[{tenant_id:actor.tenantId}];},
  createTask:async(actor,input)=>{calls.push(['createTask',actor,input]);return{tenant_id:actor.tenantId,...input};},
  approvals:async actor=>{calls.push(['approvals',actor]);return[{tenant_id:actor.tenantId}];}
 })
});
function request(route,{method='GET',token='owner-A-token-12345',body}={}){
 return new Request('http://localhost'+route,{
  method,headers:token===null?{}:{Authorization:'Bearer '+token},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
async function run(route,options){calls=[];const response=await api(request(route,options));return{status:response.status,body:await response.json()};}

test('01 health nêu rõ staging và không được gửi OTA',async()=>{
 const r=await run('/health',{token:null});assert.equal(r.status,200);
 assert.equal(r.body.autoSend,false);assert.equal(r.body.bookingWrite,false);
});
test('02 thiếu Bearer thì 401',async()=>assert.equal((await run('/v1/tasks?tenantId='+A,{token:null})).status,401));
test('03 token không xác thực thì 401',async()=>assert.equal((await run('/v1/tasks?tenantId='+A,{token:'invalid-token-12345'})).status,401));
test('04 ID tenant không hợp lệ thì 400',async()=>assert.equal((await run('/v1/tasks?tenantId=ABC')).status,400));
test('05 không cho chủ A đọc B',async()=>{assert.equal((await run('/v1/tasks?tenantId='+B)).status,403);assert.equal(calls.length,0);});
test('06 chủ A được nhận đúng context',async()=>{const r=await run('/v1/context?tenantId='+A);assert.equal(r.status,200);assert.equal(r.body.tenant.id,A);});
test('07 staff A được đọc nhiệm vụ A',async()=>assert.equal((await run('/v1/tasks?tenantId='+A,{token:'staff-A-token-12345'})).status,200));
test('08 staff A không được tạo nhiệm vụ',async()=>{const r=await run('/v1/tasks',{method:'POST',token:'staff-A-token-12345',body:{tenantId:A,title:'Công việc'}});assert.equal(r.status,403);});
test('09 owner A được tạo nhiệm vụ A',async()=>{const r=await run('/v1/tasks',{method:'POST',body:{tenantId:A,title:'  Kiểm tra phòng  '}});assert.equal(r.status,201);assert.equal(r.body.data.title,'Kiểm tra phòng');});
test('10 owner B không ghi được A',async()=>assert.equal((await run('/v1/tasks',{method:'POST',token:'owner-B-token-12345',body:{tenantId:A,title:'Sai quyền'}})).status,403));
test('11 không nhận trạng thái DONE lúc tạo',async()=>assert.equal((await run('/v1/tasks',{method:'POST',body:{tenantId:A,title:'Tác vụ',status:'DONE'}})).status,400));
test('12 cấm tiêu đề trống',()=>assert.throws(()=>validateTaskInput({title:' '}),/INVALID_TITLE/));
test('13 cấm mã phân công không phải UUID',()=>assert.throws(()=>validateTaskInput({title:'Tác vụ',assignedTo:'abc'}),/INVALID_ASSIGNED_TO/));
test('14 phê duyệt chỉ đọc',async()=>{const r=await run('/v1/approvals?tenantId='+A);assert.equal(r.status,200);assert.equal(r.body.writesEnabled,false);});
test('15 không cho ghi duyệt',async()=>assert.equal((await run('/v1/approvals',{method:'POST',body:{tenantId:A,status:'APPROVED'}})).status,405));
test('16 không mở tài chính cá nhân',async()=>assert.equal((await run('/v1/private-finance?tenantId='+A)).status,405));
test('17 URL tự khai userId không nâng quyền staff',async()=>{const r=await run('/v1/tasks?tenantId='+A+'&userId='+UA,{token:'staff-A-token-12345'});assert.equal(r.status,200);assert.equal(calls[0][1].role,'staff');});
test('18 không cho tráo tenant membership',()=>assert.throws(()=>requireMembership({userId:UA,tenantId:B,membership:members[0]}),/TENANT_ACCESS_DENIED/));
test('19 không cho dùng membership người khác',()=>assert.throws(()=>requireMembership({userId:SA,tenantId:A,membership:members[0]}),/TENANT_ACCESS_DENIED/));
test('20 tiêu đề quá dài bị chặn',async()=>assert.equal((await run('/v1/tasks',{method:'POST',body:{tenantId:A,title:'x'.repeat(181)}})).status,400));
test('21 body >16KB bị chặn',async()=>assert.equal((await run('/v1/tasks',{method:'POST',body:{tenantId:A,title:'x'.repeat(17000)}})).status,413));
test('22 không mở HTTP PUT',async()=>assert.equal((await run('/v1/tasks?tenantId='+A,{method:'PUT'})).status,405));
test('23 lỗi nội bộ không được xuất secret',async()=>{
 const broken=createApi({verifyBearer:async()=>({id:UA}),repository:()=>({membership:async()=>{throw Error('secret password exposed');}})});
 const response=await broken(request('/v1/tasks?tenantId='+A));const body=JSON.stringify(await response.json());
 assert.equal(response.status,503);assert.equal(body.includes('password'),false);
});

test('30 UUID chuẩn năm nhóm được chấp nhận',()=>assert.equal(requireUuid(A,'tenant_id'),A));
test('31 UUID thiếu nhóm thứ tư phải bị từ chối',()=>assert.throws(()=>requireUuid('aaaaaaaa-aaaa-4aaa-aaaaaaaaaaaa','tenant_id'),/INVALID_TENANT_ID/));
