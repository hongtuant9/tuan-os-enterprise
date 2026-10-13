import {customerClient,authorizedCustomer} from '../auth-client.js';
const $=id=>document.getElementById(id);
const form=$('application'),submit=$('send-application'),status=$('status');
let client,user,allowedPlans=new Set();
const message=(text,ok=false)=>{status.textContent=text;status.classList.toggle('ok',ok)};
async function existingRequest(){
 const {data,error}=await client.from('bv_registration_requests')
   .select('id,business_name,plan_code,status,tenant_id,review_note')
   .eq('applicant_user_id',user.id).limit(1);
 if(error)throw Error('REGISTRATION_LOOKUP_DENIED');
 return data?.[0]||null;
}
async function init(){
 try{
  client=await customerClient();
  const identity=await client.auth.getUser();
  if(identity.error||!identity.data?.user){
   message('Bạn cần đăng nhập bằng Google trước khi gửi hồ sơ. Chọn “Đăng ký tài khoản mới với Google” tại trang đăng nhập.');
   return;
  }
  user=identity.data.user;
  const approved=await authorizedCustomer(client);
  if(approved.ok){
   $('open-dashboard').hidden=false;
   message('Tài khoản đã có quyền truy cập doanh nghiệp TUAN OS. Không cần đăng ký thêm.',true);
   return;
  }
  const request=await existingRequest();
  if(request){
   if(request.status==='PENDING'){message('Hồ sơ '+request.business_name+' đã được tiếp nhận và đang chờ BIZVIORA phê duyệt.',true);return}
   if(request.status==='APPROVED'){message('Hồ sơ đã được phê duyệt nhưng chưa xác minh được quyền tenant trên tài khoản này. Vui lòng liên hệ BIZVIORA.');return}
   if(request.status==='REJECTED'){message('Hồ sơ trước chưa được duyệt. Vui lòng liên hệ BIZVIORA để được hỗ trợ.');return}
   message('Hồ sơ đang được xử lý. Vui lòng liên hệ BIZVIORA.');return;
  }
  const {data:plans,error}=await client.from('bv_service_plans')
    .select('code,label').eq('enabled',true);
  if(error||!Array.isArray(plans)||!plans.length)throw Error('PLAN_LIST_UNAVAILABLE');
  const options=[new Option('Chọn gói dịch vụ','')];
  for(const plan of plans){
   if(typeof plan.code!=='string'||typeof plan.label!=='string')continue;
   allowedPlans.add(plan.code);
   options.push(new Option(plan.label,plan.code));
  }
  if(!allowedPlans.size)throw Error('PLAN_LIST_EMPTY');
  $('plan').replaceChildren(...options);
  $('contact-name').value=String(user.user_metadata?.full_name||'').slice(0,100);
  form.hidden=false;
  message('Tài khoản Google đã được xác minh. Hãy gửi hồ sơ doanh nghiệp để chờ xét duyệt.',true);
 }catch(_){
  form.hidden=true;message('Chưa thể kiểm tra hồ sơ đăng ký trên staging. Không có quyền doanh nghiệp nào được cấp.');
 }
}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!client||!user||!allowedPlans.size)return;
 const business=$('business-name').value.trim(),contact=$('contact-name').value.trim(),plan=$('plan').value;
 if(business.length<2||business.length>120||contact.length<2||contact.length>100||!allowedPlans.has(plan)){
  message('Vui lòng nhập đầy đủ thông tin doanh nghiệp và gói dịch vụ hợp lệ.');
  return;
 }
 submit.disabled=true;message('Đang gửi hồ sơ…',true);
 try{
  const prior=await existingRequest();
  if(prior){form.hidden=true;message('Hồ sơ đã tồn tại. Không tạo đăng ký trùng.');return}
  const {error}=await client.from('bv_registration_requests').insert({
   applicant_user_id:user.id,
   business_name:business,contact_name:contact,plan_code:plan,status:'PENDING'
  });
  if(error)throw Error('REGISTRATION_SAVE_DENIED');
  form.hidden=true;
  message('Đã gửi hồ sơ thành công. Trạng thái: CHỜ DUYỆT. Việc tạo tài khoản không tự cấp quyền doanh nghiệp.',true);
 }catch(_){message('Chưa ghi nhận được hồ sơ. Vui lòng thử lại hoặc liên hệ BIZVIORA.')}
 finally{submit.disabled=false}
});
init();
