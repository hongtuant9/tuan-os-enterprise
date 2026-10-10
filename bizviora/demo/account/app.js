import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const STAGING='oxakhhpyvvymujiwuvnm', base='https://'+STAGING+'.supabase.co';
const $=id=>document.getElementById(id);
const screens=['loading','login','register','application','pending','rejected','manager'];
let client,user,signupEnabled=false,platformManager=false;
function show(id){$('auth-area').style.display=id==='workspace'?'none':'grid';$('workspace').classList.toggle('active',id==='workspace');for(const s of screens)$(s).classList.toggle('active',id===s);$('logout').style.display=['login','register','loading'].includes(id)||id==='workspace'?'none':'inline-block';$('error-box').replaceChildren();}
function feedback(t,error=false){const e=document.createElement('div');e.className='notice'+(error?' error':'');e.textContent=t;$('error-box').replaceChildren(e);}
function failed(code){feedback('Chưa thể xử lý yêu cầu. Vui lòng thử lại hoặc liên hệ BIZVIORA. ('+code+')',true);}
async function currentUser(){const {data,error}=await client.auth.getUser();return error?null:data?.user||null;}
async function refresh(preferManager=false){
 show('loading');$('portal-frame').removeAttribute('src');
 try{
  user=await currentUser();if(!user){show('login');return;}
  const staff=await client.rpc('bv_is_platform_manager');if(staff.error)throw Error('MANAGER_ROLE_UNAVAILABLE');
  platformManager=staff.data===true;
  $('workspace-manager').hidden=!platformManager;
  $('manager-company').hidden=true;
  $('manager-register').hidden=true;
  const {data:applications,error}=await client.from('bv_registration_requests').select('id,business_name,plan_code,status,tenant_id,review_note').eq('applicant_user_id',user.id).limit(1);
  if(error)throw Error('REGISTRATION_LOOKUP_DENIED');
  const r=applications?.[0];
  if(!r){if(platformManager&&preferManager){show('manager');$('manager-register').hidden=false;await reviews();return;}show('application');await plans();return;}
  if(r.status==='PENDING'){if(platformManager&&preferManager){show('manager');await reviews();return;}show('pending');$('pending-name').textContent=r.business_name+' · '+r.plan_code+' · Chờ quản lý BIZVIORA xét duyệt';return;}
  if(r.status==='REJECTED'){if(platformManager&&preferManager){show('manager');await reviews();return;}show('rejected');$('reject-note').textContent=r.review_note||'Hồ sơ chưa được duyệt. Chưa có quyền truy cập.';return;}
  if(r.status!=='APPROVED'||!r.tenant_id)throw Error('ACCOUNT_NOT_APPROVED');
  const {data:member,error:me}=await client.from('bv_memberships').select('tenant_id,user_id,role').eq('tenant_id',r.tenant_id).eq('user_id',user.id).single();
  const {data:tenant,error:te}=await client.from('bv_tenants').select('id,name').eq('id',r.tenant_id).single();
  if(me||te||!member||!tenant||member.user_id!==user.id||member.tenant_id!==tenant.id||!['staff','manager','admin','owner'].includes(member.role))throw Error('TENANT_ACCESS_DENIED');
  $('tenant-name').textContent=tenant.name+' · '+member.role;
  if(platformManager&&preferManager){show('manager');$('manager-company').hidden=false;await reviews();return;}
  show('workspace');
  $('portal-frame').src='./customer-v176/template.html';
 }catch(e){show('login');failed(e?.message||'STAGING_UNAVAILABLE');}
}
async function plans(){const {data,error}=await client.from('bv_service_plans').select('code,label').eq('enabled',true);if(error){failed('PLANS_UNAVAILABLE');return;}const opts=(data||[]).map(p=>new Option(p.label,p.code));$('plan').replaceChildren(new Option('Chọn gói dịch vụ',''),...opts);}
async function reviews(){
 const role=await client.rpc('bv_is_platform_manager');if(role.error||role.data!==true){show('login');failed('MANAGER_ROLE_DENIED');return;}
 const {data,error}=await client.from('bv_registration_requests').select('id,business_name,contact_name,plan_code,created_at').eq('status','PENDING').order('created_at').limit(50);
 if(error){failed('REVIEW_LIST_DENIED');return;}
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
$('show-register').onclick=()=>show('register');$('show-login').onclick=()=>show('login');
$('logout').onclick=signout;$('workspace-logout').onclick=signout;$('refresh').onclick=()=>refresh();$('manager-refresh').onclick=reviews;
$('workspace-manager').onclick=()=>refresh(true);$('manager-company').onclick=()=>refresh(false);$('manager-register').onclick=async()=>{if(!platformManager)return;show('application');await plans();};
$('login-form').onsubmit=async e=>{e.preventDefault();if(!client){failed('UNCONFIGURED');return;}const email=$('li-email').value.trim(),password=$('li-password').value;const {error}=await client.auth.signInWithPassword({email,password});$('li-password').value='';if(error){failed('LOGIN_FAILED_OR_EMAIL_NOT_VERIFIED');return;}await refresh();};
$('register-form').onsubmit=async e=>{e.preventDefault();if(!signupEnabled){failed('REGISTRATION_GATE_HOLD');return;}const email=$('re-email').value.trim(),password=$('re-password').value;
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
  $('register-submit').disabled=!signupEnabled;
  if(!signupEnabled){const w=document.createElement('div');w.className='notice warn';w.textContent='Đăng ký người dùng bên ngoài đang tạm khóa để nghiệm thu bảo mật. Chỉ tài khoản thử nghiệm đã được ủy quyền mới đăng nhập.';$('register').append(w);}
  await refresh();
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){$('portal-frame').removeAttribute('src');user=null;show('login');}});
 }catch{show('login');$('login-form').querySelector('button').disabled=true;$('show-register').disabled=true;failed('STAGING_CONFIG_NOT_READY');}
})();
