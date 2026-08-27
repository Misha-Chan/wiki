// ============================================================
//  wiki.hostaka.fun — صفحة امتداد/موضوع (/:extension)
// ============================================================
function getExtensionFromUrl(){
  const parts = window.location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts[0] || '');
}

function timeAgoOrDate(iso){
  try { return new Date(iso).toLocaleDateString(currentLangSafe()); } catch (e) { return iso; }
}
function currentLangSafe(){ return (window.currentLang === 'ar') ? 'ar' : 'en'; }

function renderEmoji(text){ return window.EmojiFluent ? EmojiFluent.render(text) : text; }

function postCardHtml(ext, p){
  return `
    <a class="post-card" href="/${encodeURIComponent(ext)}/${encodeURIComponent(p.token)}">
      <div class="post-author-row">
        <div class="post-avatar">${p.author.avatar ? `<img src="${esc(p.author.avatar)}" alt="">` : `<img src="/default-avatar.jpg" alt="">`}</div>
        <span class="post-author-name">${esc(p.author.display_name || p.author.username)}</span>
        ${p.author.is_admin ? `<span class="admin-badge">admin</span>` : ''}
        <span class="post-date">${timeAgoOrDate(p.created_at)}</span>
      </div>
      <div class="post-title">${renderEmoji(esc(p.title))}</div>
      <div class="post-preview">${renderEmoji(esc(p.body))}</div>
      <div class="post-footer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        ${p.comments_count || 0}
      </div>
    </a>`;
}

async function loadTopic(){
  const ext = getExtensionFromUrl();
  if (!ext) { window.location.href = '/'; return; }

  document.getElementById('topicName').textContent = ext;
  document.title = `${ext} · Hostaka Wiki`;
  document.getElementById('writeBtn').href = '/new?ext=' + encodeURIComponent(ext);

  try {
    const posts = await apiFetch('/api/wiki/extensions/' + encodeURIComponent(ext) + '/posts');
    const list = Array.isArray(posts) ? posts : [];
    document.getElementById('topicCount').textContent = list.length === 1 ? t('topic.onePost') : t('topic.postsCount').replace('{count}', list.length);

    const wrap = document.getElementById('postsList');
    if (!list.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div class="empty-state-title" data-i18n="topic.emptyTitle">No posts yet for this topic</div>
          <div data-i18n="topic.emptyDesc">Be the first to write about it.</div>
        </div>`;
    } else {
      wrap.innerHTML = list.map(p => postCardHtml(ext, p)).join('');
    }
    if (window.applyTranslations) window.applyTranslations(wrap);
  } catch (e) {
    showToast(t('topic.loadFail'), 'error');
  }
  document.getElementById('loader').style.display = 'none';
}

initAuthArea();
loadTopic();
