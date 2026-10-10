import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../sql/001_STAGING_ONLY_init.sql',import.meta.url),'utf8');
const tables=['bv_tenants','bv_memberships','bv_business_units','bv_properties','bv_tasks','bv_approvals','bv_audit_events'];

test('24 chỉ tạo bảng BIZVIORA',()=>{
 const found=[...sql.matchAll(/CREATE TABLE public\.([a-z_]+)/g)].map(x=>x[1]);
 assert.deepEqual(found,tables);
});
test('25 RLS được bật trên tất cả 7 bảng',()=>{
 for(const t of tables)assert.ok(sql.includes('ALTER TABLE public.'+t+' ENABLE ROW LEVEL SECURITY;'),t);
});
test('26 thành viên không tự thêm quyền hoặc phê duyệt',()=>{
 assert.match(sql,/GRANT SELECT ON public\.bv_tenants,public\.bv_memberships/);
 assert.match(sql,/GRANT INSERT,UPDATE ON public\.bv_tasks TO authenticated/);
 assert.doesNotMatch(sql,/GRANT\s+(?:INSERT|UPDATE|DELETE)\s+ON public\.(?:bv_memberships|bv_approvals|bv_audit_events)/);
});
test('27 ràng buộc ghép tenant và đơn vị/cơ sở/công việc',()=>{
 assert.match(sql,/FOREIGN KEY\(tenant_id,business_unit_id\) REFERENCES public\.bv_business_units/);
 assert.match(sql,/FOREIGN KEY\(tenant_id,business_unit_id,property_id\)/);
 assert.match(sql,/FOREIGN KEY\(tenant_id,task_id\) REFERENCES public\.bv_tasks/);
});
test('28 ghi nhật ký cùng giao dịch, không lưu payload',()=>{
 assert.match(sql,/CREATE TRIGGER bv_tasks_audit_guard BEFORE INSERT OR UPDATE OR DELETE/);
 assert.match(sql,/INSERT INTO public\.bv_audit_events\(tenant_id,actor_user_id,entity_type,entity_id,operation\)/);
 assert.doesNotMatch(sql,/old_payload|new_payload|secret_value/i);
});
test('29 cấm sửa tenant, người tạo và định danh tác vụ',()=>{
 assert.match(sql,/NEW\.tenant_id IS DISTINCT FROM OLD\.tenant_id/);
 assert.match(sql,/NEW\.created_by IS DISTINCT FROM OLD\.created_by/);
 assert.match(sql,/NEW\.id IS DISTINCT FROM OLD\.id/);
});
