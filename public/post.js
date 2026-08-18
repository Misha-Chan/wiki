// ============================================================
//  wiki.hostaka.fun — منشور فردي (/:extension/:token)
// ============================================================
let CURRENT_POST = null;
let replyImageUrl = '';

function getPathParts(){
  const parts = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  return { extension: parts[0] || '', token: parts[1] || '' };
}
function currentLangSafe(){ return (window.currentLang === 'ar') ? 'ar' : 'en'; }
function fmtDate(iso){ try { return new Date(iso).toLocaleDateString(currentLangSafe(), { year:'numeric', month:'short', day:'numeric' }); } catch (e) { return iso; } }

function renderNotFound(){
  document.getElementById('postWrap').innerHTML = `
    <div class="not-found">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <div style="font-weight:800;font-size:1rem;color:var(--text);margin-bottom:6px;" data-i18n="post.notFoundTitle">Post not found</div>
      <div data-i18n="post.notFoundDesc">It may have been removed.</div>
      <div style="margin-top:16px;"><a href="/" style="color:var(--primary);font-weight:700;text-decoration:none;" data-i18n="post.backHome">Back to Wiki</a></div>
    </div>`;
  if (window.applyTranslations) window.applyTranslations();
}

function openLightbox(src){
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox(){ document.getElementById('lightbox').classList.remove('show'); }
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;

function authorRowHtml(p){
  const initial = esc((p.author.display_name || p.author.username || '?').charAt(0).toUpperCase());
  return `
    <div class="post-author-row">
      <div class="post-avatar">${p.author.avatar ? `<img src="${esc(p.author.avatar)}" alt="">` : initial}</div>
      <span class="post-author-name">${esc(p.author.display_name || p.author.username)}</span>
      ${p.author.is_admin ? `<span class="admin-badge">admin</span>` : ''}
      <span class="post-date">${fmtDate(p.created_at)}</span>
    </div>`;
}

function isOwner(p){ return CURRENT_USER && p.author.username === CURRENT_USER.username; }

function renderPostBox(p, extension){
  const isMine = isOwner(p);
  const html = `
    ${p.parent_token ? `
      <a class="reply-banner" href="/${encodeURIComponent(extension)}/${encodeURIComponent(p.parent_token)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        <span data-i18n="post.viewOriginal">View the post being replied to</span>
      </a>` : ''}
    <div class="post-box" id="postBox">
      ${authorRowHtml(p)}
      ${p.is_comment
        ? `<div class="post-title" style="font-size:0.95rem;">${t('post.replyTo')} @${esc(p.mentioned_username||'')}</div>`
        : `<div class="post-title">${esc(p.title)}</div>`}
      <div class="post-body">${esc(p.body)}</div>
      ${p.image ? `<img class="post-image" src="${esc(p.image)}" onclick="openLightbox('${esc(p.image)}')" alt="">` : ''}
      ${isMine ? `
        <div class="post-actions">
          <button onclick="startEdit()" data-i18n="post.edit">Edit</button>
          <button class="danger" onclick="deleteThisPost()" data-i18n="post.delete">Delete</button>
        </div>` : ''}
    </div>`;
  document.getElementById('postWrap').innerHTML = html;
  if (window.applyTranslations) window.applyTranslations();
}

function startEdit(){
  const p = CURRENT_POST;
  const box = document.getElementById('postBox');
  box.innerHTML = `
    <div class="edit-form">
      ${!p.is_comment ? `<input type="text" id="editTitle" value="${esc(p.title)}" maxlength="150">` : ''}
      <textarea id="editBody" maxlength="5000">${esc(p.body)}</textarea>
      <div class="edit-form-actions">
        <button class="save-btn" onclick="saveEdit()" data-i18n="post.save">Save</button>
        <button class="cancel-btn" onclick="renderPostBox(CURRENT_POST, getPathParts().extension)" data-i18n="post.cancel">Cancel</button>
      </div>
    </div>`;
  if (window.applyTranslations) window.applyTranslations(box);
}
window.startEdit = startEdit;
window.renderPostBox = renderPostBox;

async function saveEdit(){
  const p = CURRENT_POST;
  const title = p.is_comment ? undefined : document.getElementById('editTitle').value.trim();
  const body = document.getElementById('editBody').value.trim();
  if (!p.is_comment && !title) { showToast(t('post.missingTitle'), 'error'); return; }
  if (!body) { showToast(t('post.missingBody'), 'error'); return; }
  try {
    const payload = { body };
    if (!p.is_comment) payload.title = title;
    const d = await apiFetch('/api/wiki/posts/' + encodeURIComponent(p.token), 'PUT', payload);
    if (d && d.success) {
      showToast(t('post.saved'));
      await loadPost();
    } else {
      showToast(d?.error || t('post.saveFail'), 'error');
    }
  } catch (e) { showToast(t('post.saveFail'), 'error'); }
}
window.saveEdit = saveEdit;

async function deleteThisPost(){
  if (!confirm(t('post.confirmDelete'))) return;
  try {
    const p = CURRENT_POST;
    const d = await apiFetch('/api/wiki/posts/' + encodeURIComponent(p.token), 'DELETE');
    if (d && d.success) {
      const { extension } = getPathParts();
      window.location.href = p.parent_token
        ? '/' + encodeURIComponent(extension) + '/' + encodeURIComponent(p.parent_token)
        : '/' + encodeURIComponent(extension);
    } else {
      showToast(d?.error || t('post.deleteFail'), 'error');
    }
  } catch (e) { showToast(t('post.deleteFail'), 'error'); }
}
window.deleteThisPost = deleteThisPost;

function replyItemHtml(extension, r){
  const initial = esc((r.author.display_name || r.author.username || '?').charAt(0).toUpperCase());
  return `
    <a class="reply-item" style="text-decoration:none;color:inherit;display:block;" href="/${encodeURIComponent(extension)}/${encodeURIComponent(r.token)}">
      <div class="post-author-row">
        <div class="post-avatar">${r.author.avatar ? `<img src="${esc(r.author.avatar)}" alt="">` : initial}</div>
        <span class="post-author-name">${esc(r.author.display_name || r.author.username)}</span>
        ${r.author.is_admin ? `<span class="admin-badge">admin</span>` : ''}
        <span class="post-date">${fmtDate(r.created_at)}</span>
      </div>
      <div class="post-body">${esc(r.body)}</div>
      ${r.image ? `<img src="${esc(r.image)}" style="max-width:110px;border-radius:8px;display:block;margin-bottom:6px;">` : ''}
      <div class="reply-item-footer">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>${r.comments_count || 0}</span>
      </div>
    </a>`;
}

async function loadReplies(token, extension){
  try {
    const replies = await apiFetch('/api/wiki/posts/' + encodeURIComponent(token) + '/comments');
    const list = Array.isArray(replies) ? replies : [];
    const wrap = document.getElementById('repliesList');
    if (!list.length) {
      wrap.innerHTML = `<div style="color:var(--muted);font-size:0.86rem;" data-i18n="post.noReplies">No replies yet</div>`;
    } else {
      wrap.innerHTML = list.map(r => replyItemHtml(extension, r)).join('');
    }
    if (window.applyTranslations) window.applyTranslations(wrap);
  } catch (e) {}
}

function renderReplyFormArea(){
  const area = document.getElementById('replyFormArea');
  if (!area) return;
  if (CURRENT_USER) {
    area.innerHTML = `
      <div class="reply-form">
        <textarea id="replyBody" data-i18n-placeholder="post.replyPlaceholder" placeholder="Write a reply..." maxlength="5000"></textarea>
        <div id="replyImgPreviewWrap"></div>
        <div class="reply-form-footer">
          <button type="button" class="reply-image-btn" onclick="document.getElementById('replyImgInput').click()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span data-i18n="post.addImage">Add image</span>
          </button>
          <button type="button" class="reply-submit-btn" onclick="submitReply()" data-i18n="post.reply">Reply</button>
        </div>
        <input type="file" id="replyImgInput" accept="image/*" style="display:none;" onchange="onReplyImagePicked(event)">
      </div>`;
  } else {
    area.innerHTML = `<div class="login-hint"><a href="#" onclick="goToLogin();return false;" data-i18n="post.loginToReply">Log in to reply</a></div>`;
  }
  if (window.applyTranslations) window.applyTranslations(area);
}

async function onReplyImagePicked(e){
  const file = e.target.files[0];
  if (!file) return;
  try {
    replyImageUrl = await uploadImage(file);
    document.getElementById('replyImgPreviewWrap').innerHTML = `<img class="reply-preview" src="${esc(replyImageUrl)}">`;
  } catch (err) { showToast(t('post.uploadFail'), 'error'); }
  e.target.value = '';
}
window.onReplyImagePicked = onReplyImagePicked;

async function submitReply(){
  const body = document.getElementById('replyBody').value.trim();
  if (!body) { showToast(t('post.missingBody'), 'error'); return; }
  try {
    const d = await apiFetch('/api/wiki/posts/' + encodeURIComponent(CURRENT_POST.token) + '/comments', 'POST', { body, image: replyImageUrl });
    if (d && d.success) {
      showToast(t('post.replySent'));
      document.getElementById('replyBody').value = '';
      replyImageUrl = '';
      document.getElementById('replyImgPreviewWrap').innerHTML = '';
      await loadReplies(CURRENT_POST.token, getPathParts().extension);
      CURRENT_POST.comments_count = (CURRENT_POST.comments_count || 0) + 1;
    } else {
      showToast(d?.error || t('post.replyFail'), 'error');
    }
  } catch (e) { showToast(t('post.replyFail'), 'error'); }
}
window.submitReply = submitReply;

async function loadPost(){
  const { extension, token } = getPathParts();
  if (!extension || !token) { window.location.href = '/'; return; }
  try {
    const post = await apiFetch('/api/wiki/posts/' + encodeURIComponent(token));
    if (!post || post.error) { renderNotFound(); document.getElementById('loader').style.display = 'none'; return; }
    CURRENT_POST = post;
    document.title = post.is_comment ? `${t('post.replyTo')} @${post.mentioned_username} · Hostaka Wiki` : `${post.title} · Hostaka Wiki`;
    renderPostBox(post, extension);
    document.getElementById('sectionTitleWrap').style.display = '';
    renderReplyFormArea();
    await loadReplies(token, extension);
  } catch (e) {
    renderNotFound();
  }
  document.getElementById('loader').style.display = 'none';
}

document.addEventListener('wiki:authready', renderReplyFormArea);
initAuthArea();
loadPost();
