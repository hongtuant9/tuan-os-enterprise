import {LIVE_ROUTES,businessRows,reviewWithEvidence,validUuid} from './ops-review.mjs';

const LABEL={tenants:'Quản lý doanh nghiệp',onboarding:'Đăng ký và kích hoạt tenant',approvals:'Xét duyệt doanh nghiệp',audit:'Nhật ký xét duyệt'};
const t=(tag,value,cls)=>{const e=document.createElement(tag);if(value!=null)e.textContent=String(value);if(cls)e.className=cls;return e};
const add=(parent,...children)=>{for(const child of children)if(child)parent.appendChild(child);return parent};
const status=(box,message)=>{box.replaceChildren(t('p',message,'bv-live-status'))};
const shortDate=value=>value?String(value).slice(0,19).replace('T',' '):'—';
let client,observer,viewNonce=0,operationBusy=false,lastNavRoute=null;
const stillAuthorized=()=>document.documentElement.classList.contains('bv-founderauth-ok');
const manager=async()=>{const x=await client.rpc('bv_is_platform_manager');return !x.error&&x.data===true};
async function loadRequests(){
 const r=await client.from('bv_registration_requests')
  .select('id,applicant_user_id,business_name,contact_name,plan_code,status,tenant_id,created_at,reviewed_at')
  .order('created_at',{ascending:false}).limit(100);
 if(r.error||!Array.isArray(r.data))throw Error('REQUEST_READ_DENIED');
 return r.data;
}
async function loadReviews(){
 const r=await client.from('bv_registration_reviews')
  .select('request_id,result,note,reviewed_at,reviewer_user_id')
  .order('reviewed_at',{ascending:false}).limit(100);
 if(r.error||!Array.isArray(r.data))throw Error('REVIEW_AUDIT_READ_DENIED');
 return r.data;
}
function navState(route){
 const banner=document.querySelector('.demo-banner');
 if(banner)banner.textContent=route in LABEL?'● STAGING · DỮ LIỆU NGHIỆP VỤ THẬT · GIỚI HẠN RLS':'● DEMO · DỮ LIỆU GIẢ LẬP · KHÔNG GHI HỆ THỐNG THẬT';
 const note=document.querySelector('.founder-note');
 if(note){const e=[...note.querySelectorAll('div')].find(n=>n.textContent.includes('DỮ LIỆU GIẢ LẬP')||n.textContent.includes('MỤC ĐANG XEM:'));
  if(e)e.textContent=route in LABEL?'MỤC ĐANG XEM: DỮ LIỆU STAGING CÓ PHÂN QUYỀN':'DỮ LIỆU GIẢ LẬP • QUYỀN XEM ĐÃ XÁC THỰC'}
 const profile=document.querySelector('.top-profile b');
 if(profile)profile.textContent=route in LABEL?'Founder — STAGING':'Founder — DEMO';
 const old=document.querySelector('.navbtn[data-nav="approvals"] .count');
 if(old)old.remove(); // Do not display the demo hard-coded 6 as a real pending count.
}
function heading(route,root){
 const head=add(t('header',null,'bv-live-head'),
   t('h1',LABEL[route]),t('p','Nguồn: Supabase BIZVIORA staging · RLS thực thi tại database; không đọc dữ liệu production.','bv-live-muted'));
 const controls=t('div',null,'bv-live-actions');
 const reload=t('button','Làm mới dữ liệu');reload.type='button';reload.addEventListener('click',()=>paint(true));
 add(controls,reload);
 root.append(head,controls);
}
function section(parent,title,desc){
 const box=t('section',null,'bv-live-panel');
 add(box,t('h2',title),t('p',desc,'bv-live-muted'));
 parent.append(box);return box;
}
function row(parent,label,details,badge){
 const item=t('div',null,'bv-live-row');
 add(item,t('strong',label),t('small',details),t('span',badge,'bv-live-pill'));
 parent.append(item);return item;
}
async function showRequests(root,requests,route){
 const approved=businessRows(requests),pending=requests.filter(r=>r.status==='PENDING');
 if(route==='tenants'){
  const shell=t('div',null,'bv-tenant-dashboard');
  root.append(shell);
  const active=approved.length;
  const trial=approved.filter(r=>r.plan==='TRIAL_7D').length;
  const cards=t('div',null,'bv-tenant-kpis');
  const metrics=[
   ['▥','Tenant đã phê duyệt',String(active),'Trong phạm vi hồ sơ được cấp quyền'],
   ['♙','Dùng thử đã duyệt',String(trial),'Gói TRIAL_7D'],
   ['▤','Khách trả phí','—','Chưa xác minh subscription'],
   ['▥','Tỷ lệ giữ chân','—','Chưa có nguồn cohort'],
   ['♧','Ticket hỗ trợ mở','—','Chưa kết nối nguồn ticket'],
   ['▣','Gia hạn 30 ngày','—','Chưa xác minh kỳ gia hạn']
  ];
  for(const [symbol,label,value,note] of metrics){
   const card=t('div',null,'bv-tenant-kpi');
   add(card,t('span',symbol,'bv-tenant-kpi-icon'),t('div',null,'bv-tenant-kpi-content'));
   const body=card.lastChild;
   add(body,t('span',label,'bv-tenant-kpi-label'),t('b',value,'bv-tenant-kpi-number'),t('small',note));
   cards.append(card);
  }
  shell.append(cards);
  const main=t('div',null,'bv-tenant-columns');shell.append(main);
  const list=section(main,'▣ Danh sách doanh nghiệp (Tenant)','Dữ liệu staging từ hồ sơ đăng ký được duyệt · không phải toàn bộ bv_tenants');
  list.classList.add('bv-tenant-list');
  const search=t('input');search.placeholder='⌕ Tìm tên doanh nghiệp, gói, mã tenant…';search.setAttribute('aria-label','Tìm kiếm doanh nghiệp');
  const filter=t('select');filter.setAttribute('aria-label','Lọc gói dịch vụ');
  const option=(value,label)=>{const o=t('option',label);o.value=value;return o};
  filter.append(option('all','Tất cả gói'));
  for(const plan of [...new Set(approved.map(r=>r.plan).filter(Boolean))])filter.append(option(plan,plan));
  const controls=t('div',null,'bv-tenant-filters');add(controls,search,filter);list.append(controls);
  const tableWrap=t('div',null,'bv-tenant-tablewrap');
  const table=t('table',null,'bv-tenant-table');
  table.innerHTML='<thead><tr><th>#</th><th>Doanh nghiệp</th><th>Ngành</th><th>Gói dịch vụ</th><th>Trạng thái</th><th>Sức khỏe</th><th>Ngày kích hoạt</th></tr></thead>';
  const tbody=t('tbody');table.append(tbody);tableWrap.append(table);list.append(tableWrap);
  const count=t('small',null,'bv-tenant-count');list.append(count);
  const right=t('div',null,'bv-tenant-side');main.append(right);
  const detail=section(right,'▣ Thông tin doanh nghiệp','Chọn một tenant trong bảng để xem chi tiết đã xác minh');
  const modules=section(right,'▣ Module đang dùng','Chưa có nguồn module enablement được cấp quyền — không suy diễn từ tên doanh nghiệp');
  const channels=section(right,'♧ Kênh đã kết nối','Chưa có kết quả xác minh kết nối provider');
  const timeline=section(right,'◷ Dòng thời gian tài khoản','Chỉ hiển thị mốc phê duyệt từ hồ sơ đăng ký');
  const upsell=section(right,'◎ Cơ hội mở rộng','Chưa có dữ liệu cơ hội hoặc giá trị doanh thu được duyệt');
  [modules,channels,upsell].forEach(e=>add(e,t('span','CHƯA XÁC MINH','bv-tenant-unknown')));
  let chosen=approved[0]?.tenant_id;
  const draw=()=>{
   const q=search.value.trim().toLocaleLowerCase('vi');
   const rows=approved.filter(r=>(filter.value==='all'||r.plan===filter.value)&&[r.name,r.plan,r.tenant_id].join(' ').toLocaleLowerCase('vi').includes(q));
   tbody.replaceChildren();
   rows.forEach((r,i)=>{
    const tr=t('tr');tr.tabIndex=0;tr.setAttribute('role','button');
    if(chosen===r.tenant_id)tr.classList.add('bv-tenant-selected');
    const values=[String(i+1),r.name||'—','Chưa xác minh',r.plan||'—','Đã tạo tenant','Chưa đánh giá',shortDate(r.reviewed_at)];
    values.forEach((value,j)=>{const cell=t('td',value);if(j===1)cell.classList.add('bv-tenant-name');tr.append(cell)});
    tr.addEventListener('click',()=>{chosen=r.tenant_id;draw()});
    tr.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();chosen=r.tenant_id;draw()}});
    tbody.append(tr);
   });
   count.textContent='Hiển thị '+rows.length+' / '+approved.length+' hồ sơ đã duyệt trong phạm vi quyền';
   detail.querySelectorAll('.bv-tenant-detail').forEach(e=>e.remove());
   timeline.querySelectorAll('.bv-tenant-detail').forEach(e=>e.remove());
   const r=approved.find(r=>r.tenant_id===chosen);
   if(r){
    const d=t('div',null,'bv-tenant-detail');
    add(d,t('h3',r.name||'Doanh nghiệp'),t('span','Mã tenant: '+r.tenant_id,'bv-tenant-id'),
     t('p','Gói dịch vụ: '+(r.plan||'Chưa xác minh')),
     t('p','Ngành: Chưa xác minh · Sức khỏe: Chưa đánh giá'),
     t('p','Ngày phê duyệt: '+shortDate(r.reviewed_at)));
    detail.append(d);
    const ev=t('p','Hồ sơ được phê duyệt: '+shortDate(r.reviewed_at),'bv-tenant-detail');timeline.append(ev);
   }else add(detail,t('p','Chưa có doanh nghiệp được chọn.','bv-tenant-detail'));
  };
  search.addEventListener('input',draw);filter.addEventListener('change',draw);draw();
 }else if(route==='onboarding'){
  const s=section(root,'Đăng ký mới ('+pending.length+')','Hồ sơ mới chưa được tạo tenant hoặc cấp quyền. Phê duyệt được thực hiện tại tab Phê duyệt.');
  if(!pending.length)add(s,t('p','Không có hồ sơ đang chờ trong phạm vi RLS.'));
  for(const r of pending)row(s,r.business_name||'Chưa có tên','Gói: '+r.plan_code+' · Ngày: '+shortDate(r.created_at),'CHỜ DUYỆT');
  const b=section(root,'Đã kích hoạt tenant ('+approved.length+')','RPC tạo tenant và owner membership trong cùng giao dịch lúc duyệt.');
  for(const r of approved)row(b,r.name,'Tenant: '+r.tenant_id,'APPROVED');
 }else if(route==='approvals'){
  const s=section(root,'Hàng chờ phê duyệt ('+pending.length+')',
    'Chỉ Platform Manager được gọi RPC bv_review_registration. Mỗi hành động cần lý do và xác nhận.');
  if(!pending.length)add(s,t('p','Không có hồ sơ PENDING.'));
  for(const r of pending){
   const item=row(s,r.business_name||'Doanh nghiệp',
     'Người liên hệ: '+(r.contact_name||'—')+' · Gói: '+r.plan_code+' · '+shortDate(r.created_at),'PENDING');
   const box=t('div',null,'bv-live-review');
   const note=t('textarea');note.placeholder='Nhập lý do quyết định (tối thiểu 10 ký tự)';note.maxLength=600;note.rows=2;note.setAttribute('aria-label','Lý do xét duyệt '+(r.business_name||''));
   const allow=t('button','Phê duyệt và tạo tenant');
   const reject=t('button','Từ chối hồ sơ');
   allow.type=reject.type='button';reject.className='bv-live-deny';
   allow.onclick=()=>review(r.id,true,note.value,item,allow,reject);
   reject.onclick=()=>review(r.id,false,note.value,item,allow,reject);
   add(box,note,allow,reject);item.append(box);
  }
 }
}
async function showAudit(root,reviews){
 const s=section(root,'Lịch sử xét duyệt ('+reviews.length+')',
   'Nguồn: bv_registration_reviews. Đây chỉ là Audit xét duyệt doanh nghiệp, KHÔNG phải toàn bộ bv_audit_events.');
 if(!reviews.length)add(s,t('p','Chưa có bản ghi xét duyệt được cấp quyền xem.'));
 for(const r of reviews)
   row(s,'Hồ sơ: '+r.request_id, 'Người duyệt: '+r.reviewer_user_id+' · '+shortDate(r.reviewed_at)+
   (r.note?' · Lý do: '+r.note:''),r.result);
 const b=section(root,'Audit nền tảng','RLS hiện giới hạn bv_audit_events theo membership tenant và vai trò. Không đọc hoặc gắn nhãn giả là nhật ký toàn hệ thống.');
 add(b,t('p','Cổng mở rộng global audit yêu cầu một API/RPC riêng, kiểm thử quyền và phê duyệt bảo mật trước khi sử dụng.'));
}
async function review(id,approve,note,item,accept,deny){
 if(operationBusy)return;
 if(!validUuid(id)||!note||note.trim().length<10||note.length>600){
  window.alert('Cần lý do xét duyệt từ 10 đến 600 ký tự.');return;
 }
 if(!window.confirm((approve?'Phê duyệt và tạo tenant':'Từ chối hồ sơ')+' trên STAGING? Đây là thao tác ghi thật và sẽ được ghi audit.'))return;
 operationBusy=true;accept.disabled=deny.disabled=true;
 const reason=t('p','Đang xác minh và ghi nhận quyết định…','bv-live-status');item.append(reason);
 try{
  const result=await reviewWithEvidence({
   isManager:manager,
   getRequest:async requestId=>{
    const x=await client.from('bv_registration_requests').select('id,status,tenant_id').eq('id',requestId).maybeSingle();
    if(x.error)throw Error('REQUEST_READ_DENIED');
    return x.data;
   },
   commit:async ({id,approve,note})=>{
    const x=await client.rpc('bv_review_registration',{p_request_id:id,p_approve:approve,p_note:note});
    if(x.error)throw Error('REVIEW_RPC_DENIED');
    return x.data;
   },
   getReview:async (requestId,expected)=>{
    const x=await client.from('bv_registration_reviews')
       .select('request_id,result,reviewed_at').eq('request_id',requestId).eq('result',expected)
       .order('reviewed_at',{ascending:false}).limit(1);
    if(x.error)throw Error('AUDIT_READ_DENIED');
    return x.data?.[0]||null;
   }
  },{id,approve,note});
  reason.textContent='Đã xác minh: '+result.status+' · '+(result.tenantId?'Tenant: '+result.tenantId:'không tạo tenant');
  await paint(true);
 }catch(_){
  reason.textContent='KHÔNG XÁC NHẬN HOÀN TẤT. Có thể dữ liệu đã thay đổi; làm mới trang và kiểm tra lịch sử trước khi thao tác lại.';
 }finally{operationBusy=false;accept.disabled=deny.disabled=false}
}
async function paint(force=false){
 if(!client||!stillAuthorized())return;
 const viewport=document.getElementById('viewport');
 const route=document.querySelector('.navbtn.on')?.dataset.nav;
 if(!viewport||!LIVE_ROUTES.includes(route)){
  if(route && route!==lastNavRoute){lastNavRoute=route;navState(route)}
  return;
 }
 if(!force&&viewport.dataset.liveOps===route)return;
 const seq=++viewNonce;viewport.dataset.liveOps=route;
 viewport.replaceChildren();
 const content=t('div',null,'bv-live-root');
 viewport.append(content);heading(route,content);status(content,'Đang xác minh vai trò và tải dữ liệu staging…');
 if(route!==lastNavRoute){lastNavRoute=route;navState(route)}
 try{
  if(!await manager())throw Error('PLATFORM_MANAGER_DENIED');
  const records=route==='audit'?await loadReviews():await loadRequests();
  if(seq!==viewNonce||!stillAuthorized()||viewport!==document.getElementById('viewport'))return;
  content.replaceChildren();heading(route,content);
  if(route==='audit')await showAudit(content,records);
  else await showRequests(content,records,route);
 }catch(_){if(seq===viewNonce)status(content,'Không thể đọc dữ liệu hoặc chưa đủ quyền. Giao diện giữ trạng thái khóa; không hiển thị dữ liệu DEMO thay thế.')}
}
export function mountFounderOps(authenticatedClient){
 if(observer)return;
 client=authenticatedClient;
 const style=t('style');
 style.textContent=`
 .bv-live-root{padding:24px;display:grid;gap:14px;color:#162849;font-size:13px}
 .bv-live-head h1{font-size:24px;margin:0 0 7px;font-weight:800}
 .bv-live-muted{color:#607493;line-height:1.65;font-size:12px}
 .bv-live-actions{display:flex;justify-content:flex-end}
 .bv-live-actions button,.bv-live-review button{border-radius:7px;background:#1266e8;color:white;padding:9px 13px;font-weight:700;cursor:pointer}
 .bv-live-panel{padding:20px;background:white;border:1px solid #dbe6f3;border-radius:12px;display:grid;gap:10px}
 .bv-live-panel h2{font-size:17px;margin:0}
 .bv-live-row{display:flex;gap:12px;align-items:start;justify-content:space-between;border-bottom:1px solid #e5ebf5;padding:10px 0;flex-wrap:wrap}
 .bv-live-row strong{min-width:180px;flex:1}.bv-live-row small{color:#59718e;min-width:180px;flex:2}
 .bv-live-pill{background:#ecf3fc;color:#154889;border-radius:16px;padding:5px 10px;font-size:11px;font-weight:750}
 .bv-live-review{width:100%;display:flex;gap:8px;flex-wrap:wrap}.bv-live-review textarea{min-width:240px;flex:1}
 .bv-live-review .bv-live-deny{background:#8f263a}.bv-live-review button:disabled{opacity:.5}
 .bv-live-status{color:#9b4c09;font-weight:650}
 .bv-tenant-dashboard{display:grid;gap:12px}
 .bv-tenant-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
 .bv-tenant-kpi{background:white;border:1px solid #e2eaf5;border-radius:9px;min-height:104px;padding:12px 9px;display:flex;gap:8px;align-items:flex-start}
 .bv-tenant-kpi-icon{display:grid;place-items:center;min-width:28px;height:30px;border-radius:7px;color:#1664d8;background:#eaf3ff;font-size:19px}
 .bv-tenant-kpi:nth-child(1) .bv-tenant-kpi-icon{color:#06a66b;background:#e8faf1}
 .bv-tenant-kpi:nth-child(3) .bv-tenant-kpi-icon{color:#8d4cda;background:#f4eefd}
 .bv-tenant-kpi:nth-child(5) .bv-tenant-kpi-icon{color:#db8524;background:#fff3e8}
 .bv-tenant-kpi-content{display:flex;flex-direction:column;gap:3px;min-width:0}
 .bv-tenant-kpi-label{font-weight:700;font-size:11px}.bv-tenant-kpi-number{font-size:22px;color:#112857}
 .bv-tenant-kpi small{font-size:10px;color:#6780a2;line-height:1.4}
 .bv-tenant-columns{display:grid;grid-template-columns:minmax(0,1.28fr) minmax(300px,1fr);gap:12px;align-items:start}
 .bv-tenant-side{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 .bv-tenant-side>.bv-live-panel:first-child{grid-column:1/-1}
 .bv-tenant-filters{display:flex;gap:8px}.bv-tenant-filters input{flex:1;min-width:0}
 .bv-tenant-filters input,.bv-tenant-filters select{border:1px solid #dbe5f3;border-radius:7px;padding:9px;background:white;color:#234166}
 .bv-tenant-tablewrap{overflow-x:auto}.bv-tenant-table{width:100%;border-collapse:collapse;text-align:left;font-size:11px}
 .bv-tenant-table th{background:#f1f6fd;color:#536c91;font-size:10px;white-space:nowrap}
 .bv-tenant-table td,.bv-tenant-table th{padding:11px 7px;border-bottom:1px solid #e5ecf5}
 .bv-tenant-table tr[role=button]{cursor:pointer}.bv-tenant-selected{background:#edf5ff}
 .bv-tenant-name{font-weight:750;color:#163c78}.bv-tenant-count{color:#677d9c}
 .bv-tenant-detail{display:grid;gap:8px;overflow-wrap:anywhere}.bv-tenant-detail h3{font-size:18px;margin:0}
 .bv-tenant-id{color:#3970c2;font-size:11px}.bv-tenant-unknown{color:#865b19;background:#fff7e9;border-radius:7px;padding:6px;font-weight:700;font-size:10px;justify-self:start}
 @media(max-width:1250px){.bv-tenant-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:850px){.bv-tenant-columns{grid-template-columns:1fr}.bv-tenant-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:520px){.bv-tenant-side{grid-template-columns:1fr}.bv-tenant-side>.bv-live-panel:first-child{grid-column:auto}.bv-tenant-kpis{grid-template-columns:1fr 1fr}.bv-live-root{padding:12px}}

 `;
 document.head.append(style);
 let pending=false;
 observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;paint()})});
 observer.observe(document.getElementById('app'),{subtree:true,childList:true});
 queueMicrotask(()=>paint());
}
