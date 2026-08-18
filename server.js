// ============================================================
//  wiki — سيرفر مستقل يخدّم Hostaka Wiki — wiki.hostaka.fun
//  كل منطق المصادقة/قاعدة البيانات يبقى على السيرفر الرئيسي (hostaka.fun)؛
//  هذا السيرفر واجهة + بروكسي شفاف لـ /api/* تجاهه، بنفس أسلوب
//  orbithub/aethercast/console/apps بالضبط.
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();

const HOSTAKA_API_BASE = process.env.HOSTAKA_API_BASE || 'https://hostaka.fun';

app.disable('x-powered-by');
app.set('trust proxy', true);

// ============================================================
// بروكسي /api/* — نفس أسلوب orbithub/aethercast/apps بالضبط
// ============================================================
app.use('/api', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const targetUrl = HOSTAKA_API_BASE + '/api' + req.url;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'connection', 'content-length', 'accept-encoding'].includes(key.toLowerCase())) continue;
      headers[key] = value;
    }
    const hasBody = req.body && Buffer.isBuffer(req.body) && req.body.length > 0;
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual'
    });
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });
    const buf = await upstream.buffer();
    res.send(buf);
  } catch (e) {
    console.error('❌ wiki proxy error:', e);
    res.status(502).json({ error: 'تعذر الاتصال بخادم هوستاكا الرئيسي' });
  }
});

// ============================================================
// وسوم Open Graph
// ============================================================
const SITE_NAME    = 'Hostaka Wiki';
const DEFAULT_DESC = 'Hostaka Wiki — منشورات ومشاكل وحلول موثّقة بالمجتمع، مجمّعة حسب الموضوع.';
const DEFAULT_IMG  = '/wiki-icon.png';

function ogEscape(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function ogTruncate(str, len = 160) {
  const s = String(str || '').replace(/<[^>]*>/g, '').trim();
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}
function absUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p; // رابط مطلق أصلاً (رفع صور عبر /api/upload على السيرفر الرئيسي)
  return HOSTAKA_API_BASE + (p.startsWith('/') ? p : '/' + p);
}
// لملفات ثابتة تعيش بهذا المستودع نفسه (wiki.hostaka.fun)، مثل wiki-icon.png
function selfUrl(req, p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return `https://${req.get('host')}${p.startsWith('/') ? p : '/' + p}`;
}

function injectOG(html, meta) {
  const title = ogEscape(meta.title || SITE_NAME);
  const desc  = ogEscape(meta.description || DEFAULT_DESC);
  const image = ogEscape(meta.image || '');
  const url   = ogEscape(meta.url || '');
  const robots = meta.robots || 'index, follow';

  let tags = `<meta name="robots" content="${robots}">\n`;
  tags += `  <meta property="og:site_name" content="${SITE_NAME}">\n`;
  tags += `  <meta property="og:title" content="${title}">\n`;
  tags += `  <meta property="og:description" content="${desc}">\n`;
  tags += `  <meta property="og:image" content="${image}">\n`;
  tags += `  <meta property="og:type" content="website">\n`;
  if (url) tags += `  <meta property="og:url" content="${url}">\n`;
  tags += `  <meta name="twitter:card" content="summary_large_image">\n`;
  tags += `  <meta name="twitter:title" content="${title}">\n`;
  tags += `  <meta name="twitter:description" content="${desc}">\n`;
  tags += `  <meta name="twitter:image" content="${image}">\n`;

  if (/<title>[\s\S]*?<\/title>/.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>\n  ${tags}`);
  }
  return html.replace('</head>', `  ${tags}</head>`);
}
function requestUrl(req) { return `https://${req.get('host')}${req.originalUrl}`; }
function readPublic(fileName) { return fs.readFileSync(path.join(__dirname, 'public', fileName), 'utf-8'); }

// الصفحة الرئيسية (تصفح الامتدادات)
app.get('/', (req, res) => {
  const meta = { title: SITE_NAME, description: DEFAULT_DESC, image: selfUrl(req, DEFAULT_IMG), url: requestUrl(req) };
  res.set('Content-Type', 'text/html; charset=utf-8').send(injectOG(readPublic('index.html'), meta));
});

// نموذج منشور جديد — خاص (يتطلب تسجيل دخول)، بدون فهرسة
app.get('/new', (req, res) => {
  const meta = { title: `${SITE_NAME}`, description: DEFAULT_DESC, image: selfUrl(req, DEFAULT_IMG), url: requestUrl(req), robots: 'noindex, nofollow' };
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Content-Type', 'text/html; charset=utf-8').send(injectOG(readPublic('new.html'), meta));
});

// ============================================================
// ملفات ثابتة — لازم تكون قبل المسارات الديناميكية تحت، عشان
// common.js/theme.css/wiki-icon.png... تُخدَّم كملفات حقيقية أولاً
// ============================================================
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /new\n');
});

// صفحة امتداد/موضوع (/:extension) — قائمة كل المنشورات الأصلية تحته
app.get('/:extension', (req, res) => {
  const ext = (req.params.extension || '').trim();
  const meta = {
    title: `${ext} · ${SITE_NAME}`,
    description: DEFAULT_DESC,
    image: selfUrl(req, DEFAULT_IMG),
    url: requestUrl(req)
  };
  res.set('Content-Type', 'text/html; charset=utf-8').send(injectOG(readPublic('topic.html'), meta));
});

// منشور فردي (أصلي أو تعليق/رد) — (/:extension/:token)
app.get('/:extension/:token', async (req, res) => {
  const ext = (req.params.extension || '').trim();
  const tok = (req.params.token || '').trim();
  const meta = { title: `${ext} · ${SITE_NAME}`, description: DEFAULT_DESC, image: selfUrl(req, DEFAULT_IMG), url: requestUrl(req) };
  if (tok) {
    try {
      const r = await fetch(`${HOSTAKA_API_BASE}/api/wiki/posts/${encodeURIComponent(tok)}`);
      if (r.ok) {
        const post = await r.json();
        if (post && !post.error) {
          meta.title = post.title ? `${post.title} · ${SITE_NAME}` : `رد من @${post.author?.username || ''} · ${SITE_NAME}`;
          meta.description = ogTruncate(post.body) || DEFAULT_DESC;
          if (post.image) meta.image = absUrl(post.image);
        }
      }
    } catch (e) {
      console.error('⚠️ wiki OG lookup failed for token=' + tok + ':', e.message);
      // نستمر بالميتاداتا الافتراضية عند أي خطأ — لا نكسر الصفحة بسبب هذا
    }
  }
  res.set('Content-Type', 'text/html; charset=utf-8').send(injectOG(readPublic('post.html'), meta));
});

// أي مسار غير معروف (أكثر من مقطعين) يرجع للرئيسية
app.use((req, res) => res.redirect('/'));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`✅ wiki server running on port ${PORT} (proxying /api to ${HOSTAKA_API_BASE})`));
}

module.exports = app;
