import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const PROJECT='oxakhhpyvvymujiwuvnm';
const BASE='https://'+PROJECT+'.supabase.co';
const $=id=>document.getElementById(id);
const form=$('reset-form'),status=$('status'),submit=$('reset-submit');
let recoveryClient=null,verified=false,publishableKey=null;
const show=(text,ok=false)=>{status.textContent=text;status.classList.toggle('ok',ok)};
async function getConfig(){
 const r=await fetch(BASE+'/functions/v1/bv-public-config',{cache:'no-store'});
 if(!r.ok)throw Error('CONFIG_UNAVAILABLE');
 const v=await r.json();
 if(v.supabaseUrl!==BASE||typeof v.publishableKey!=='string'||v.publishableKey.length<25)
  throw Error('CONFIG_INVALID');
 return v.publishableKey;
}
(async()=>{
 const search=new URLSearchParams(location.search);
 const hash=new URLSearchParams(location.hash.slice(1));
 const code=search.get('code');
 const tokenHash=search.get('token_hash');
 const error=search.get('error_code')||hash.get('error_code');
 const isImplicit=hash.get('type')==='recovery'&&!!hash.get('access_token')&&!!hash.get('refresh_token');
 const isOtp=search.get('type')==='recovery'&&!!tokenHash;
 const isCode=search.get('type')==='recovery'&&!!code;
 // Erase all recovery credentials from the address bar before network requests.
 if(location.search||location.hash)history.replaceState({},'',location.pathname);
 if(error||(!isImplicit&&!isOtp&&!isCode)){
  show('Liên kết khôi phục không hợp lệ, đã hết hạn hoặc không có mã xác nhận. Vui lòng yêu cầu gửi email mới từ trang Founder.');
  return;
 }
 try{
  publishableKey=await getConfig();
  recoveryClient=createClient(BASE,publishableKey,{
   auth:{persistSession:false,detectSessionInUrl:false,autoRefreshToken:false,
    storageKey:'bv-founder-staging-recovery-only'}
  });
  let x;
  if(isImplicit)x=await recoveryClient.auth.setSession({
   access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')
  });
  else if(isOtp)x=await recoveryClient.auth.verifyOtp({type:'recovery',token_hash:tokenHash});
  else x=await recoveryClient.auth.exchangeCodeForSession(code);
  if(x.error||!x.data?.session)throw Error('RECOVERY_SESSION_INVALID');
  const user=await recoveryClient.auth.getUser();
  if(user.error||!user.data?.user)throw Error('RECOVERY_IDENTITY_INVALID');
  verified=true;form.hidden=false;show('Liên kết hợp lệ. Hãy nhập mật khẩu mới.',true);
 }catch(_){
  verified=false;form.hidden=true;
  show('Không xác minh được liên kết khôi phục. Vui lòng gửi lại yêu cầu từ trang Founder.');
 }
})();
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!recoveryClient||!verified)return;
 const password=$('new-password').value;
 const confirm=$('confirm-password').value;
 if(password.length<12||password!==confirm){
  show('Mật khẩu phải có ít nhất 12 ký tự và hai lần nhập phải giống nhau.');return;
 }
 submit.disabled=true;show('Đang cập nhật mật khẩu…',true);
 try{
  const changed=await recoveryClient.auth.updateUser({password});
  if(changed.error)throw Error('PASSWORD_UPDATE_FAILED');
  verified=false;form.hidden=true;
  $('new-password').value='';$('confirm-password').value='';
  const global=await recoveryClient.auth.signOut({scope:'global'});
  // Explicitly clear the pre-existing Founder session in this origin/browser.
  let localCleared=false;
  try{
   const normal=createClient(BASE,publishableKey,{
    auth:{persistSession:true,storage:sessionStorage,autoRefreshToken:false,detectSessionInUrl:false}
   });
   const local=await normal.auth.signOut({scope:'local'});
   localCleared=!local.error;
  }catch(_){}
  if(global.error||!localCleared){
   show('Mật khẩu đã cập nhật nhưng chưa xác nhận được việc đăng xuất tất cả các phiên. Hãy đóng các phiên khác và liên hệ hỗ trợ.');
   return;
  }
  location.replace('/founder/?reset_done=1');
 }catch(_){
  show('Chưa cập nhật được mật khẩu. Vui lòng yêu cầu liên kết mới.');
 }finally{submit.disabled=false}
});
