/**
 * BIZVIORA CORE 002: Test JWT thật + Postgres RLS bằng API (không giả lập actor).
 * Chỉ chạy thủ công trên dự án staging được chủ sở hữu duyệt.
 * Không in token, email, dữ liệu cá nhân hoặc khóa bí mật.
 * YÊU CẦU: 3 user Auth staging thật + 2 tenant A/B có membership:
 *   owner_A(role owner, tenant A), staff_A(role staff, tenant A), owner_B(role owner, tenant B).
 * KHÔNG sử dụng tài khoản, dữ liệu hoặc khóa từ TUAN OS production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const vars=process.env;
const no=['mmxgthzafjoienokyplw','zydtetnvguvlhpkjlvqi'];
if(vars.BIZVIORA_STAGING_E2E_ACK!=='RUN_ON_ISOLATED_STAGING')
  throw Error('E2E_REQUIRES_EXPLICIT_STAGING_ACK');
const ref=vars.BIZVIORA_STAGING_PROJECT_REF;
const url=vars.BIZVIORA_SUPABASE_URL;
if(!ref||!url||no.includes(ref)||new URL(url).hostname!==ref+'.supabase.co'||!url.startsWith('https://'))
  throw Error('STAGING_PROJECT_IDENTITY_REJECTED');

const anonKey=vars.BIZVIORA_SUPABASE_ANON_KEY;
const tA=vars.BIZVIORA_TEST_TENANT_A;
const tB=vars.BIZVIORA_TEST_TENANT_B;
const tokens=[
  vars.BIZVIORA_TEST_JWT_OWNER_A,
  vars.BIZVIORA_TEST_JWT_STAFF_A,
  vars.BIZVIORA_TEST_JWT_OWNER_B
];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!anonKey||!uuid.test(tA||'')||!uuid.test(tB||'')||tA===tB
 ||tokens.some(t=>!t||t.length<50)||new Set(tokens).size!==3)
 throw Error('INCOMPLETE_STAGING_TEST_FIXTURE');

const client=token=>createClient(url,anonKey,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:token?{headers:{Authorization:'Bearer '+token}}:{}
});
const [ownerA,staffA,ownerB]=tokens.map(client);
const anon=client();
const signed=[ownerA,staffA,ownerB];

let users=[];
test('02.01 JWT thật: Supabase Auth xác minh 3 người dùng khác nhau',async()=>{
 users=await Promise.all(signed.map(async(s)=>{
   const {data,error}=await s.auth.getUser();
   assert.equal(!!error,false,'Token người dùng không hợp lệ');
   assert.ok(uuid.test(data?.user?.id||''));
   return data.user.id;
 }));
 assert.equal(new Set(users).size,3);
});
test('02.02 Membership: A owner/staff và B owner đúng tenant, đúng vai trò',async()=>{
 if(users.length!==3)throw Error('PREVIOUS_AUTH_TEST_FAILED');
 const expectation=[
  [ownerA,users[0],tA,'owner'],
  [staffA,users[1],tA,'staff'],
  [ownerB,users[2],tB,'owner']
 ];
 for(const [s,u,tenant,role] of expectation){
  const {data,error}=await s.from('bv_memberships')
    .select('tenant_id,user_id,role').eq('tenant_id',tenant).eq('user_id',u).single();
  assert.equal(error,null,'Membership chưa được thiết lập đúng');
  assert.equal(data.tenant_id,tenant);assert.equal(data.user_id,u);assert.equal(data.role,role);
 }
});
test('02.03 RLS chéo: owner A không đọc được tenant B và ngược lại',async()=>{
 for(const [s,target] of [[ownerA,tB],[ownerB,tA]]){
  const {data,error}=await s.from('bv_tenants').select('id').eq('id',target);
  assert.equal(error,null);assert.deepEqual(data,[]);
 }
});
test('02.04 RLS task: A không thấy công việc B và B không thấy A',async()=>{
 for(const [s,tenant] of [[ownerA,tA],[staffA,tA],[ownerB,tB]]){
  const {data,error}=await s.from('bv_tasks').select('tenant_id').limit(100);
  assert.equal(error,null);
  assert.ok(data.every(x=>x.tenant_id===tenant));
 }
});
test('02.05 RLS: không có JWT thì không đọc được tenant/membership',async()=>{
 for(const table of ['bv_tenants','bv_memberships','bv_tasks','bv_approvals']){
  const {data,error}=await anon.from(table).select('*').limit(1);
  assert.ok(error||!data?.length,'Anonymous access unexpectedly granted: '+table);
 }
});
test('02.06 Chỉ manager+: staff A bị từ chối INSERT task',async()=>{
 if(users.length!==3)throw Error('PREVIOUS_AUTH_TEST_FAILED');
 const {error}=await staffA.from('bv_tasks').insert({
  tenant_id:tA,title:'CORE002-STAFF-NEGATIVE-'+randomUUID(),created_by:users[1]
 });
 assert.ok(error,'Staff insert unexpectedly accepted');
});
test('02.07 Owner A không tạo task trên tenant B',async()=>{
 if(users.length!==3)throw Error('PREVIOUS_AUTH_TEST_FAILED');
 const {error}=await ownerA.from('bv_tasks').insert({
  tenant_id:tB,title:'CORE002-CROSS-NEGATIVE-'+randomUUID(),created_by:users[0]
 });
 assert.ok(error,'Cross-tenant insert unexpectedly accepted');
});
test('02.08 Owner A tạo task có audit, owner B không đọc được',async()=>{
 if(users.length!==3)throw Error('PREVIOUS_AUTH_TEST_FAILED');
 const title='CORE002-SYNTHETIC-'+randomUUID();
 const {data,error}=await ownerA.from('bv_tasks').insert({
  tenant_id:tA,title,created_by:users[0],status:'TODO'
 }).select('id,tenant_id,title').single();
 assert.equal(error,null,'Owner A insert không thành công');
 assert.equal(data.tenant_id,tA);
 const audit=await ownerA.from('bv_audit_events').select('tenant_id,actor_user_id,operation')
 .eq('entity_id',data.id).eq('operation','INSERT').single();
 assert.equal(audit.error,null,'Thiếu bằng chứng audit');
 assert.equal(audit.data.tenant_id,tA);
 assert.equal(audit.data.actor_user_id,users[0]);
 const other=await ownerB.from('bv_tasks').select('id').eq('id',data.id);
 assert.equal(other.error,null);assert.deepEqual(other.data,[]);
});
test('02.09 RLS audit: nhân viên không có quyền xem nhật ký',async()=>{
 const {data,error}=await staffA.from('bv_audit_events').select('id').limit(1);
 assert.ok(error||!data?.length,'Staff audit access unexpectedly allowed');
});
test('02.10 Không được phép tự tạo yêu cầu phê duyệt qua kết nối trực tiếp',async()=>{
 if(users.length!==3)throw Error('PREVIOUS_AUTH_TEST_FAILED');
 const {error}=await ownerA.from('bv_approvals').insert({
  tenant_id:tA,requested_by:users[0],status:'APPROVED'
 });
 assert.ok(error,'Approval write unexpectedly accepted');
});
test('02.11 Không được phép tự nâng quyền membership',async()=>{
 if(users.length!==3)throw Error('PREVIOUS_AUTH_TEST_FAILED');
 const {error}=await staffA.from('bv_memberships').insert({
  tenant_id:tB,user_id:users[1],role:'owner'
 });
 assert.ok(error,'Privilege escalation unexpectedly accepted');
});
