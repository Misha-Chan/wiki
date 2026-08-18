// ============================================================
//  wiki.hostaka.fun — إعدادات مشتركة بين صفحات الويكي الأربع
//  (browse.js / topic.js / post.js / new.js) عشان نتفادى تكرارها
// ============================================================
const HOSTAKA_MAIN = 'https://hostaka.fun';

(function bridgeAuthToken(){
  try {
    const params = new URLSearchParams(window.location.search);
    const bridgedToken = params.get('token');
    if (bridgedToken) {
      localStorage.setItem('hostaka_token', bridgedToken);
      params.delete('token');
      const qs = params.toString();
      const cleanUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
  } catch (e) {}
})();

function goToLogin(){ window.location = HOSTAKA_MAIN + '/login?next=' + encodeURIComponent(window.location.href); }

// ===== الثيم =====
const THEME_ICON_DARK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const THEME_ICON_LIGHT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
let currentTheme = localStorage.getItem('hostaka_theme') || 'light';
function setTheme(theme){
  const html = document.documentElement;
  if (theme === 'dark') html.setAttribute('data-theme', 'dark'); else html.removeAttribute('data-theme');
  currentTheme = theme;
  localStorage.setItem('hostaka_theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = theme === 'dark' ? THEME_ICON_DARK : THEME_ICON_LIGHT;
}
function toggleTheme(){ setTheme(currentTheme === 'light' ? 'dark' : 'light'); }
setTheme(currentTheme);

// ===== اللغة =====
function toggleLangMenu(){ document.getElementById('langMenu')?.classList.toggle('show'); }
document.addEventListener('click', function(e){
  const wrap = document.getElementById('langToggle');
  if (wrap && !wrap.contains(e.target)) document.getElementById('langMenu')?.classList.remove('show');
});
function setLang(lang){
  if (lang !== 'ar' && lang !== 'en') return;
  localStorage.setItem('hostaka_lang', lang);
  if (window.setHostakaLang) window.setHostakaLang(lang); // يحدّث data-i18n، والصفحة تعيد رسم المحتوى الديناميكي عبر hostaka:langchange
}

// ===== أدوات عامة =====
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function getToken(){ return localStorage.getItem('hostaka_token') || ''; }

function showToast(msg, type='success'){
  let host = document.getElementById('toastHost');
  if (!host) { host = document.createElement('div'); host.id = 'toastHost'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 300); }, 3200);
}

async function apiFetch(url, method='GET', body=null){
  const token = getToken();
  const opts = { method, headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json().catch(()=>({}));
  data.__status = r.status;
  return data;
}

// إذا ما فيه توكن محلي، جرّب تسحبه بصمت من وسيط التحقق المركزي
// (oauth.hostaka.fun) قبل ما نكمل — يغني عن الحاجة لرابط ?token= يدوي
// بمعظم الحالات (المستخدم مسجّل دخول أصلاً بمكان ثاني بالمنظومة)
async function pullOAuthSessionIfNeeded(){
  if (getToken()) return;
  try {
    const r = await fetch('https://oauth.hostaka.fun/api/token', { credentials: 'include' });
    if (r.ok) {
      const d = await r.json();
      if (d && d.token) localStorage.setItem('hostaka_token', d.token);
    }
  } catch (e) {}
}

let CURRENT_USER = null; // يُضبط بعد initAuthArea() لو المستخدم مسجّل دخول، وإلا يبقى null

// يهيّئ منطقة الحساب بالـ topbar (اسم المستخدم + خروج) لو فيه جلسة صالحة،
// ويرجّع بيانات المستخدم (أو null) عشان الصفحات تقدر تبني عليه (مثلاً: إخفاء
// نموذج النشر لغير المسجّلين، تعبئة اسم الناشر تلقائياً...)
async function initAuthArea(){
  await pullOAuthSessionIfNeeded();
  const token = getToken();
  const area = document.getElementById('authArea');
  if (!token) { CURRENT_USER = null; document.dispatchEvent(new CustomEvent('wiki:authready', { detail:{ user:null } })); return null; }

  try {
    const r = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
    const u = await r.json();
    if (!u || u.error) { CURRENT_USER = null; document.dispatchEvent(new CustomEvent('wiki:authready', { detail:{ user:null } })); return null; }
    CURRENT_USER = u;
    if (area) {
      area.innerHTML = `
        <div class="acc-row">
          ${u.avatar ? `<img src="${esc(u.avatar)}" alt="" class="acc-avatar">` : `<span class="acc-avatar-fallback">${esc((u.display_name||u.username).charAt(0).toUpperCase())}</span>`}
          <span class="acc-name">@${esc(u.username)}</span>
          <button class="icon-btn" onclick="doLogout()" data-i18n-title="common.logout" title="Log out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>`;
      if (window.applyTranslations) window.applyTranslations();
    }
    document.dispatchEvent(new CustomEvent('wiki:authready', { detail:{ user:u } }));
    return u;
  } catch (e) {
    CURRENT_USER = null;
    document.dispatchEvent(new CustomEvent('wiki:authready', { detail:{ user:null } }));
    return null;
  }
}

function doLogout(){ localStorage.removeItem('hostaka_token'); window.location.reload(); }

// رفع صورة (أيقونة/سكرين شوت) — يستخدم /api/upload الموجود أصلاً بالسيرفر
// الرئيسي (base64 → imgbb)، عبر بروكسي /api على هذا النطاق
function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadImage(file){
  const base64 = await fileToBase64(file);
  const d = await apiFetch('/api/upload', 'POST', { image: base64 });
  if (!d || !d.url) throw new Error(d?.error || 'upload failed');
  return d.url;
}
