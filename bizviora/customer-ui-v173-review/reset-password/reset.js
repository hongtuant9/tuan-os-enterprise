import {customerClient} from '../auth-client.js';
const $=id=>document.getElementById(id);
const form=$('reset-form'),send=$('reset-submit'),status=$('status');
const params=new URLSearchParams(location.search);
const hashParams=new URLSearchParams(location.hash.slice(1));
const hasRecoveryMarker=params.has('code')||hashParams.get('type')==='recovery';
let client,allowed=false;
const show=(message,ok=false)=>{status.textContent=message;status.classList.toggle('ok',ok)};
(async()=>{
 if(!hasRecoveryMarker){
  show('Liên kết không hợp lệ hoặc thiếu mã khôi phục. Hãy yêu cầu liên kết mới từ trang đăng nhập.');
  return;
 }
 try{
  client=await customerClient();
  const {data,error}=await client.auth.getSession();
  if(error||!data?.session)throw Error('RECOVERY_SESSION_NOT_READY');
  const checked=await client.auth.getUser();
  if(checked.error||!checked.data?.user)throw Error('RECOVERY_USER_NOT_VERIFIED');
  allowed=true;
  form.hidden=false;show('Đã xác minh liên kết. Vui lòng đặt mật khẩu mới.',true);
 }catch(_){
  show('Không thể xác minh liên kết. Liên kết có thể đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu gửi lại.');
 }
})();
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!client||!allowed)return;
 const password=$('new-password').value;
 const confirm=$('confirm-password').value;
 if(password.length<12||password!==confirm){show('Mật khẩu phải có ít nhất 12 ký tự và hai lần nhập phải trùng nhau.');return}
 send.disabled=true;show('Đang cập nhật mật khẩu…',true);
 try{
  const {error}=await client.auth.updateUser({password});
  if(error){show('Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn.');return}
  allowed=false;$('new-password').value='';$('confirm-password').value='';
  form.hidden=true;
  await client.auth.signOut({scope:'local'});
  location.replace('/login/?reset_done=1');
 }catch(_){show('Không cập nhật được mật khẩu. Vui lòng yêu cầu liên kết mới.')}
 finally{send.disabled=false}
});
