import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadTuanSettingsFromRls,LiveSettingsError} from './verified-settings-data.mjs';

const T='308e6d09-9410-492e-8468-4c978226da41';
const A='11111111-1111-4111-8111-111111111111';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const units=[
{id:'6f0aeadf-2650-4d88-9943-0b84d25f6ae7',name:'Cozy Garden',tenant_id:T},
{id:'b809445b-bb88-4af0-8381-f69827aa3dc8',name:'Lavender Homestay',tenant_id:T},
{id:'688a4d38-4484-44a5-af69-a7d452d6dd8d',name:'Ruby Homestay',tenant_id:T}];
const properties=[
{id:'17c69b92-6b99-4e4c-9d9f-9a86f2e4eb81',tenant_id:T,business_unit_id:units[0].id,name:'Cozy Garden Tam Coc'},
{id:'d11732e1-b141-40e3-bbdc-e8f019ceb026',tenant_id:T,business_unit_id:units[1].id,name:'Tam Coc Lavender Homestay'},
{id:'36e25d13-8a2d-4d7c-a498-4616a79c697c',tenant_id:T,business_unit_id:units[2].id,name:'Ruby Homestay'}];
const tenant={id:T,slug:'tuan-os-enterprise-001',name:'TUAN OS Enterprise'};
const owner={ok:true,tenant,user:{id:A},role:'owner'};
const rows={
 bv_tenants:tenant,
 bv_memberships:{tenant_id:T,user_id:A,role:'owner'},
 bv_business_units:units,
 bv_properties:properties,
 bv_audit_events:[{id:1,tenant_id:T,operation:'INSERT',entity_type:'TASK',occurred_at:'2026-10-16T00:00:00Z'}]
};
function clientWith(changes={},id=A,trace=[]){
 const db={...rows,...changes};
 return {
  auth:{getUser:async()=>({data:{user:{id}},error:null})},
  from(table){
    trace.push(table);
    const state={filters:[]};
    const builder={
      select:()=>builder,
      eq:(name,value)=>{state.filters.push([name,value]);return builder},
      order:()=>builder,limit:()=>builder,
      maybeSingle:()=>Promise.resolve({data:db[table]??null,error:null}),
      then:(accept,reject)=>Promise.resolve({data:db[table],error:null}).then(accept,reject)
    };
    return builder;
  }
 };
}
test('Owner returns 3 real-labeled units & 3 matching properties; audit read-only',async()=>{
 const trace=[];
 const d=await loadTuanSettingsFromRls({access:owner,client:clientWith({},A,trace)});
 assert.equal(d.source,'SUPABASE_SOURCE_POSTGREST_RLS');
 assert.equal(d.company.name,'TUAN OS Enterprise');
 assert.equal(d.businessUnits.length,3);
 assert.deepEqual(d.businessUnits.map(u=>u.name).sort(),['Cozy Garden','Lavender Homestay','Ruby Homestay'].sort());
 assert.equal(d.properties.length,3);
 assert.ok(d.properties.some(p=>p.name==='Cozy Garden Tam Coc'));
 assert.ok(d.properties.some(p=>p.name==='Tam Coc Lavender Homestay'));
 assert.ok(d.properties.some(p=>p.name==='Ruby Homestay'));
 assert.equal(d.auditEvents.length,1);
 assert.equal(d.writeEnabled,false);
 assert.equal(d.customerDataReady,false);
 assert.ok(trace.includes('bv_audit_events'));
});
test('Auth missing or session actor changed fail closed',async()=>{
 await assert.rejects(()=>loadTuanSettingsFromRls({access:owner,client:clientWith({},B)}),/AUTH_REQUIRED/);
 await assert.rejects(()=>loadTuanSettingsFromRls({access:null,client:clientWith()}),/AUTH_OR_CONTEXT_REQUIRED/);
});
test('Foreign tenant B cannot select TUAN via claimed context',async()=>{
 await assert.rejects(()=>loadTuanSettingsFromRls({access:{...owner,tenant:{...tenant,id:B}},client:clientWith()}),/TENANT_DENIED/);
 await assert.rejects(()=>loadTuanSettingsFromRls({access:owner,client:clientWith({bv_tenants:null})}),/TENANT_DENIED/);
});
test('Forged membership or role change fails closed',async()=>{
 await assert.rejects(()=>loadTuanSettingsFromRls({access:owner,client:clientWith({bv_memberships:{tenant_id:B,user_id:A,role:'owner'}})}),/TENANT_DENIED/);
 await assert.rejects(()=>loadTuanSettingsFromRls({access:{...owner,role:'staff'},client:clientWith()}),/TENANT_DENIED/);
});
test('Missing real Cozy/Lavender/Ruby cannot silently use demo fallback',async()=>{
 await assert.rejects(()=>loadTuanSettingsFromRls({access:owner,client:clientWith({bv_business_units:units.slice(0,2)})}),/SETTINGS_DATA_INCOMPLETE/);
 await assert.rejects(()=>loadTuanSettingsFromRls({access:owner,client:clientWith({bv_business_units:[...units.slice(0,2),{...units[2],name:'Tour & activities'}]})}),/SETTINGS_DATA_INCOMPLETE/);
});
test('Cross-tenant property or audit rejects entire data response',async()=>{
 await assert.rejects(()=>loadTuanSettingsFromRls({access:owner,client:clientWith({bv_properties:[{...properties[0],tenant_id:B},...properties.slice(1)]})}),/SETTINGS_PROPERTY_SCOPE_DENIED/);
 await assert.rejects(()=>loadTuanSettingsFromRls({access:owner,client:clientWith({bv_audit_events:[{...rows.bv_audit_events[0],tenant_id:B}]})}),/SETTINGS_AUDIT_SCOPE_DENIED/);
});
test('Staff membership in TUAN cannot read audit',async()=>{
 const trace=[],staffAccess={...owner,role:'staff'};
 const client=clientWith({bv_memberships:{tenant_id:T,user_id:A,role:'staff'}},A,trace);
 const data=await loadTuanSettingsFromRls({client,access:staffAccess});
 assert.equal(data.auditStatus,'DENIED');
 assert.deepEqual(data.auditEvents,[]);
 assert.equal(trace.includes('bv_audit_events'),false);
});
test('Settings DOM source disables DEMO renderer and uses session-auth live loader',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const gate=readFileSync(new URL('./auth-gate.js',import.meta.url),'utf8');
 const view=readFileSync(new URL('./verified-settings-view.mjs',import.meta.url),'utf8');
 assert.match(html,/S\.page==='settings'\?'<div id="biz2-verified-settings"/);
 assert.match(gate,/if\(!access\.ok\)/);
 assert.match(gate,/mountVerifiedSettings\(\{container,client,access\}\)/);
 assert.match(view,/textContent/);
 assert.doesNotMatch(view,/localStorage|sessionStorage|innerHTML/);
});
