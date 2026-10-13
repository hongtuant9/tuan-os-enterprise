import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const STAGING='oxakhhpyvvymujiwuvnm', base='https://'+STAGING+'.supabase.co';
const APPROVED_OWNER_EMAIL='hongtuant9@gmail.com'; // L3 approval is recorded; this UI never grants a role.
const QA_SCENARIOS=Object.freeze({
 approve:{email:'hongtuant9+bizviora-qa-approve-20261011@gmail.com',name:'BIZVIORA QA Approval 001',contact:'Synthetic Tester A',plan:'TRIAL_7D'},
 reject:{email:'hongtuant9+bizviora-qa-reject-20261011@gmail.com',name:'BIZVIORA QA Rejection 002',contact:'Synthetic Tester B',plan:'CUSTOM_QUOTE'}
});
const qaKey=new URLSearchParams(location.search).get('qa');
let recoveryFlow=(new URLSearchParams(location.search).get('recovery')==='1'||location.hash.includes('type=recovery'));

const qaScenario=Object.prototype.hasOwnProperty.call(QA_SCENARIOS,qaKey)?QA_SCENARIOS[qaKey]:null;
const qaEmails=new Set(Object.values(QA_SCENARIOS).map(s=>s.email));
const isQaUser=()=>qaEmails.has(user?.email?.toLowerCase());
const $=id=>document.getElementById(id);
const screens=['loading','login','register','reset-request','reset-new','owner-wait','application','pending','rejected','manager'];
let client,user,signupEnabled=false,platformManager=false;
function show(id){$('auth-area').style.display=id==='workspace'?'none':'grid';$('workspace').classList.toggle('active',id==='workspace');for(const s of screens)$(s).classList.toggle('active',id===s);$('logout').style.display=['login','register','reset-request','reset-new','loading'].includes(id)||id==='workspace'?'none':'inline-block';$('account-manager').hidden=!(user&&platformManager&&!['manager','workspace','login','register','loading'].includes(id));$('error-box').replaceChildren();}
function feedback(t,error=false){const e=document.createElement('div');e.className='notice'+(error?' error':'');e.textContent=t;$('error-box').replaceChildren(e);}
function failed(code){feedback('Chưa thể xử lý yêu cầu. Vui lòng thử lại hoặc liên hệ BIZVIORA. ('+code+')',true);}
async function currentUser(){const {data,error}=await client.auth.getUser();return error?null:data?.user||null;}
async function refresh(preferManager=(new URLSearchParams(location.search).get('view')==='manager')){
 show('loading');$('portal-frame').removeAttribute('src');
 try{
  user=await currentUser();if(!user){if(qaScenario){show('register');prefillQaRegister();}else show('login');return;}
  const staff=await client.rpc('bv_is_platform_manager');if(staff.error)throw Error('MANAGER_ROLE_UNAVAILABLE');
  platformManager=staff.data===true;
  $('workspace-manager').hidden=!platformManager;
  $('manager-company').hidden=true;
  $('manager-register').hidden=true;
  const {data:applications,error}=await client.from('bv_registration_requests').select('id,business_name,plan_code,status,tenant_id,review_note').eq('applicant_user_id',user.id).limit(1);
  if(error)throw Error('REGISTRATION_LOOKUP_DENIED');
  const r=applications?.[0];
  if(!r){if(platformManager&&preferManager){show('manager');$('manager-register').hidden=false;await reviews();return;}
   if(user.email?.toLowerCase()===APPROVED_OWNER_EMAIL){show('owner-wait');return;}
   show('application');await plans();prefillQaApplication();return;}
  if(r.status==='PENDING'){if(platformManager&&preferManager){show('manager');await reviews();return;}show('pending');$('pending-name').textContent=r.business_name+' · '+r.plan_code+' · Chờ quản lý BIZVIORA xét duyệt';if(isQaUser())setQaRlsPanel('qa-pending-tests','PENDING');return;}
  if(r.status==='REJECTED'){if(platformManager&&preferManager){show('manager');await reviews();return;}show('rejected');$('reject-note').textContent=r.review_note||'Hồ sơ chưa được duyệt. Chưa có quyền truy cập.';if(isQaUser())setQaRlsPanel('qa-rejected-tests','REJECTED');return;}
  if(r.status!=='APPROVED'||!r.tenant_id)throw Error('ACCOUNT_NOT_APPROVED');
  const {data:member,error:me}=await client.from('bv_memberships').select('tenant_id,user_id,role').eq('tenant_id',r.tenant_id).eq('user_id',user.id).single();
  const {data:tenant,error:te}=await client.from('bv_tenants').select('id,name,slug').eq('id',r.tenant_id).single();
  if(me||te||!member||!tenant||member.user_id!==user.id||member.tenant_id!==tenant.id||!['staff','manager','admin','owner'].includes(member.role))throw Error('TENANT_ACCESS_DENIED');
  $('tenant-name').textContent=tenant.name+' · '+member.role;
  if(platformManager&&preferManager){show('manager');$('manager-company').hidden=false;await reviews();return;}
  show('workspace');
  if(isQaUser()){
    $('portal-frame').removeAttribute('src');$('portal-frame').hidden=true;
    $('qa-approved-view').hidden=false;
    setQaApprovedPanel(tenant);
  }else{
    $('qa-approved-view').hidden=true;$('portal-frame').hidden=true;
    $('portal-frame').removeAttribute('src');
    let liveRoot=document.getElementById('bv-live-tenant-root');
    if(!liveRoot){liveRoot=document.createElement('div');liveRoot.id='bv-live-tenant-root';document.getElementById('workspace').append(liveRoot);}
    const {mountTenantWorkspace}=await import('./tenant-workspace.js');
    await mountTenantWorkspace({client,tenant,user,role:member.role,root:liveRoot});
  }
 }catch(e){show('login');failed(e?.message||'STAGING_UNAVAILABLE');}
}

function prefillQaRegister(){
 if(!qaScenario)return;
 $('re-email').value=qaScenario.email;
 $('register-submit').disabled=false;
 const c=$('qa-register-context');c.hidden=false;
 c.textContent='STAGING QA — '+(qaScenario.plan==='TRIAL_7D'?'CASE A: PHÊ DUYỆT':'CASE B: TỪ CHỐI')+'. Email thử nghiệm riêng; hãy tự đặt mật khẩu và xác minh email. Không dùng thông tin kinh doanh thật.';
}
function prefillQaApplication(){
 const entry=Object.values(QA_SCENARIOS).find(x=>x.email===user?.email?.toLowerCase());
 if(!entry)return;
 $('business-name').value=entry.name;
 $('contact-name').value=entry.contact;
 $('plan').value=entry.plan;
}
function qaElement(tag,text,classname){
 const e=document.createElement(tag);if(text)e.textContent=text;if(classname)e.className=classname;return e;
}
function setQaRlsPanel(id,expected){
 const area=$(id);if(!area)return;
 area.hidden=false;area.replaceChildren();
 area.append(qaElement('p','STAGING QA — JWT/RLS check (chỉ đọc dữ liệu, không đổi quyền).','intro'));
 const btn=qaElement('button','Kiểm tra cách ly tenant bằng phiên đăng nhập này','secondary');
 const result=qaElement('div','','notice');result.textContent='Chưa chạy kiểm thử phiên Auth/JWT trên trình duyệt.';
 btn.onclick=async()=>{btn.disabled=true;try{await runQaRlsCheck(result,expected)}finally{btn.disabled=false}};
 area.append(btn,result);
}
function setQaApprovedPanel(tenant){
 const area=$('qa-approved-view');area.replaceChildren();
 area.append(qaElement('h2','Tenant QA đã được duyệt (dữ liệu staging)'));
 area.append(qaElement('p','Tên: '+tenant.name+' · Mã: '+tenant.slug));
 area.append(qaElement('p','Giao diện demo TUAN-OS được ẩn đối với tenant QA để tránh nhầm dữ liệu giả lập với quyền thật.','intro'));
 const section=qaElement('div');section.id='qa-approved-tests';area.append(section);
 setQaRlsPanel('qa-approved-tests','APPROVED');
}
async function runQaRlsCheck(out,expected){
 out.replaceChildren(qaElement('p','Đang kiểm tra Supabase Auth/JWT và RLS…'));
 try{
  const auth=await client.auth.getUser();
  if(auth.error||!auth.data?.user)throw Error('AUTH_REQUIRED');
  const a=auth.data.user;
  const email=a.email?.toLowerCase();
  if(!qaEmails.has(email)||!a.email_confirmed_at)throw Error('QA_EMAIL_NOT_VERIFIED');
  const results=await Promise.all([
   client.rpc('bv_is_platform_manager'),
   client.from('bv_tenants').select('id,slug,name').limit(20),
   client.from('bv_memberships').select('tenant_id,user_id,role').limit(20),
   client.from('bv_registration_requests').select('id,applicant_user_id,tenant_id,status').limit(20),
   client.from('bv_registration_reviews').select('request_id').limit(20),
   client.from('bv_tenants').select('id').eq('slug','tuan-os-enterprise-001')
  ]);
  if(results.some(x=>x.error))throw Error('RLS_READ_ERROR');
  const [role,tenants,members,requests,audits,foreign]=results.map(x=>x.data);
  const oneRequest=requests.length===1&&requests[0].applicant_user_id===a.id;
  const ownTenant=expected==='APPROVED'
    ?(tenants.length===1&&requests[0]?.tenant_id===tenants[0]?.id&&members.length===1
       &&members[0].tenant_id===tenants[0].id&&members[0].user_id===a.id&&members[0].role==='owner')
    :(tenants.length===0&&members.length===0&&requests[0]?.tenant_id===null);
  const assertions=[
   ['Email QA đã xác minh',true],
   ['Không có quyền Platform Manager',role===false],
   ['Không đọc được tenant TUAN-OS 001',foreign.length===0],
   ['Không đọc được audit của Platform Manager',audits.length===0],
   ['Chỉ thấy hồ sơ của chính mình',oneRequest],
   ['Trạng thái '+expected,oneRequest&&requests[0].status===expected],
   ['Membership và tenant đúng phạm vi',oneRequest&&ownTenant]
  ];
  out.replaceChildren();
  for(const [label,pass] of assertions){
   const line=qaElement('p',(pass?'PASS · ':'FAIL · ')+label);
   line.style.color=pass?'#146c43':'#aa2238';
   out.append(line);
  }
  const passed=assertions.every(x=>x[1]);
  const summary=qaElement('strong',passed?'JWT/RLS browser check: '+assertions.length+'/'+assertions.length+' PASS':'JWT/RLS browser check: FAIL — KHÔNG mở dữ liệu thật.');
  out.prepend(summary);
 }catch(_){
  out.replaceChildren(qaElement('strong','HOLD — không xác minh được JWT/RLS. Không khẳng định PASS.','error'));
 }
}

async function plans(){const {data,error}=await client.from('bv_service_plans').select('code,label').eq('enabled',true);if(error){failed('PLANS_UNAVAILABLE');return;}const opts=(data||[]).map(p=>new Option(p.label,p.code));$('plan').replaceChildren(new Option('Chọn gói dịch vụ',''),...opts);}
async function loadReviewAudit(){
 const out=$('review-audit');out.replaceChildren();
 const {data,error}=await client.from('bv_registration_reviews')
  .select('request_id,result,note,reviewed_at,reviewer_user_id')
  .order('reviewed_at',{ascending:false}).limit(30);
 if(error){failed('AUDIT_READ_DENIED');return false;}
 if(!data?.length){const empty=document.createElement('p');empty.textContent='Chưa có quyết định nào được ghi nhận.';out.append(empty);return true;}
 const ids=[...new Set(data.map(x=>x.request_id))];
 const {data:requests,error:lookupError}=await client.from('bv_registration_requests')
  .select('id,business_name').in('id',ids);
 if(lookupError){failed('AUDIT_REQUEST_LOOKUP_DENIED');return false;}
 const labels=new Map((requests||[]).map(r=>[r.id,r.business_name]));
 for(const a of data){
  const item=document.createElement('div');item.className='row';
  const title=document.createElement('strong');
  title.textContent=(a.result==='APPROVED'?'ĐÃ DUYỆT':a.result==='REJECTED'?'ĐÃ TỪ CHỐI':a.result)+' · '+(labels.get(a.request_id)||'Hồ sơ không còn truy cập');
  const note=document.createElement('small');
  note.textContent=(a.reviewed_at?new Date(a.reviewed_at).toLocaleString('vi-VN')+' · ':'')+
    (a.note||'Không có ghi chú')+' · Ref '+String(a.request_id).slice(0,8);
  item.append(title,note);out.append(item);
 }
 return true;
}
async function reviews(){
 const role=await client.rpc('bv_is_platform_manager');if(role.error||role.data!==true){show('login');failed('MANAGER_ROLE_DENIED');return;}
 const {data,error}=await client.from('bv_registration_requests').select('id,business_name,contact_name,plan_code,created_at').eq('status','PENDING').order('created_at').limit(50);
 if(error){failed('REVIEW_LIST_DENIED');return;}
 if(!await loadReviewAudit())return;
 const list=$('requests');list.replaceChildren();
 if(!data?.length){const p=document.createElement('p');p.textContent='Chưa có yêu cầu mới.';list.append(p);return;}
 for(const r of data){const item=document.createElement('div');item.className='row';
  const name=document.createElement('strong');name.textContent=r.business_name;
  const details=document.createElement('small');details.textContent=r.contact_name+' · '+r.plan_code+' · '+new Date(r.created_at).toLocaleString('vi-VN');
  const acts=document.createElement('div');acts.className='actions';
  for(const [caption,accept] of [['Phê duyệt',true],['Từ chối',false]]){const b=document.createElement('button');b.className='secondary';b.textContent=caption;b.onclick=async()=>{
    if(!confirm((accept?'Phê duyệt':'Từ chối')+' '+r.business_name+'?'))return;
    const note=prompt('Ghi chú (tối đa 600 ký tự):','');if(note===null)return;if(note.length>600){failed('NOTE_TOO_LONG');return;}
    const {error}=await client.rpc('bv_review_registration',{p_request_id:r.id,p_approve:accept,p_note:note});
    if(error){failed('REVIEW_NOT_ALLOWED');return;}await reviews();feedback('Đã ghi nhận quyết định xét duyệt.');};acts.append(b);}
  item.append(name,details,acts);list.append(item);
 }
}
async function signout(){
 $('portal-frame').removeAttribute('src');if(client)await client.auth.signOut();user=null;platformManager=false;show('login');
}
$('show-reset').onclick=()=>{$('reset-email').value=$('li-email').value.trim();show('reset-request');};
$('reset-back').onclick=()=>show('login');
$('reset-request-form').onsubmit=async e=>{e.preventDefault();if(!client){failed('UNCONFIGURED');return;}const email=$('reset-email').value.trim();const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/account/?recovery=1'});if(error){failed('PASSWORD_RESET_UNAVAILABLE');return;}show('login');feedback('Nếu email có tài khoản hợp lệ, hệ thống sẽ gửi liên kết đặt lại mật khẩu. Kiểm tra Inbox/Spam.');};
$('reset-new-form').onsubmit=async e=>{e.preventDefault();if(!client||!recoveryFlow){failed('RECOVERY_SESSION_REQUIRED');return;}const password=$('reset-password').value,verify=$('reset-confirm').value;if(password!==verify||password.length<12){failed('PASSWORD_INVALID');return;}const {error}=await client.auth.updateUser({password});$('reset-password').value='';$('reset-confirm').value='';if(error){failed('PASSWORD_UPDATE_DENIED');return;}recoveryFlow=false;history.replaceState({},'',location.pathname);await client.auth.signOut();show('login');feedback('Mật khẩu đã cập nhật. Vui lòng đăng nhập lại.');};
$('show-register').onclick=()=>show('register');$('show-login').onclick=()=>show('login');
$('owner-refresh').onclick=()=>refresh(false);
$('re-email').addEventListener('input',()=>{$('register-submit').disabled=!signupEnabled&&!qaEmails.has($('re-email').value.trim().toLowerCase())&&$('re-email').value.trim().toLowerCase()!==APPROVED_OWNER_EMAIL;});
$('logout').onclick=signout;$('workspace-logout').onclick=signout;$('refresh').onclick=()=>refresh();$('manager-refresh').onclick=reviews;
$('workspace-manager').onclick=()=>location.assign('/founder-v2/');$('manager-company').onclick=()=>refresh(false);$('manager-register').onclick=async()=>{if(!platformManager)return;show('application');await plans();};
$('account-manager').onclick=()=>location.assign('/founder-v2/');
$('google-login').onclick=async()=>{
 if(!client){failed('UNCONFIGURED');return;}
 // OAuth authenticates identity only; every manager/tenant grant remains backend RLS/RPC controlled.
 const button=$('google-login');button.disabled=true;
 try{
  const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/account/'}});
  if(error)failed('GOOGLE_OAUTH_UNAVAILABLE');
 }catch{failed('GOOGLE_OAUTH_UNAVAILABLE');}
 finally{button.disabled=false;}
};
$('login-form').onsubmit=async e=>{e.preventDefault();if(!client){failed('UNCONFIGURED');return;}const email=$('li-email').value.trim(),password=$('li-password').value;const {error}=await client.auth.signInWithPassword({email,password});$('li-password').value='';if(error){failed(error.code==='invalid_credentials'?'INVALID_LOGIN_CREDENTIALS':error.code==='email_not_confirmed'?'EMAIL_NOT_CONFIRMED':'AUTH_SIGNIN_UNAVAILABLE');return;}await refresh();};
$('register-form').onsubmit=async e=>{e.preventDefault();const email=$('re-email').value.trim(),password=$('re-password').value;
 if(!signupEnabled&&email.toLowerCase()!==APPROVED_OWNER_EMAIL&&!qaEmails.has(email.toLowerCase())){failed('PUBLIC_REGISTRATION_GATE_HOLD');return;}
 // This is a self-serve identity verification request only; it DOES NOT grant a company or manager permission.
 if(password!==$('re-repeat').value){failed('PASSWORD_MISMATCH');return;}if(password.length<12){failed('PASSWORD_TOO_SHORT');return;}
 const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
 $('re-password').value='';$('re-repeat').value='';
 if(error){failed('SIGNUP_UNAVAILABLE');return;}if(data.session){await refresh();return;}
 show('login');feedback('Hãy xác minh email, sau đó quay lại đăng nhập để hoàn tất hồ sơ doanh nghiệp.');
};
$('app-form').onsubmit=async e=>{e.preventDefault();if(!user){failed('AUTH_REQUIRED');return;}const record={applicant_user_id:user.id,business_name:$('business-name').value.trim(),contact_name:$('contact-name').value.trim(),plan_code:$('plan').value,status:'PENDING'};
 const {error}=await client.from('bv_registration_requests').insert(record);if(error){failed('APPLICATION_SAVE_DENIED');return;}await refresh();};
(async()=>{
 try{
  const response=await fetch(base+'/functions/v1/bv-public-config',{cache:'no-store'});
  if(!response.ok)throw Error('CONFIG_UNAVAILABLE');
  const c=await response.json();
  if(c?.supabaseUrl!==base||typeof c?.publishableKey!=='string'||c.publishableKey.length<25)throw Error('CONFIG_INVALID');
  signupEnabled=c.signupEnabled===true;
  client=createClient(c.supabaseUrl,c.publishableKey,{auth:{persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true}});
  // Fail closed: do not offer OAuth while staging provider is unconfigured or settings cannot be verified.
  const googleButton=$('google-login');googleButton.disabled=true;googleButton.hidden=true;
  try{
   const settingsResponse=await fetch(base+'/auth/v1/settings',{headers:{apikey:c.publishableKey},cache:'no-store'});
   if(settingsResponse.ok){const settings=await settingsResponse.json();if(settings?.external?.google===true){googleButton.disabled=false;googleButton.hidden=false;}}
  }catch{ /* Stay disabled; password login remains available. */ }
  $('register-submit').disabled=!signupEnabled&&!qaScenario;
  if(!signupEnabled){const w=document.createElement('div');w.className='notice warn';w.textContent='Biểu mẫu staging chỉ hỗ trợ email chủ sở hữu và 2 alias QA chỉ định. Đây là giới hạn giao diện, KHÔNG phải khóa API Auth ở backend. Đăng ký không cấp quyền tenant hoặc Platform Manager; chưa mở khách hàng thật.';$('register').append(w);}
  if(recoveryFlow){const {data}=await client.auth.getSession();if(data?.session){show('reset-new');}else{show('reset-request');feedback('Liên kết khôi phục chưa được xác thực hoặc đã hết hạn.',true);}}else await refresh();
  client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recoveryFlow=true;show('reset-new');}if(event==='SIGNED_OUT'){$('portal-frame').removeAttribute('src');user=null;show('login');}});
 }catch{show('login');$('login-form').querySelector('button').disabled=true;$('show-register').disabled=true;failed('STAGING_CONFIG_NOT_READY');}
})();
