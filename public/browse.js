// ============================================================
//  wiki.hostaka.fun — الصفحة الرئيسية (/) — تصفح الامتدادات
// ============================================================
let searchDebounce = null;

function extCardHtml(ext){
  const count = ext.posts_count || 0;
  const countLabel = count === 1 ? t('browse.onePost') : t('browse.postsCount').replace('{count}', count);
  return `
    <a class="ext-card" href="/${encodeURIComponent(ext.extension)}">
      <div>
        <div class="ext-name">${esc(ext.extension)}</div>
        <div class="ext-meta">${countLabel}</div>
      </div>
      <svg class="ext-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </a>`;
}

function renderExtensions(list){
  const wrap = document.getElementById('extList');
  if (!Array.isArray(list) || !list.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <div class="empty-state-title" data-i18n="browse.emptyTitle">No topics yet</div>
        <div data-i18n="browse.emptyDesc">Be the first to write about something.</div>
      </div>`;
    if (window.applyTranslations) window.applyTranslations(wrap);
    return;
  }
  wrap.innerHTML = list.map(extCardHtml).join('');
  if (window.applyTranslations) window.applyTranslations(wrap);
}

async function loadExtensions(query){
  try {
    const q = query != null ? query : (document.getElementById('searchInput')?.value || '');
    const list = await apiFetch('/api/wiki/extensions?q=' + encodeURIComponent(q));
    renderExtensions(Array.isArray(list) ? list : []);
  } catch (e) {
    showToast(t('browse.loadFail'), 'error');
  }
}

function onSearchInput(){
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadExtensions(), 300);
}
window.onSearchInput = onSearchInput;

async function init(){
  await initAuthArea();
  await loadExtensions('');
  document.getElementById('loader').style.display = 'none';
}
init();
