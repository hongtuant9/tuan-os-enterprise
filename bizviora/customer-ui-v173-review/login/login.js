import {customerClient,authorizedCustomer} from '../auth-client.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const form=$('login-form'),button=$('submit'),status=$('status');
const google=$('google-login'),resetForm=$('reset-request-form'),resetSend=$('reset-send');
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

$('show-reset').onclick=e=>{e.preventDefault();form.hidden=true;google.hidden=true;resetForm.hidden=false;$('show-reset').hidden=true;$('reset-back').hidden=false;$('reset-email').value=$('email').value.trim();setStatus('')};
$('reset-back').onclick=e=>{e.preventDefault();form.hidden=false;google.hidden=false;resetForm.hidden=true;$('show-reset').hidden=false;$('reset-back').hidden=true;setStatus('')};

google.addEventListener('click', async () => {
  if (!client) return;
  google.disabled=true; setStatus('Đang chuyển tới Google để xác thực…',true);
  try {
    const {error}=await client.auth.signInWithOAuth({
      provider:'google',
      options:{redirectTo:location.origin+'/login/'}
    });
    if(error) setStatus('Không thể kết nối Google trên staging.');
  } catch(_) {setStatus('Chưa thể đăng nhập Google. Vui lòng thử lại.');}
  finally {google.disabled=false;}
});

resetForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!client)return;
 resetSend.disabled=true;setStatus('Đang gửi yêu cầu…',true);
 try{
  const {error}=await client.auth.resetPasswordForEmail($('reset-email').value.trim(),{
   redirectTo:location.origin+'/reset-password/'
  });
  if(error){setStatus('Không gửi được liên kết. Vui lòng thử lại sau.');return}
  setStatus('Nếu email có tài khoản, liên kết khôi phục đã được gửi. Kiểm tra Inbox và Spam.',true);
 }catch(_){setStatus('Không thể gửi liên kết trên staging. Vui lòng thử lại.')}
 finally{resetSend.disabled=false}
});
