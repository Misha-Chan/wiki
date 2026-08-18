// ============================================================
//  wiki.hostaka.fun — منشور جديد (/new)
// ============================================================
let newImageUrl = '';

function getPrefilledExtension(){
  const params = new URLSearchParams(window.location.search);
  return params.get('ext') || '';
}

function renderGate(){
  document.getElementById('newWrap').innerHTML = `
    <div class="gate-box">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      <div class="gate-box-title" data-i18n="new.loginRequiredTitle">Log in to write a post</div>
      <div class="gate-box-desc" data-i18n="new.loginRequiredDesc">You need a Hostaka account to publish on the Wiki.</div>
      <button class="gate-btn" onclick="goToLogin()" data-i18n="new.loginBtn">Log in</button>
    </div>`;
  if (window.applyTranslations) window.applyTranslations();
}

function renderSuccess(extension, token){
  document.getElementById('newWrap').innerHTML = `
    <div class="success-box">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <div class="success-box-title" data-i18n="new.successTitle">Posted!</div>
      <a class="success-btn" href="/${encodeURIComponent(extension)}/${encodeURIComponent(token)}" data-i18n="new.viewPost">View post</a>
    </div>`;
  if (window.applyTranslations) window.applyTranslations();
}

function renderForm(){
  const prefill = getPrefilledExtension();
  document.getElementById('newWrap').innerHTML = `
    <div class="page-heading" data-i18n="new.title">Write a new post</div>

    <div class="field">
      <label data-i18n="new.extLabel">Topic (extension)</label>
      <input type="text" id="fExt" class="ext-input" value="${esc(prefill)}" data-i18n-placeholder="new.extPlaceholder" placeholder="e.g. chat-error" maxlength="60">
      <div class="field-hint" data-i18n="new.extHint">If this topic already exists, your post joins it. Use the exact same name to group with existing posts.</div>
    </div>

    <div class="field">
      <label data-i18n="new.titleLabel">Post title</label>
      <input type="text" id="fTitle" data-i18n-placeholder="new.titlePlaceholder" placeholder="Short summary of the issue" maxlength="150">
    </div>

    <div class="field">
      <label data-i18n="new.bodyLabel">Details</label>
      <textarea id="fBody" data-i18n-placeholder="new.bodyPlaceholder" placeholder="Describe the issue in detail..." maxlength="5000"></textarea>
    </div>

    <div class="field">
      <label data-i18n="new.imageLabel">Screenshot (optional)</label>
      <div class="image-picker">
        <div class="image-preview" id="imgPreview">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </div>
        <button type="button" class="upload-btn" onclick="document.getElementById('imgInput').click()" data-i18n="new.addImageBtn">Add image</button>
        <input type="file" id="imgInput" accept="image/*" style="display:none;" onchange="onImagePicked(event)">
      </div>
    </div>

    <button class="submit-btn" id="submitBtn" onclick="doSubmit()" data-i18n="new.submitBtn">Publish</button>
  `;
  if (window.applyTranslations) window.applyTranslations();
}

async function onImagePicked(e){
  const file = e.target.files[0];
  if (!file) return;
  try {
    newImageUrl = await uploadImage(file);
    document.getElementById('imgPreview').innerHTML = `<img src="${esc(newImageUrl)}" alt="">`;
  } catch (err) { showToast(t('new.uploadFail'), 'error'); }
  e.target.value = '';
}
window.onImagePicked = onImagePicked;

async function doSubmit(){
  const extension = document.getElementById('fExt').value.trim();
  const title = document.getElementById('fTitle').value.trim();
  const body = document.getElementById('fBody').value.trim();

  if (!extension) { showToast(t('new.missingExt'), 'error'); return; }
  if (!title) { showToast(t('new.missingTitle'), 'error'); return; }
  if (!body) { showToast(t('new.missingBody'), 'error'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = t('new.submitting');
  try {
    const d = await apiFetch('/api/wiki/posts', 'POST', { extension, title, body, image: newImageUrl });
    if (d && d.success) {
      renderSuccess(d.extension, d.token);
    } else {
      showToast(d?.error || t('new.submitFail'), 'error');
      btn.disabled = false;
      btn.textContent = t('new.submitBtn');
    }
  } catch (e) {
    showToast(t('new.submitFail'), 'error');
    btn.disabled = false;
    btn.textContent = t('new.submitBtn');
  }
}
window.doSubmit = doSubmit;

async function init(){
  const user = await initAuthArea();
  document.getElementById('loader').style.display = 'none';
  if (!user) renderGate();
  else renderForm();
}
init();
