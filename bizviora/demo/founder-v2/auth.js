import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

// BIZVIORA isolated staging. Role enforcement is on Supabase RPC/RLS.
// The Founder V2.1 content is synthetic public static HTML; this is a browser UX gate,
// NOT a server-side content-privacy boundary for real customer data.
const PROJECT = 'oxakhhpyvvymujiwuvnm';
const API = 'https://' + PROJECT + '.supabase.co';
const CORE_API = 'https://bizviora-core-api-staging-20261013.onrender.com';
const $ = id => document.getElementById(id);
const gate = $('bv-founder-gate');
const authUiStyle=document.createElement('style');
authUiStyle.textContent=`
#bv-founder-google{display:block;width:100%;margin:14px 0 4px;padding:13px;
 border-radius:9px;border:1px solid #b8cbe5;background:#f6faff;color:#1357a5;
 font-weight:750;cursor:pointer}
#bv-founder-google:disabled{opacity:.55;cursor:wait}
#bv-founder-forgot{background:transparent;border:0;color:#1769dc;font-weight:700;
 text-decoration:underline;cursor:pointer;padding:6px 0}
#bv-founder-recovery{display:grid;gap:9px;margin-top:12px}
#bv-founder-recovery[hidden],#bv-founder-google[hidden],
#bv-founder-forgot[hidden]{display:none!important}
#bv-founder-recovery button{padding:10px;border-radius:8px;cursor:pointer}
#bv-founder-recovery-submit{background:#1769dc;color:#fff;border:0}
#bv-founder-recovery-back{background:#e9eef7;color:#164884;border:0}
`;
document.head.append(authUiStyle);
gate.innerHTML = `
<section class="bv-auth-card">
  <div class="bv-auth-logo">BIZVIORA · FOUNDER</div>
  <h1>Founder Control Center</h1>
  <p id="bv-founder-status" role="status">Đang kiểm tra đăng nhập và phân quyền…</p>
  <p id="bv-founder-error" role="alert" hidden></p>
  <form id="bv-founder-login" hidden>
    <label for="bv-founder-email">Email quản trị</label>
    <input id="bv-founder-email" type="email" autocomplete="username" required placeholder="Email Supabase đã xác minh"/>
    <label for="bv-founder-password">Mật khẩu</label>
    <input id="bv-founder-password" type="password" autocomplete="current-password" required/>
    <button id="bv-founder-submit" type="submit">Đăng nhập quản trị</button>
  </form>
  <button id="bv-founder-google" type="button" class="bv-auth-google" disabled>Đăng nhập bằng Google</button>
  <div class="bv-auth-links"><button type="button" id="bv-founder-forgot">Quên mật khẩu?</button></div>
  <form id="bv-founder-recovery" hidden>
    <label for="bv-founder-recovery-email">Email nhận liên kết khôi phục</label>
    <input id="bv-founder-recovery-email" type="email" autocomplete="email" maxlength="254" required placeholder="email@doanhnghiep.com"/>
    <button type="submit" id="bv-founder-recovery-submit">Gửi liên kết đặt lại mật khẩu</button>
    <button type="button" id="bv-founder-recovery-back">← Quay lại đăng nhập</button>
  </form>
  <div class="bv-auth-links"><a href="/account/">Doanh nghiệp của tôi</a>
  <button id="bv-founder-logout-gate" type="button">Đổi tài khoản</button></div>
  <p class="bv-auth-hint">Chỉ dành cho Platform Manager trên staging. Đăng nhập bằng Google hoặc yêu cầu khôi phục mật khẩu. Founder chỉ mở sau khi xác minh Platform Manager và Core API. Một số tab còn dùng DEMO, bốn tab Doanh nghiệp / Triển khai / Phê duyệt / Audit đọc staging.</p>
</section>`;
const GOOGLE_CALLBACK='https://bizviora.com/founder/';
const RECOVERY_CALLBACK='https://bizviora.com/founder/reset-password/';
const form = $('bv-founder-login');
const recoveryForm=$('bv-founder-recovery');
const googleButton=$('bv-founder-google');
const recoveryButton=$('bv-founder-forgot');
const status = $('bv-founder-status');
const errorText = $('bv-founder-error');
const app = $('app');
let client;
let launched = false;
let checking = false;

function setMessage(message, error=false) {
  status.textContent = message;
  errorText.hidden = !error;
  errorText.textContent = error ? message : '';
}
function lock(message, showLogin=false) {
  document.documentElement.classList.remove('bv-founderauth-ok');
  app.hidden = true;
  gate.hidden = false;
  form.hidden = !showLogin;
  setMessage(message);
}
function renderFounderOnce() {
  if (launched) return;
  const source = $('bv-founder-demo-source');
  if (!source) throw new Error('FOUNDER_SOURCE_UNAVAILABLE');
  const script = document.createElement('script');
  script.textContent = source.textContent;
  document.body.appendChild(script);
  if (!window.BIZVIORA_FOUNDER_V2) throw new Error('FOUNDER_RENDER_FAILED');
  launched = true;
}
async function verify() {
  if (checking || !client) return;
  checking = true;
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) {
      lock('Đăng nhập để mở Founder Control Center.', true);
      return;
    }
    if (!data.user.email_confirmed_at) {
      lock('Email chưa được xác minh trong Supabase Auth. Không cấp quyền.', false);
      return;
    }
    // Defense in depth: the backend validates a real signed user JWT and the
    // platform-manager RPC. A browser-only role check cannot authorize Founder.
    const role = await client.rpc('bv_is_platform_manager');
    if (role.error || role.data !== true) {
      lock('Tài khoản đã đăng nhập nhưng không có quyền BIZVIORA Platform Manager. Truy cập bị từ chối.', false);
      return;
    }
    const {data:sessionData,error:sessionError} = await client.auth.getSession();
    const session=sessionData?.session;
    if (sessionError || !session?.access_token || session.user?.id !== data.user.id) {
      lock('Không tìm thấy phiên xác thực Founder hợp lệ. Vui lòng đăng nhập lại.', false);
      return;
    }
    const accessResponse=await fetch(CORE_API + '/v1/founder/access',{
      method:'GET',
      headers:{Authorization:'Bearer ' + session.access_token},
      cache:'no-store',
      credentials:'omit'
    });
    if (!accessResponse.ok) {
      lock('Core API từ chối quyền Founder hoặc chưa sẵn sàng. Vui lòng thử lại sau.', false);
      return;
    }
    const coreAccess=await accessResponse.json();
    if (coreAccess?.platformManager !== true || coreAccess?.scope !== 'STAGING_ONLY') {
      lock('Core API không xác nhận quyền Founder. Truy cập bị từ chối.', false);
      return;
    }
    // Only after a server-authoritative verified user and manager-role check do we execute
    // the synthetic Founder demo. No service-role key or external-business data is exposed.
    renderFounderOnce();
    // Founder operational modules are mounted only AFTER real signed-JWT Core API
    // and platform-manager RPC both grant staging access.
    const {mountFounderOps}=await import('./ops.js');
    mountFounderOps(client);
    app.hidden = false;
    document.documentElement.classList.add('bv-founderauth-ok');
    gate.hidden = true;
    // V2.2 is a presentation-only enhancement loaded AFTER verified platform-manager RPC.
    // If it fails, retain the authenticated V2.1 UI rather than affecting login/permissions.
    try {
      const { installFounderIcons } = await import('./icons-v22.js');
      if (installFounderIcons()) {
        window.BIZVIORA_FOUNDER_V2 = {
          ...window.BIZVIORA_FOUNDER_V2,
          version:'v2.2-icon-fidelity-10-tabs',
          icons:{scope:'all-10-tabs',status:'active-after-auth'}
        };
        document.title = 'BIZVIORA — Founder Control Center V2.5 · STAGING + DEMO';
      }
    } catch (_) {
      // Icon module is noncritical; never bypass or weaken the authenticated gate.
    }
  } catch (_) {
    lock('Không thể xác minh phiên đăng nhập hoặc quyền truy cập. Vui lòng thử lại.', false);
  } finally {
    checking = false;
  }
}

googleButton.addEventListener('click', async () => {
  if (!client) {setMessage('Đang kết nối hệ thống xác thực staging, vui lòng đợi.');return;}
  googleButton.disabled=true;
  setMessage('Đang chuyển đến Google để xác thực…');
  try {
    const redirectTo=location.hostname==='bizviora.com'
      ?GOOGLE_CALLBACK
      :location.origin + '/account/'; // Keep the legacy staging URL working.
    const {error}=await client.auth.signInWithOAuth({
      provider:'google', options:{redirectTo}
    });
    if(error)throw error;
  } catch (_) {
    setMessage('Google chưa thể hoàn tất đăng nhập. Hãy thử lại sau hoặc liên hệ quản trị.',true);
  } finally {googleButton.disabled=false;}
});
recoveryButton.addEventListener('click',()=>{
  form.hidden=true;googleButton.hidden=true;recoveryButton.hidden=true;
  recoveryForm.hidden=false;
  $('bv-founder-recovery-email').value=$('bv-founder-email').value.trim();
  setMessage('Nhập email đã đăng ký để nhận liên kết khôi phục.');
});
$('bv-founder-recovery-back').addEventListener('click',()=>{
  recoveryForm.hidden=true;form.hidden=false;googleButton.hidden=false;recoveryButton.hidden=false;
  setMessage('Đăng nhập Founder bằng Google hoặc mật khẩu.');
});
recoveryForm.addEventListener('submit',async event=>{
  event.preventDefault();if(!client)return;
  const email=$('bv-founder-recovery-email').value.trim();
  const button=$('bv-founder-recovery-submit');button.disabled=true;
  setMessage('Đang xử lý yêu cầu gửi email khôi phục…');
  try {
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:RECOVERY_CALLBACK});
    if(error)throw error;
    setMessage('Nếu email đã đăng ký, hệ thống sẽ gửi liên kết khôi phục. Kiểm tra Inbox và Spam. Không dùng lại email cũ.');
  } catch (_){
    setMessage('Chưa gửi được liên kết khôi phục trên staging. Vui lòng thử lại hoặc liên hệ hỗ trợ.',true);
  } finally{button.disabled=false;}
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) return;
  const button = $('bv-founder-submit');
  button.disabled = true;
  setMessage('Đang xác thực qua Supabase…');
  try {
    const email = $('bv-founder-email').value.trim();
    const password = $('bv-founder-password').value;
    const { error } = await client.auth.signInWithPassword({email,password});
    $('bv-founder-password').value = '';
    if (error) {
      lock('Email hoặc mật khẩu không hợp lệ, hoặc tài khoản chưa được kích hoạt.', true);
      return;
    }
    await verify();
  } catch (_) {
    lock('Không thể hoàn tất đăng nhập. Vui lòng thử lại.', true);
  } finally {
    button.disabled = false;
  }
});

$('bv-founder-logout-gate').addEventListener('click', async () => {
  if (client) await client.auth.signOut();
  location.replace(location.hostname==='bizviora.com'?'/founder/':'/founder-v2/');
});
document.addEventListener('click', async event => {
  const logout = event.target.closest('#bv-founder-signout');
  if (!logout) return;
  event.preventDefault();
  document.documentElement.classList.remove('bv-founderauth-ok');
  app.hidden = true;
  if (client) await client.auth.signOut();
  location.replace(location.hostname==='bizviora.com'?'/founder/':'/founder-v2/');
});
window.addEventListener('focus', () => { if (client) void verify(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && client) void verify();
});

(async () => {
  try {
    const response = await fetch(API + '/functions/v1/bv-public-config', {cache:'no-store'});
    if (!response.ok) throw new Error('CONFIG_HTTP_ERROR');
    const config = await response.json();
    if (config?.supabaseUrl !== API || typeof config.publishableKey !== 'string' ||
        config.publishableKey.length < 25) throw new Error('CONFIG_INVALID');
    client = createClient(config.supabaseUrl,config.publishableKey,{
      auth:{persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true}
    });
    googleButton.disabled=false;
    if(new URLSearchParams(location.search).get('reset_done')==='1'){
      setMessage('Mật khẩu đã thay đổi. Vui lòng đăng nhập lại bằng Google hoặc mật khẩu mới.');
    }
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') lock('Phiên đăng nhập đã kết thúc.', true);
    });
    await verify();
  } catch (_) {
    lock('Không thể kết nối xác thực Supabase staging. Trang quản trị đang khóa an toàn.', false);
  }
})();
