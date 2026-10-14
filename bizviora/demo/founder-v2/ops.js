import {LIVE_ROUTES,businessRows,reviewWithEvidence,validUuid} from './ops-review.mjs';

const LABEL={tenants:'Doanh nghiệp — Staging',onboarding:'Đăng ký và kích hoạt tenant',approvals:'Xét duyệt doanh nghiệp',audit:'Nhật ký xét duyệt'};
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
  const s=section(root,'Doanh nghiệp được phê duyệt ('+approved.length+')',
    'Danh sách suy ra từ hồ sơ đăng ký đã duyệt. Chưa có quyền liệt kê toàn bộ bv_tenants; doanh nghiệp có từ trước có thể không xuất hiện.');
  if(!approved.length)add(s,t('p','Không có hồ sơ doanh nghiệp đã duyệt trong danh sách truy vấn.'));
  for(const r of approved)row(s,r.name||'Doanh nghiệp', 'Gói: '+(r.plan||'—')+' · Tenant: '+r.tenant_id+' · '+shortDate(r.reviewed_at),'Tenant đã tạo');
  const warning=section(root,'Giới hạn vận hành','Các tenant tạo qua RPC đã có membership owner. Customer App hiện mới hỗ trợ dashboard TUAN OS; chưa được công bố dashboard cho tenant mới.');
  add(warning,t('p','Kích hoạt giao diện riêng, kết nối nghiệp vụ và gửi thông báo khách hàng cần quy trình QA và phê duyệt khác.'));
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
 `;
 document.head.append(style);
 let pending=false;
 observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;paint()})});
 observer.observe(document.getElementById('app'),{subtree:true,childList:true});
 queueMicrotask(()=>paint());
}
