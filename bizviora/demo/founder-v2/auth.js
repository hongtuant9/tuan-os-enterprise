import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

// BIZVIORA isolated staging. Role enforcement is on Supabase RPC/RLS.
// The Founder V2.1 content is synthetic public static HTML; this is a browser UX gate,
// NOT a server-side content-privacy boundary for real customer data.
const PROJECT = 'oxakhhpyvvymujiwuvnm';
const API = 'https://' + PROJECT + '.supabase.co';
const CORE_API = 'https://bizviora-core-api-staging-20261013.onrender.com';
const $ = id => document.getElementById(id);
const gate = $('bv-founder-gate');
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
  <button id="bv-founder-google" type="button" class="bv-auth-google">Tiếp tục với Google (staging)</button>
  <div class="bv-auth-links"><a href="/account/">Doanh nghiệp của tôi</a>
  <button id="bv-founder-logout-gate" type="button">Đổi tài khoản</button></div>
  <p class="bv-auth-hint">Chỉ dành cho Platform Manager trên staging. Đăng nhập Google sẽ trở lại trang tài khoản cùng miền, sau đó chọn «Quản trị BIZVIORA». Dashboard chỉ dùng dữ liệu DEMO, không ghi dữ liệu kinh doanh thật.</p>
</section>`;
const form = $('bv-founder-login');
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

$('bv-founder-google').addEventListener('click', async () => {
  if (!client) return;
  setMessage('Đang đăng nhập Google. Sau khi quay lại trang tài khoản, chọn «Quản trị BIZVIORA» để mở Founder.');
  try {
    const {error}=await client.auth.signInWithOAuth({
      provider:'google', options:{redirectTo:location.origin + '/account/'}
    });
    if(error) lock('Không thể khởi động Google OAuth trên staging.', true);
  } catch (_) {
    lock('Google OAuth trên staging chưa được cấu hình đúng.', true);
  }
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
  location.replace('/founder-v2/');
});
document.addEventListener('click', async event => {
  const logout = event.target.closest('#bv-founder-signout');
  if (!logout) return;
  event.preventDefault();
  document.documentElement.classList.remove('bv-founderauth-ok');
  app.hidden = true;
  if (client) await client.auth.signOut();
  location.replace('/founder-v2/');
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
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') lock('Phiên đăng nhập đã kết thúc.', true);
    });
    await verify();
  } catch (_) {
    lock('Không thể kết nối xác thực Supabase staging. Trang quản trị đang khóa an toàn.', false);
  }
})();
