// STAGING ONLY — real tenant data workspace; no PMS/POS/OTA connections.
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const btn=(text,fn)=>{const n=el('button',text);n.type='button';n.addEventListener('click',fn);return n;};
const showError=e=>e?.message?.slice(0,160)||'Yêu cầu chưa được thực hiện';
function panel(root,name){const x=el('section',undefined,'bv-live-panel');x.append(el('h2',name));root.append(x);return x;}
export async function mountTenantWorkspace({client,tenant,user,role,root}){
  root.replaceChildren();
  const css=el('style');
  css.textContent=`.bv-live{font:15px system-ui,sans-serif;color:#172638;max-width:1180px;margin:22px auto;padding:0 16px 60px}.bv-live-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}.bv-live-panel{background:white;border:1px solid #e0e7ef;border-radius:12px;padding:18px;margin-bottom:14px}.bv-live-panel h2{font-size:18px;margin:0 0 10px}.bv-live ul{margin:8px 0;padding-left:19px}.bv-live li{padding:5px 0}.bv-live input,.bv-live select{padding:9px 10px;border:1px solid #c8d3e0;border-radius:7px;max-width:100%;min-width:0}.bv-live button{padding:9px 13px;border:0;border-radius:8px;background:#165d9a;color:white;cursor:pointer;margin:4px}.bv-live button:disabled{opacity:.5}.bv-live form{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.bv-live-alert{color:#8f2800;white-space:pre-wrap}.bv-live-muted{color:#587083;font-size:13px}.bv-live-counter{font-weight:700;font-size:27px}`;
  root.append(css);
  const shell=el('div',undefined,'bv-live');root.append(shell);
  shell.append(el('h1',tenant.name+' — Không gian điều hành'));
  shell.append(el('p','STAGING — dữ liệu thực trong tenant được đăng nhập. Chưa đồng bộ KiotViet, OTA, tài chính hoặc production.','bv-live-muted'));
  const notice=el('p',undefined,'bv-live-alert');shell.append(notice);
  const grid=el('div',undefined,'bv-live-grid');shell.append(grid);
  const summary=panel(grid,'Tổng quan');const unitPanel=panel(grid,'Đơn vị kinh doanh');const propertyPanel=panel(grid,'Cơ sở');
  const tasks=panel(shell,'Công việc');const approvals=panel(shell,'Phê duyệt — chỉ đọc');const audit=panel(shell,'Audit — chỉ đọc');
  const owner=role==='owner';const data={units:[],properties:[]};
  const list=(x,records,toLabel)=>{const ul=el('ul');if(!records.length)ul.append(el('li','Chưa có dữ liệu'));else for(const r of records)ul.append(el('li',toLabel(r)));x.append(ul);};
  const fetchTable=async(t,cols='*')=>{const r=await client.from(t).select(cols).eq('tenant_id',tenant.id).limit(100);if(r.error)throw Error('READ_'+t+'_FAILED');return r.data||[];};
  async function load(){
    notice.textContent='';for(const p of [summary,unitPanel,propertyPanel,tasks,approvals,audit])p.replaceChildren(el('h2',({'Tổng quan':'Tổng quan','Đơn vị kinh doanh':'Đơn vị kinh doanh','Cơ sở':'Cơ sở','Công việc':'Công việc','Phê duyệt — chỉ đọc':'Phê duyệt — chỉ đọc','Audit — chỉ đọc':'Audit — chỉ đọc'})[p.querySelector('h2')?.textContent]||'')); 
    try {
      const [units,props,taskRows,approvalRows,auditRows]=await Promise.all([
        fetchTable('bv_business_units','id,tenant_id,name'),fetchTable('bv_properties','id,tenant_id,business_unit_id,name'),
        fetchTable('bv_tasks','id,tenant_id,title,status,business_unit_id,property_id'),
        fetchTable('bv_approvals','id,tenant_id,status'),
        fetchTable('bv_audit_events','id,tenant_id,entity_type,operation,occurred_at')]);
      data.units=units;data.properties=props;
      for(const [label,n] of [['Business Unit',units.length],['Property',props.length],['Công việc',taskRows.length],['Phê duyệt',approvalRows.length],['Audit event',auditRows.length]]){
        const line=el('p',label+': ');line.append(el('strong',n));summary.append(line);
      }
      list(unitPanel,units,r=>r.name);list(propertyPanel,props,r=>r.name+' — '+(units.find(u=>u.id===r.business_unit_id)?.name||'Không rõ đơn vị'));
      list(tasks,taskRows,r=>r.title+' — '+r.status);
      list(approvals,approvalRows,r=>r.status+' · '+r.id.slice(0,8));
      list(audit,auditRows,r=>r.entity_type+' · '+r.operation+' · '+new Date(r.occurred_at).toLocaleString('vi-VN'));
      if(owner) attachForms();
    }catch(e){notice.textContent=showError(e);}
  }
  function createForm(target,description,fields,fn) {
    const form=el('form');form.setAttribute('aria-label',description);const controls={};
    for(const [key,caption,options] of fields){
      const control=options?el('select'):el('input');control.setAttribute('aria-label',caption);
      if(options){for(const [value,text] of options){const o=el('option',text);o.value=value;control.append(o);}}
      else {control.placeholder=caption;control.maxLength=200;control.required=true;}
      controls[key]=control;form.append(control);
    }
    const submit=el('button','Tạo');submit.type='submit';form.append(submit);
    form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;notice.textContent='';
      try{await fn(Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,v.value.trim()])));await load();}
      catch(error){notice.textContent=showError(error);}finally{submit.disabled=false;}
    });
    target.append(form);
  }
  function attachForms(){
    createForm(unitPanel,'Tạo đơn vị kinh doanh',[['name','Tên đơn vị']],async v=>{
      const {error}=await client.from('bv_business_units').insert({tenant_id:tenant.id,name:v.name});if(error)throw Error('CREATE_BUSINESS_UNIT_DENIED');
    });
    for(const u of data.units)unitPanel.append(btn('Đổi tên: '+u.name,async()=>{
      const name=window.prompt('Tên mới của đơn vị',u.name);if(!name||!name.trim()||name.trim()===u.name)return;
      const {error}=await client.from('bv_business_units').update({name:name.trim()}).eq('id',u.id).eq('tenant_id',tenant.id);
      if(error)notice.textContent='UPDATE_UNIT_DENIED';else await load();
    }));
    if(data.units.length)createForm(propertyPanel,'Tạo cơ sở',[['business_unit_id','Đơn vị',data.units.map(u=>[u.id,u.name])],['name','Tên cơ sở']],async v=>{
      const {error}=await client.from('bv_properties').insert({tenant_id:tenant.id,business_unit_id:v.business_unit_id,name:v.name});if(error)throw Error('CREATE_PROPERTY_DENIED');
    });
    for(const p of data.properties)propertyPanel.append(btn('Đổi tên: '+p.name,async()=>{
      const name=window.prompt('Tên mới của cơ sở',p.name);if(!name||!name.trim()||name.trim()===p.name)return;
      const {error}=await client.from('bv_properties').update({name:name.trim()}).eq('id',p.id).eq('tenant_id',tenant.id);
      if(error)notice.textContent='UPDATE_PROPERTY_DENIED';else await load();
    }));
    createForm(tasks,'Tạo công việc',[['title','Nội dung công việc']],async v=>{
      const {error}=await client.from('bv_tasks').insert({tenant_id:tenant.id,created_by:user.id,title:v.title,status:'TODO'});
      if(error)throw Error('CREATE_TASK_DENIED');
    });
  }
  await load();
}
