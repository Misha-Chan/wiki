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
// نثق بوكيل واحد فقط (بروكسي Vercel) قبل الطلب، بدل `true` اللي يثق بأي
// X-Forwarded-For ويسمح بتزوير req.ip — نفس نمط aethercast/orbithub.
app.set('trust proxy', 1);

// رؤوس أمان أساسية على كل الردود (كانت غائبة).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// ============================================================
// بروكسي /api/* — نفس أسلوب orbithub/aethercast/apps بالضبط
// ============================================================
// حدّ معدّل بسيط لكل IP على /api/* (in-memory، مثل aethercast/orbithub) —
// سابقاً كان البروكسي بلا أي حد، فمسارات الدخول/التسجيل قابلة للاجتياح عبر هذا النطاق.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX || 600);
const rateBuckets = new Map();
function apiRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.start > RATE_WINDOW_MS) { b = { start: now, count: 0 }; rateBuckets.set(key, b); }
  b.count += 1;
  res.setHeader('X-RateLimit-Limit', RATE_MAX);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_MAX - b.count));
  if (b.count > RATE_MAX) return res.status(429).json({ error: 'طلبات كثيرة، حاول لاحقاً' });
  if (rateBuckets.size > 10000) rateBuckets.clear();
  next();
}

app.use('/api', apiRateLimit, express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
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
  tags += `  <script src="/ecosystem-switcher.js" defer></script>\n`;

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
  const origin = `https://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /new\n\nSitemap: ${origin}/sitemap.xml\n`);
});

// ============================================================
// sitemap.xml — Wiki (wiki.hostaka.fun), part of the Hostaka Ecosystem.
// Hostaka Wiki — Hostaka's community wiki: documented posts and threads,
// grouped by topic. Dynamically generated from the main Hostaka API
// (every extension/topic + every post under it), same pattern used by
// hostaka.fun/sitemap.xml, so Google can discover and index this
// subdomain's content directly instead of waiting on random crawling.
// ============================================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    const origin = `https://${req.get('host')}`;
    const urls = [];
    const addUrl = (loc, lastmod, priority) => {
      urls.push(`  <url><loc>${ogEscape(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}<priority>${priority}</priority></url>`);
    };

    addUrl(`${origin}/`, null, '1.0');

    try {
      const r = await fetch(`${HOSTAKA_API_BASE}/api/wiki/extensions`);
      if (r.ok) {
        const extensions = await r.json();
        for (const e of extensions) {
          const ext = e.extension || e.name || e;
          if (!ext) continue;
          addUrl(`${origin}/${encodeURIComponent(ext)}`, null, '0.7');
          try {
            const rp = await fetch(`${HOSTAKA_API_BASE}/api/wiki/extensions/${encodeURIComponent(ext)}/posts`);
            if (rp.ok) {
              const posts = await rp.json();
              for (const p of posts) {
                if (p.token) addUrl(`${origin}/${encodeURIComponent(ext)}/${encodeURIComponent(p.token)}`, p.created_at, '0.5');
              }
            }
          } catch (e2) { console.warn('sitemap: could not fetch posts for extension', ext, e2.message); }
        }
      }
    } catch (e) { console.warn('sitemap: could not fetch extensions', e.message); }

    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
  } catch (e) {
    console.error('❌ sitemap generation failed:', e);
    res.status(500).type('text/plain').send('sitemap generation failed');
  }
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
          else meta.image = `${HOSTAKA_API_BASE}/api/og-image?type=wiki&brand=wiki&token=${encodeURIComponent(tok)}`;
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
