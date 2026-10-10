import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

// BIZVIORA isolated staging. Role enforcement is on Supabase RPC/RLS.
// The Founder V2.1 content is synthetic public static HTML; this is a browser UX gate,
// NOT a server-side content-privacy boundary for real customer data.
const PROJECT = 'oxakhhpyvvymujiwuvnm';
const API = 'https://' + PROJECT + '.supabase.co';
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
  <div class="bv-auth-links"><a href="/account/">Doanh nghiệp của tôi</a>
  <button id="bv-founder-logout-gate" type="button">Đổi tài khoản</button></div>
  <p class="bv-auth-hint">Chỉ dành cho Platform Manager trên staging. Dashboard dùng dữ liệu DEMO; không có quyền ghi dữ liệu kinh doanh thật.</p>
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
    const role = await client.rpc('bv_is_platform_manager');
    if (role.error || role.data !== true) {
      lock('Tài khoản đã đăng nhập nhưng không có quyền BIZVIORA Platform Manager. Truy cập bị từ chối.', false);
      return;
    }
    // Only after a server-authoritative verified user and manager-role check do we execute
    // the synthetic Founder demo. No service-role key or external-business data is exposed.
    renderFounderOnce();
    app.hidden = false;
    document.documentElement.classList.add('bv-founderauth-ok');
    gate.hidden = true;
  } catch (_) {
    lock('Không thể xác minh phiên đăng nhập hoặc quyền truy cập. Vui lòng thử lại.', false);
  } finally {
    checking = false;
  }
}

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
