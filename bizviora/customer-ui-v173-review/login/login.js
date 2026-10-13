import {customerClient,authorizedCustomer} from '../auth-client.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const form=$('login-form'),button=$('submit'),status=$('status');
const setStatus=(m,ok=false)=>{status.textContent=m;status.classList.toggle('ok',ok)};
let client;
async function enterCustomer(){
 const r=await authorizedCustomer(client);
 if(!r.ok){
   setStatus(r.reason==='TENANT_DENIED'
     ? 'Tài khoản không thuộc doanh nghiệp TUAN OS đã được phê duyệt. Không thể mở dashboard TUAN OS.'
     : 'Chưa có phiên đăng nhập hợp lệ.');
   return false;
 }
 location.replace('/');
 return true;
}
(async()=>{
 try{
  client=await customerClient();
  if(params.get('signed_out')==='1')setStatus('Đã đăng xuất khỏi doanh nghiệp.',true);
  else if(params.get('reason')==='tenant')setStatus('Tài khoản không được phép truy cập dashboard TUAN OS.');
  else if(params.get('reason')==='session')setStatus('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  const {data}=await client.auth.getUser();
  if(data?.user && !params.has('signed_out'))await enterCustomer();
 }catch(_){button.disabled=true;setStatus('Không kết nối được hệ thống xác thực staging. Vui lòng thử lại sau.')}
})();
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(!client)return;
 button.disabled=true;setStatus('Đang xác minh tài khoản…',true);
 const email=$('email').value.trim(),password=$('password').value;
 try{
  const {error}=await client.auth.signInWithPassword({email,password});
  $('password').value='';
  if(error){setStatus('Email hoặc mật khẩu không hợp lệ, hoặc tài khoản chưa được xác nhận.');return}
  await enterCustomer();
 }catch(_){$('password').value='';setStatus('Không thể hoàn tất đăng nhập staging. Vui lòng thử lại sau.')}
 finally{button.disabled=false}
});
