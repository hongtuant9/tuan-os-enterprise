import {customerClient,isolatedRecoveryClient} from '../auth-client.js';
const $=id=>document.getElementById(id);
const form=$('reset-form'),send=$('reset-submit'),status=$('status');
let client,verifiedRecovery=false;
const show=(text,ok=false)=>{status.textContent=text;status.classList.toggle('ok',ok)};
(async()=>{
 const query=new URLSearchParams(location.search);
 const fragment=new URLSearchParams(location.hash.slice(1));
 const hashType=fragment.get('type');
 const directType=query.get('type');
 const accessToken=fragment.get('access_token');
 const refreshToken=fragment.get('refresh_token');
 const tokenHash=query.get('token_hash');
 const code=query.get('code');
 // Remove link contents from the browser address bar before any API request.
 if(location.search||location.hash)history.replaceState({},'',location.pathname);
 const isImplicit=hashType==='recovery'&&!!accessToken&&!!refreshToken;
 const isOtp=directType==='recovery'&&!!tokenHash;
 const isCode=!!code&&!tokenHash&&!accessToken;
 if(!isImplicit&&!isOtp&&!isCode){
  show('Liên kết không hợp lệ hoặc thiếu mã khôi phục. Hãy yêu cầu liên kết mới từ trang đăng nhập.');
  return;
 }
 try{
  client=await isolatedRecoveryClient();
  let exchange;
  if(isImplicit)exchange=await client.auth.setSession({
   access_token:accessToken,refresh_token:refreshToken
  });
  else if(isOtp)exchange=await client.auth.verifyOtp({
   type:'recovery',token_hash:tokenHash
  });
  else exchange=await client.auth.exchangeCodeForSession(code);
  if(exchange.error||!exchange.data?.session)throw Error('RECOVERY_EXCHANGE_FAILED');
  const checked=await client.auth.getUser();
  if(checked.error||!checked.data?.user)throw Error('RECOVERY_VERIFICATION_FAILED');
  verifiedRecovery=true;form.hidden=false;
  show('Liên kết khôi phục hợp lệ. Vui lòng đặt mật khẩu mới.',true);
 }catch(_){
  show('Không xác minh được liên kết. Link có thể đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu gửi lại.');
 }
})();
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!client||!verifiedRecovery)return;
 const password=$('new-password').value;
 const confirm=$('confirm-password').value;
 if(password.length<12||password!==confirm){
  show('Mật khẩu cần ít nhất 12 ký tự và hai lần nhập phải giống nhau.');return;
 }
 send.disabled=true;show('Đang cập nhật mật khẩu…',true);
 try{
  const {error}=await client.auth.updateUser({password});
  if(error)throw Error('PASSWORD_UPDATE_DENIED');
  verifiedRecovery=false;form.hidden=true;
  $('new-password').value='';$('confirm-password').value='';
  const revoked=await client.auth.signOut({scope:'global'});
  // Do not reuse an older dashboard session in this browser after recovery.
  let localCleared=false;
  try{
    const customer=await customerClient();
    const result=await customer.auth.signOut({scope:'local'});
    localCleared=!result.error;
  }catch(_){}
  if(revoked.error||!localCleared){
    show('Mật khẩu đã thay đổi, nhưng chưa xác nhận được việc kết thúc tất cả phiên đăng nhập. Vui lòng đăng xuất khỏi các thiết bị và liên hệ hỗ trợ.');
    return;
  }
  location.replace('/login/?reset_done=1');
 }catch(_){
  show('Chưa cập nhật được mật khẩu. Vui lòng yêu cầu một liên kết mới.');
 }finally{send.disabled=false}
});
