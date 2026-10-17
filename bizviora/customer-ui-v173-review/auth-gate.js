import {customerClient,authorizedCustomer} from './auth-client.js';
import {mountVerifiedSettings} from './verified-settings-view.mjs';
const wall=document.getElementById('bv-auth-verification');
const logout=document.getElementById('bv-customer-logout');
let verified=false;
const failClosed=(message,reason)=>{
  document.documentElement.classList.remove('bv-customer-authorized');
  wall.hidden=false;wall.textContent=message;
  const a=document.createElement('a');a.href='/login/?reason='+encodeURIComponent(reason);a.textContent=' Về trang đăng nhập';wall.append(a);
};
(async()=>{
 try{
  const client=await customerClient();
  const access=await authorizedCustomer(client);
  if(!access.ok){location.replace('/login/?reason='+ (access.reason==='TENANT_DENIED'?'tenant':'session'));return}
  verified=true;
  document.documentElement.classList.add('bv-customer-authorized');
  wall.hidden=true;
  const profile=document.querySelector('.profile');
  if(profile){
    const name=profile.querySelector('strong');
    const role=profile.querySelector('small');
    if(name)name.textContent=access.user.user_metadata?.full_name||access.user.email||'Nhân viên';
    if(role)role.textContent=access.role+' · '+access.tenant.name;
  }
  // Settings is real-source-only. Every rerender starts a fresh RLS read.
  // Staging is still the OLD Supabase source until the separately approved migration.
  const loadSettings=()=>{
    const container=document.getElementById('biz2-verified-settings');
    if(container)void mountVerifiedSettings({container,client,access});
  };
  window.addEventListener('bizviora:settings-present',loadSettings);
  if(document.body.dataset.screen==='settings')loadSettings();
  logout.disabled=false;
  logout.addEventListener('click',async()=>{
    logout.disabled=true;
    document.documentElement.classList.remove('bv-customer-authorized');
    wall.hidden=false;wall.textContent='Đang đăng xuất…';
    try{await client.auth.signOut({scope:'local'})}catch(_){}
    location.replace('/login/?signed_out=1');
  });
  client.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT' && verified){verified=false;location.replace('/login/?signed_out=1')}
  });
 }catch(_){failClosed('Không thể xác minh quyền truy cập staging. Dashboard đã khóa.','session')}
})();
