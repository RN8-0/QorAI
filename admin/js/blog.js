// ══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Blog (articles collection)
//  Modern list + editor (language tabs, manual publish date, product
//  blocks with per-language descriptions + reorder, instant publish).
//  Product picker uses Typesense and stores the on-site product ref so
//  the public blog links to /product/<slug>-<id> (specs page).
// ══════════════════════════════════════════════════════════════
(function () {
  const LANGS = [['tr', '🇹🇷 Türkçe'], ['en', '🇬🇧 English'], ['de', '🇩🇪 Deutsch']];
  const SITE = 'https://qorai.net';
  let _editing = null;
  let _products = [];
  let _lang = 'tr';
  let _searchTimer = null;
  let _subSearchTimer = null;
  let _pickKind = 'product';
  let _stats = {};   // slug -> {views, likes, reads}
  let _cats = [];    // site category tokens for the datalist
  let _bodyQ = null; // Quill rich-text editor (intro/body)
  let _conclQ = null; // Quill rich-text editor (conclusion)

  // Rich-text editor (Quill) — professional editorial editing for body + conclusion.
  // Quill inserts its toolbar as a SIBLING of the target element, so re-initing
  // on the same node stacks toolbars. We reset a wrapper to a fresh inner <div>
  // before each init so there is always exactly one toolbar.
  function mkQuill(wrapId, html, onChange) {
    const wrap = document.getElementById(wrapId);
    if (!wrap || !window.Quill) return null;
    wrap.innerHTML = '<div></div>';
    const el = wrap.firstChild;
    const q = new Quill(el, {
      theme: 'snow',
      placeholder: 'Yazmaya başla…',
      modules: {
        toolbar: {
          container: [
            [{ header: [2, 3, false] }],
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'link', 'image'],
            ['clean'],
          ],
          handlers: {
            image() {
              const url = prompt('Görsel URL (cihazdan yüklemek için kapak alanını kullan)');
              if (url) { const r = this.quill.getSelection(true); this.quill.insertEmbed(r.index, 'image', url, 'user'); this.quill.setSelection(r.index + 1); }
            },
          },
        },
      },
    });
    if (html) q.clipboard.dangerouslyPasteHTML(html);
    q.on('text-change', () => { const h = q.root.innerHTML; onChange(h === '<p><br></p>' ? '' : h); });
    return q;
  }
  function initEditors() {
    const c = _lang;
    _bodyQ = mkQuill('p_body_wrap', _editing['body_' + c] || '', (h) => { _editing['body_' + c] = h; });
    _conclQ = mkQuill('b_concl_wrap', _editing['conclusion_' + c] || '', (h) => { _editing['conclusion_' + c] = h; });
  }
  // Quill 2 renders BOTH bullet & numbered lists as <ol> with a data-list
  // attribute (it relies on its own CSS for the bullets). On the public site
  // that CSS isn't present, so an all-bullet list would show as numbered.
  // Normalise to plain <ul>/<ol> and drop the data-list attributes.
  function normalizeRte(html) {
    if (!html || html === '<p><br></p>') return '';
    try {
      const doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
      doc.querySelectorAll('ol').forEach((ol) => {
        const items = [...ol.children].filter((n) => n.tagName === 'LI');
        const allBullet = items.length && items.every((li) => li.getAttribute('data-list') === 'bullet');
        items.forEach((li) => li.removeAttribute('data-list'));
        if (allBullet) { const ul = doc.createElement('ul'); while (ol.firstChild) ul.appendChild(ol.firstChild); ol.replaceWith(ul); }
      });
      return doc.getElementById('r').innerHTML;
    } catch (_) { return html; }
  }
  function flushEditors() {
    if (!_editing) return;
    const c = _lang;
    if (_bodyQ && _bodyQ.root && _bodyQ.root.isConnected) _editing['body_' + c] = normalizeRte(_bodyQ.root.innerHTML);
    if (_conclQ && _conclQ.root && _conclQ.root.isConnected) _editing['conclusion_' + c] = normalizeRte(_conclQ.root.innerHTML);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slugify(v) {
    return String(v || '').trim().toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  // PB returns datetime as "2026-06-21 10:11:00.000Z" (space, seconds, Z) which a
  // <input type="datetime-local"> cannot parse → garbage/0006. Convert to the
  // local "YYYY-MM-DDTHH:mm" the input expects.
  function toDtLocal(v) {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const root = () => document.getElementById('blogAdminRoot');
  // pb.files.getUrl() returns '' on this SDK build → build the file URL manually.
  function pbFileUrl(rec, fname) {
    if (!rec || !fname) return '';
    const coll = rec.collectionId || rec.collectionName || 'articles';
    return getPb().baseUrl.replace(/\/$/, '') + '/api/files/' + coll + '/' + rec.id + '/' + fname;
  }

  function injectStyles() {
    if (document.getElementById('blogAdminStyles')) return;
    const s = document.createElement('style'); s.id = 'blogAdminStyles';
    s.textContent = `
      .ba-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
      .ba-card{background:var(--surface,#161b24);border:1px solid var(--border,#262c38);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
      .ba-card-cover{height:130px;background:#0e131a;display:flex;align-items:center;justify-content:center}
      .ba-card-cover img{width:100%;height:100%;object-fit:contain;padding:10px}
      .ba-card-b{padding:12px 14px;display:flex;flex-direction:column;gap:8px;flex:1}
      .ba-card-title{font-weight:700;font-size:15px;line-height:1.3}
      .ba-card-meta{display:flex;gap:12px;font-size:12px;opacity:.7;flex-wrap:wrap}
      .ba-card-actions{display:flex;gap:6px;margin-top:auto}
      .ba-badge{font-size:11px;padding:2px 8px;border-radius:20px;background:#334155;color:#e2e8f0}
      .ba-badge.pub{background:#16a34a33;color:#4ade80}
      .ba-stat{display:inline-flex;gap:4px;align-items:center}
      .ba-tabs{display:flex;gap:6px;margin:14px 0 0}
      .ba-tab{padding:8px 16px;border-radius:10px 10px 0 0;cursor:pointer;border:1px solid var(--border,#262c38);border-bottom:none;background:transparent;opacity:.6}
      .ba-tab.on{opacity:1;background:var(--surface,#161b24);font-weight:700}
      .ba-pane{border:1px solid var(--border,#262c38);border-radius:0 12px 12px 12px;padding:16px}
      .ba-field{margin:0 0 12px}
      .ba-field label{display:block;font-size:12px;font-weight:600;opacity:.8;margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px}
      .ba-rte{border-radius:9px;overflow:hidden}
      .ba-rte .ql-toolbar{border:1px solid var(--border,#2a3140);border-bottom:none;border-radius:9px 9px 0 0;background:#0e131a}
      .ba-rte .ql-container{border:1px solid var(--border,#2a3140);border-radius:0 0 9px 9px;font:inherit;font-size:15px;background:#0e131a}
      .ba-rte .ql-editor{min-height:200px;color:#e2e8f0;line-height:1.7}
      .ba-rte .ql-editor.ql-blank::before{color:#64748b;font-style:normal}
      .ba-rte .ql-toolbar .ql-stroke{stroke:#cbd5e1}
      .ba-rte .ql-toolbar .ql-fill{fill:#cbd5e1}
      .ba-rte .ql-toolbar .ql-picker{color:#cbd5e1}
      .ba-rte .ql-toolbar button:hover .ql-stroke,.ba-rte .ql-toolbar button.ql-active .ql-stroke,.ba-rte .ql-toolbar .ql-picker-label:hover .ql-stroke{stroke:#3b82f6}
      .ba-rte .ql-toolbar button:hover .ql-fill,.ba-rte .ql-toolbar button.ql-active .ql-fill{fill:#3b82f6}
      .ba-rte .ql-toolbar button:hover,.ba-rte .ql-toolbar button.ql-active,.ba-rte .ql-toolbar .ql-picker-label:hover{color:#3b82f6}
      .ba-rte .ql-toolbar .ql-picker-options{background:#0e131a;border-color:#2a3140}
      .ba-rte .ql-editor a{color:#60a5fa}
      .ba-rte .ql-editor blockquote{border-left:3px solid #3b82f6;color:#cbd5e1;padding-left:14px}
      .ba-rte .ql-editor h2,.ba-rte .ql-editor h3{color:#f1f5f9}
      .ba-input{width:100%;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:9px;padding:10px 12px;color:inherit;font:inherit}
      .ba-prod{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border,#262c38);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--surface,#161b24)}
      .ba-prod img{width:60px;height:60px;object-fit:contain;background:#fff;border-radius:8px;flex:0 0 60px}
      .ba-prod-ord{display:flex;flex-direction:column;gap:4px}
      .ba-mini{padding:4px 9px;border-radius:8px;border:1px solid var(--border,#3a4150);background:transparent;color:inherit;cursor:pointer;font-size:12px}
      .bk-tab.on{background:#7c3aed;border-color:#7c3aed;color:#fff;font-weight:700}
      .bk-blocks{margin-top:6px}
      .bk-block{border:1px solid var(--border,#2a3140);border-radius:10px;padding:9px 11px;margin-bottom:8px;background:rgba(124,58,237,.04)}
      .bk-block-bar{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;opacity:.8;text-transform:uppercase;letter-spacing:.3px}
      .bk-block-ord{display:inline-flex;gap:4px}
      .ba-prod-kind{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:1px 7px;border-radius:6px;margin-bottom:4px}
      .ba-prod-kind.k-product{background:#1d4ed833;color:#60a5fa}
      .ba-prod-kind.k-subscription{background:#7c3aed33;color:#a78bfa}
      .ba-prod-kind.k-custom{background:#05966933;color:#34d399}
      .ba-results{position:absolute;z-index:30;left:0;right:0;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:10px;max-height:300px;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.5)}
      .ba-results div.hit{padding:9px 12px;cursor:pointer;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border,#222936)}
      .ba-results div.hit:hover{background:#1a2230}
    `;
    document.head.appendChild(s);
  }

  async function loadCats() {
    if (_cats.length) return;
    try {
      const r = await window.TsClient.request('GET', '/collections/products/documents/search?q=*&query_by=name&per_page=0&facet_by=category&max_facet_values=80');
      _cats = ((r.facet_counts && r.facet_counts[0] && r.facet_counts[0].counts) || []).map((c) => c.value).filter(Boolean).sort();
    } catch (_) { _cats = []; }
  }
  async function uploadCover(input) {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      // a record id is required to attach a file → save a draft first if new
      if (!_editing.id) { syncPane(); await blogSave('draft', true); }
      if (!_editing.id) { toast('Save the article first', 'w'); return; }
      const fd = new FormData(); fd.append('coverFile', file);
      const rec = await getPb().collection('articles').update(_editing.id, fd, { $autoCancel: false });
      _editing.coverFile = rec.coverFile; _editing.cover = '';
      const u = pbFileUrl(rec, rec.coverFile);
      const prev = document.getElementById('b_cover_prev'); if (prev) { prev.src = u; prev.style.display = 'block'; }
      const ci = document.getElementById('b_cover'); if (ci) ci.value = '';
      toast('Cover uploaded', 's');
    } catch (e) { toast('Upload failed: ' + e.message, 'e'); }
  }
  async function uploadProdImage(input, i) {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      if (!_editing.id) { flushEditors(); syncPane(); await blogSave('draft', true); }
      if (!_editing.id) { toast('Önce makaleyi kaydet', 'w'); return; }
      const fd = new FormData(); fd.append('media+', file); // append to multi-file field
      const rec = await getPb().collection('articles').update(_editing.id, fd, { $autoCancel: false });
      const fname = Array.isArray(rec.media) ? rec.media[rec.media.length - 1] : rec.media;
      const url = pbFileUrl(rec, fname);
      if (_products[i]) { _products[i].image = url; renderProducts(); }
      toast('Görsel yüklendi', 's');
    } catch (e) { toast('Yükleme başarısız: ' + e.message, 'e'); }
  }
  // Upload a device image into a specific content block of item i.
  async function uploadBlockImage(input, i, j) {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      if (!_editing.id) { flushEditors(); syncPane(); await blogSave('draft', true); }
      if (!_editing.id) { toast('Önce makaleyi kaydet', 'w'); return; }
      const fd = new FormData(); fd.append('media+', file);
      const rec = await getPb().collection('articles').update(_editing.id, fd, { $autoCancel: false });
      const fname = Array.isArray(rec.media) ? rec.media[rec.media.length - 1] : rec.media;
      const url = pbFileUrl(rec, fname);
      if (_products[i] && _products[i].blocks && _products[i].blocks[j]) { _products[i].blocks[j].url = url; renderProducts(); }
      toast('Görsel yüklendi', 's');
    } catch (e) { toast('Yükleme başarısız: ' + e.message, 'e'); }
  }

  // Each content item holds an ordered list of `blocks` (text + image). Older
  // articles only had desc/desc2/image/layout — migrate them to blocks on the
  // fly so the editor and the website both speak one model.
  function ensureBlocks(p) {
    if (Array.isArray(p.blocks)) {
      if (!p.blocks.length) p.blocks.push({ t: 'text', tr: '', en: '', de: '' });
      return;
    }
    const blocks = [];
    const hasD1 = ['tr', 'en', 'de'].some((c) => p['desc_' + c]);
    const hasD2 = ['tr', 'en', 'de'].some((c) => p['desc2_' + c]);
    const img = p.image || p.imageUrl || p.logo || '';
    const txt = (k) => ({ t: 'text', tr: p[k + '_tr'] || '', en: p[k + '_en'] || '', de: p[k + '_de'] || '' });
    const imgBlock = () => ({ t: 'image', url: img, pos: p.layout === 'left' ? 'left' : p.layout === 'right' ? 'right' : 'full', size: p.imgSize || 'm' });
    const layout = p.layout || 'split';
    if (layout === 'top') { if (img) blocks.push(imgBlock()); if (hasD1) blocks.push(txt('desc')); if (hasD2) blocks.push(txt('desc2')); }
    else if (layout === 'text') { if (hasD1) blocks.push(txt('desc')); if (hasD2) blocks.push(txt('desc2')); }
    else { if (hasD1) blocks.push(txt('desc')); if (img) blocks.push(imgBlock()); if (hasD2) blocks.push(txt('desc2')); }
    if (!blocks.some((b) => b.t === 'text')) blocks.push({ t: 'text', tr: '', en: '', de: '' });
    p.blocks = blocks;
  }
  function blogBlockAdd(i, type) {
    const p = _products[i]; if (!p) return; ensureBlocks(p);
    p.blocks.push(type === 'image' ? { t: 'image', url: '', pos: 'right', size: 'm' } : { t: 'text', tr: '', en: '', de: '' });
    renderProducts();
  }
  function blogBlockRemove(i, j) {
    const p = _products[i]; if (!p || !p.blocks) return;
    p.blocks.splice(j, 1);
    if (!p.blocks.length) p.blocks.push({ t: 'text', tr: '', en: '', de: '' });
    renderProducts();
  }
  function blogBlockMove(i, j, d) {
    const p = _products[i]; if (!p || !p.blocks) return;
    const k = j + d; if (k < 0 || k >= p.blocks.length) return;
    const tmp = p.blocks[j]; p.blocks[j] = p.blocks[k]; p.blocks[k] = tmp; renderProducts();
  }
  function blogBlockField(i, j, key, v) { const p = _products[i]; if (p && p.blocks && p.blocks[j]) p.blocks[j][key] = v; }

  // Wikipedia/Wikimedia "File:"/"Dosya:" page → direct image (Special:FilePath).
  function _normImg(url) {
    const u = String(url || '').trim();
    const m = u.match(/^https?:\/\/[^/]*\bwiki(?:pedia|media)\.org\/wiki\/(?:File|Dosya|Datei|Fichier|Archivo):(.+)$/i);
    return m ? ('https://commons.wikimedia.org/wiki/Special:FilePath/' + m[1]) : u;
  }
  // Editor preview that mirrors the website: direct → /api/img proxy → warning.
  function _imgPreviewHtml(url) {
    if (!url) return '';
    const nu = _normImg(url);
    const px = (getPb().baseUrl || '').replace(/\/$/, '') + '/api/img?url=' + encodeURIComponent(nu);
    const onerr = "if(this.getAttribute('data-st')!=='px'){this.setAttribute('data-st','px');this.src=this.getAttribute('data-px')}else{this.style.display='none';var w=this.parentElement.querySelector('.bk-imgwarn');if(w)w.style.display='inline-block'}";
    const onload = "var w=this.parentElement.querySelector('.bk-imgwarn');if(w)w.style.display='none'";
    return `<div style="margin-top:8px"><img src="${esc(nu)}" data-px="${esc(px)}" style="max-height:78px;border-radius:8px;background:#fff" onload="${onload}" onerror="${onerr}"/><span class="bk-imgwarn" style="display:none;font-size:11px;color:#f59e0b">⚠ Görsel yüklenemedi — doğrudan görsel linki gerekli (.png/.jpg/.svg) ya da “Yükle” ile cihazdan ekle.</span></div>`;
  }

  // ── analytics aggregation (from article_events) ────────────────
  async function loadStats() {
    _stats = {};
    try {
      const evs = await getPb().collection('article_events').getFullList({ fields: 'slug,type,duration', $autoCancel: false, batch: 2000 });
      for (const e of evs) {
        const s = _stats[e.slug] || (_stats[e.slug] = { view: 0, read: 0, like: 0, dur: 0 });
        if (s[e.type] != null) s[e.type] += 1;
        if (e.type === 'read') s.dur += Number(e.duration) || 0;
      }
    } catch (_) { /* events may be empty */ }
  }
  function avgRead(s) { return s && s.read ? Math.round(s.dur / s.read) : 0; }

  // ── LIST ──────────────────────────────────────────────────────
  async function loadBlogAdmin() {
    injectStyles();
    const el = root(); if (!el) return;
    el.innerHTML = '<div style="padding:24px;opacity:.6">Loading…</div>';
    try {
      await loadStats();
      const items = await getPb().collection('articles').getFullList({ sort: '-updated', $autoCancel: false });
      const badge = document.getElementById('blogCount'); if (badge) badge.textContent = items.length;
      if (!items.length) { el.innerHTML = '<div style="padding:32px;text-align:center;opacity:.6">No articles yet.<br>Click “+ New article” to write one.</div>'; return; }
      const tot = items.reduce((acc, a) => { const s = _stats[a.slug] || {}; acc.v += s.view || 0; acc.l += s.like || 0; acc.r += s.read || 0; acc.dur += s.dur || 0; return acc; }, { v: 0, l: 0, r: 0, dur: 0 });
      const totAvg = tot.r ? Math.round(tot.dur / tot.r) : 0;
      const summary = `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">
        ${[['👁 Görüntüleme', tot.v], ['❤ Beğeni', tot.l], ['📖 Okuma', tot.r], ['⏱ Ort. süre', totAvg + 's'], ['📝 Makale', items.length]].map(([k, val]) =>
        `<div style="flex:1;min-width:130px;background:var(--surface,#161b24);border:1px solid var(--border,#262c38);border-radius:12px;padding:14px 16px"><div style="font-size:12px;opacity:.6">${k}</div><div style="font-size:24px;font-weight:800">${val}</div></div>`).join('')}</div>`;
      el.innerHTML = summary + `<div class="ba-grid">${items.map((a) => {
        const st = _stats[a.slug] || {};
        const lp0 = (a.products || [])[0] || {};
        const lcov = a.cover || (a.coverFile ? pbFileUrl(a, a.coverFile) : '') || lp0.image || lp0.imageUrl || '';
        return `<div class="ba-card">
          <div class="ba-card-cover"><img src="${esc(lcov)}" onerror="this.style.visibility='hidden'"/></div>
          <div class="ba-card-b">
            <div><span class="ba-badge ${a.status === 'published' ? 'pub' : ''}">${esc(a.status)}</span></div>
            <div class="ba-card-title">${esc(a.title_tr || a.title_en || a.slug)}</div>
            <div class="ba-card-meta">
              <span class="ba-stat">👁 ${st.view || 0}</span>
              <span class="ba-stat">❤ ${st.like || 0}</span>
              <span class="ba-stat">📖 ${st.read || 0}</span>
              <span class="ba-stat">⏱ ${avgRead(st)}s</span>
              <span class="ba-stat">📅 ${esc(String(a.publishedAt || a.created || '').slice(0, 10))}</span>
            </div>
            <div class="ba-card-actions">
              <button class="btn btn-primary btn-sm" onclick="blogEdit('${a.id}')">Edit</button>
              <a class="btn btn-ghost btn-sm" href="${SITE}/blog/${esc(a.slug)}" target="_blank">View</a>
              <button class="btn btn-ghost btn-sm" onclick="blogDelete('${a.id}','${esc(a.slug)}')">Delete</button>
            </div>
          </div></div>`;
      }).join('')}</div>`;
    } catch (e) { el.innerHTML = `<div style="padding:24px;color:#ef4444">Error: ${esc(e.message)}</div>`; }
  }

  async function blogNew() {
    injectStyles();
    await loadCats();
    _editing = { id: '', slug: '', status: 'draft', category: '', cover: '', publishedAt: toDtLocal(new Date()) };
    _products = []; _lang = 'tr';
    renderEditor();
  }
  async function blogEdit(id) {
    injectStyles();
    await loadCats();
    try {
      const a = await getPb().collection('articles').getOne(id, { $autoCancel: false });
      _editing = a; _lang = 'tr';
      _products = Array.isArray(a.products) ? a.products.map((p) => ({ ...p })) : [];
      _editing.publishedAt = toDtLocal(a.publishedAt);
      renderEditor();
    } catch (e) { toast('Load failed: ' + e.message, 'e'); }
  }
  async function blogDelete(id, slug) {
    if (!confirm(`Delete article "${slug}"?`)) return;
    try { await getPb().collection('articles').delete(id, { $autoCancel: false }); toast('Deleted', 's'); loadBlogAdmin(); }
    catch (e) { toast('Delete failed: ' + e.message, 'e'); }
  }

  // ── EDITOR ────────────────────────────────────────────────────
  function renderEditor() {
    const a = _editing; const el = root(); if (!el) return;
    const fp0 = _products[0] || {};
    const coverPrev = a.coverFile && a.id ? pbFileUrl(a, a.coverFile) : (a.cover || fp0.image || fp0.imageUrl || '');
    el.innerHTML = `
      <div class="card" style="padding:18px;max-width:920px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px">
          <button class="btn btn-ghost" onclick="loadBlogAdmin()">← Back</button>
          <strong style="font-size:16px">${a.id ? 'Edit article' : 'New article'}</strong>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" onclick="blogPreview()">👁 Önizle</button>
            <button class="btn btn-ghost" onclick="blogSave('draft')">Save draft</button>
            <button class="btn btn-primary" onclick="blogSave('published')">Publish</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="ba-field"><label>Publish date</label><input class="ba-input" id="b_pub" type="datetime-local" value="${esc(a.publishedAt || '')}" /></div>
          <div class="ba-field"><label>Status</label><select class="ba-input" id="b_status">
            <option value="draft"${a.status !== 'published' ? ' selected' : ''}>draft</option>
            <option value="published"${a.status === 'published' ? ' selected' : ''}>published</option></select></div>
          <div class="ba-field"><label>Category</label>
            <input class="ba-input" id="b_category" list="b_catlist" value="${esc(a.category || '')}" placeholder="kategori seç ya da yaz…" />
            <datalist id="b_catlist">${_cats.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
          </div>
          <div class="ba-field"><label>Author <span style="opacity:.5">(opsiyonel)</span></label><input class="ba-input" id="b_author" value="${esc(a.author || '')}" placeholder="boş bırakılabilir" /></div>
        </div>
        <div style="font-size:12px;opacity:.6;margin:-4px 0 10px">Slug (URL), etiketler ve SEO meta <b>her dil sekmesinde ayrı</b> ↓</div>
        <div class="ba-field"><label>Kapak görseli <span style="opacity:.5">— varsayılan: ilk ürün görseli · değiştirmek için ürün seç / yükle / URL</span></label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <input type="file" accept="image/*" onchange="blogUploadCover(this)" />
            <span style="opacity:.5">veya</span>
            <input class="ba-input" style="flex:1;min-width:220px" id="b_cover" value="${esc(a.cover || '')}" placeholder="https://…" oninput="blogSetCover(this.value)" />
            <button class="ba-mini" onclick="blogSetCover('__default__')" title="Varsayılana dön (ilk ürün görseli)">↺ İlk ürün</button>
          </div>
          <div id="b_coverthumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
          <img id="b_cover_prev" src="${esc(coverPrev)}" style="max-height:140px;margin-top:10px;border-radius:10px;background:#fff;${coverPrev ? '' : 'display:none'}" onerror="this.style.display='none'" />
        </div>
        <div class="ba-tabs">${LANGS.map(([c, n]) => `<div class="ba-tab ${c === _lang ? 'on' : ''}" onclick="blogTab('${c}')">${n}</div>`).join('')}</div>
        <div class="ba-pane" id="b_pane"></div>
        <h3 style="margin:20px 0 8px">İçerik öğeleri <span style="opacity:.5;font-weight:400;font-size:13px">— ürün, abonelik veya özel öğe · sıralı</span></h3>
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
          <button type="button" class="ba-mini bk-tab on" data-k="product" onclick="blogPickKind('product')">🛒 Ürün</button>
          <button type="button" class="ba-mini bk-tab" data-k="subscription" onclick="blogPickKind('subscription')">📺 Abonelik</button>
          <button type="button" class="ba-mini bk-tab" data-k="custom" onclick="blogPickKind('custom')">✏️ Özel öğe</button>
        </div>
        <div id="b_pick_product" class="bk-pane">
          <div style="position:relative" class="ba-field">
            <input class="ba-input" id="b_prodsearch" placeholder="🔍 Ürün adı yaz (sitedeki katalogdan)…" autocomplete="off" oninput="blogProdSearch(this.value)" />
            <div id="b_prodresults" class="ba-results" style="display:none"></div>
          </div>
        </div>
        <div id="b_pick_subscription" class="bk-pane" style="display:none">
          <div style="position:relative" class="ba-field">
            <input class="ba-input" id="b_subsearch" placeholder="🔍 Abonelik adı yaz (Netflix, Spotify…) — Abonelikler sayfasına linklenir" autocomplete="off" oninput="blogSubSearch(this.value)" />
            <div id="b_subresults" class="ba-results" style="display:none"></div>
          </div>
        </div>
        <div id="b_pick_custom" class="bk-pane" style="display:none">
          <button class="ba-mini" onclick="blogCustomAdd()" style="padding:10px 16px;font-size:13px;font-weight:700">+ Özel öğe ekle</button>
          <div style="opacity:.5;font-size:12px;margin-top:8px">PB'de olmayan ürün/abonelik için boş bir öğe ekler. İsim, bağlantı, görsel, düzen ve açıklamaları aşağıda <b>ürünle birebir aynı</b> şekilde doldurursun.</div>
        </div>
        <div id="b_prodlist" style="margin-top:12px"></div>
        <h3 style="margin:24px 0 8px">Bitiş yazısı / Conclusion <span style="opacity:.5;font-weight:400;font-size:13px">— ürünlerden sonra · aktif dil sekmesi</span></h3>
        <div class="ba-field"><div id="b_concl_wrap" class="ba-rte"></div></div>
        <h3 style="margin:24px 0 8px">Yorumlar <span style="opacity:.5;font-weight:400;font-size:13px">— moderasyon (uygunsuzları sil)</span></h3>
        <div id="b_comments" style="opacity:.6;font-size:13px">${a.id ? 'Yükleniyor…' : 'Önce makaleyi kaydet.'}</div>
      </div>`;
    renderPane();
    renderProducts();
    renderCoverThumbs();
    initEditors();
    if (a.id) loadComments();
  }

  function effectiveCover() {
    const a = _editing; const fp = _products[0] || {};
    if (a.cover) return a.cover;
    if (a.coverFile && a.id) { try { return pbFileUrl(a, a.coverFile); } catch (_) { /* */ } }
    return fp.image || fp.imageUrl || '';
  }
  function renderCoverThumbs() {
    const box = document.getElementById('b_coverthumbs'); if (!box) return;
    const imgs = _products.map((p) => p.image || p.imageUrl || '').filter(Boolean);
    const cur = _editing.cover || '';
    box.innerHTML = imgs.map((u, i) => `<img src="${esc(u)}" title="${i === 0 ? 'İlk ürün (varsayılan)' : 'Ürün görseli'} — kapak yap" onclick="blogSetCover('${esc(u).replace(/'/g, "\\'")}')" style="width:54px;height:54px;object-fit:contain;background:#fff;border-radius:8px;cursor:pointer;border:2px solid ${cur === u || (!cur && !_editing.coverFile && i === 0) ? '#7c3aed' : 'transparent'}" />`).join('')
      || '<span style="opacity:.5;font-size:12px">Ürün ekleyince görselleri buradan kapak seçebilirsin.</span>';
    if (!_editing.cover && !_editing.coverFile) { const prev = document.getElementById('b_cover_prev'); const eff = effectiveCover(); if (prev) { prev.src = eff; prev.style.display = eff ? 'block' : 'none'; } }
  }
  function blogSetCover(url) {
    if (url === '__default__') { const fp = _products[0] || {}; url = fp.image || fp.imageUrl || ''; }
    _editing.cover = url || '';
    if (url) _editing.coverFile = ''; // an explicit cover URL overrides an uploaded file
    const ci = document.getElementById('b_cover'); if (ci) ci.value = url || '';
    const prev = document.getElementById('b_cover_prev'); const eff = effectiveCover();
    if (prev) { prev.src = eff; prev.style.display = eff ? 'block' : 'none'; }
    renderCoverThumbs();
  }

  async function loadComments() {
    const box = document.getElementById('b_comments'); if (!box || !_editing.id) return;
    try {
      const key = 'blog:' + (_editing.slug || '');
      const res = await getPb().collection('reviews').getList(1, 100, { filter: `productId = "${(key).replace(/"/g, '\\"')}"`, sort: '-created', $autoCancel: false });
      const items = res.items || [];
      if (!items.length) { box.innerHTML = '<div style="opacity:.5">Henüz yorum yok.</div>'; return; }
      box.style.opacity = '1';
      box.innerHTML = items.map((c) => `<div style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border,#262c38);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px"><b>${esc(c.authorDisplayName || 'User')}</b> <span style="opacity:.5">· ${esc(String(c.created || '').slice(0, 10))}</span>${c.rating ? ` <span style="color:#f59e0b">${'★'.repeat(Number(c.rating) || 0)}</span>` : ''}</div>
          <div style="font-size:14px;margin-top:3px;white-space:pre-wrap;word-break:break-word">${esc(c.text || '')}</div>
        </div>
        <button class="ba-mini" style="color:#f87171" onclick="blogDeleteComment('${c.id}')" title="Sil">🗑</button>
      </div>`).join('');
    } catch (e) { box.innerHTML = `<div style="color:#ef4444">Yorumlar yüklenemedi: ${esc(e.message)}</div>`; }
  }
  async function blogDeleteComment(id) {
    if (!confirm('Bu yorumu sil?')) return;
    try { await getPb().collection('reviews').delete(id, { $autoCancel: false }); toast('Yorum silindi', 's'); loadComments(); }
    catch (e) { toast('Silinemedi: ' + e.message, 'e'); }
  }
  async function blogPreview() {
    flushEditors(); syncPane();
    try {
      await blogSave(_editing.status === 'published' ? 'published' : 'draft', true);
      if (!_editing.id) { toast('Önce kaydet', 'w'); return; }
      const slug = _editing.slug || slugify(_editing.title_tr || '');
      window.open(`${SITE}/blog/${encodeURIComponent(slug)}?previewId=${_editing.id}`, '_blank');
    } catch (e) { toast('Önizleme başarısız: ' + e.message, 'e'); }
  }

  function blogTab(c) { flushEditors(); syncPane(); _lang = c; document.querySelectorAll('.ba-tab').forEach((t) => t.classList.remove('on')); renderPaneTabs(); renderPane(); renderProducts(); initEditors(); }
  function renderPaneTabs() { const tabs = document.querySelectorAll('.ba-tab'); LANGS.forEach(([c], i) => { if (tabs[i]) tabs[i].classList.toggle('on', c === _lang); }); }
  function syncPane() {
    const a = _editing; const c = _lang;
    const g = (id) => (document.getElementById(id) || {}).value;
    if (document.getElementById('p_title') != null) {
      a['title_' + c] = g('p_title'); a['lead_' + c] = g('p_lead'); a['slug_' + c] = g('p_slug');
      a['tags_' + c] = g('p_tags'); a['metaTitle_' + c] = g('p_metaTitle'); a['metaDescription_' + c] = g('p_metaDescription');
    }
    flushEditors();
  }
  function renderPane() {
    const a = _editing; const c = _lang; const pane = document.getElementById('b_pane'); if (!pane) return;
    const ln = (LANGS.find(([x]) => x === c) || [])[1] || c;
    pane.innerHTML = `
      <div class="ba-field"><label>Title</label><input class="ba-input" id="p_title" value="${esc(a['title_' + c] || '')}" /></div>
      <div class="ba-field"><label>Slug · ${esc(ln)} <span style="opacity:.5">(URL — boşsa başlıktan üretilir)</span></label><input class="ba-input" id="p_slug" value="${esc(a['slug_' + c] || '')}" placeholder="${c === 'en' ? 'best-phones-2026' : c === 'de' ? 'beste-handys-2026' : 'en-iyi-telefonlar-2026'}" /></div>
      <div class="ba-field"><label>Short description (lead)</label><textarea class="ba-input" id="p_lead" rows="2">${esc(a['lead_' + c] || '')}</textarea></div>
      <div class="ba-field"><label>Intro / general text</label><div id="p_body_wrap" class="ba-rte"></div></div>
      <div class="ba-field"><label>Etiketler · ${esc(ln)} <span style="opacity:.5">(virgülle ayır)</span></label><input class="ba-input" id="p_tags" value="${esc(a['tags_' + c] || '')}" placeholder="telefon, 2026, amiral gemisi" /></div>
      <details class="ba-field"><summary style="cursor:pointer;font-size:12px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.4px">SEO · ${esc(ln)} (opsiyonel)</summary>
        <div class="ba-field" style="margin-top:10px"><label>Meta title <span style="opacity:.5">(boşsa başlık)</span></label><input class="ba-input" id="p_metaTitle" value="${esc(a['metaTitle_' + c] || '')}" /></div>
        <div class="ba-field"><label>Meta description <span style="opacity:.5">(boşsa özet)</span></label><textarea class="ba-input" id="p_metaDescription" rows="2">${esc(a['metaDescription_' + c] || '')}</textarea></div>
      </details>`;
  }

  function renderProducts() {
    const box = document.getElementById('b_prodlist'); if (!box) return;
    const langName = (LANGS.find(([c]) => c === _lang) || [])[1] || _lang;
    _products.forEach(ensureBlocks);
    box.innerHTML = _products.map((p, i) => `
      <div class="ba-prod">
        <div class="ba-prod-ord">
          <button class="ba-mini" onclick="blogProdMove(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="ba-mini" onclick="blogProdMove(${i},1)" ${i === _products.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <img src="${esc(p.image || p.imageUrl || p.logo || '')}" onerror="this.style.visibility='hidden'"/>
        <div style="flex:1;min-width:0">
          ${(() => { const k = p.kind || 'product'; const kl = k === 'subscription' ? '📺 Abonelik' : k === 'custom' ? '✏️ Özel' : '🛒 Ürün'; return `<span class="ba-prod-kind k-${k}">${kl}</span>`; })()}
          ${(p.kind || 'product') === 'custom'
            ? `<div style="font-weight:700;display:flex;gap:6px;align-items:center"><span>${i + 1}.</span><input class="ba-input" style="font-size:13px;font-weight:700;padding:4px 8px" value="${esc(p['name_' + _lang] || '')}" placeholder="İsim (${esc(langName)})" oninput="blogProdField(${i},'name_${_lang}',this.value)" /></div>
               <div style="font-size:11px;opacity:.5;margin:2px 0 6px">İsim her dil için ayrı — sekmeyi değiştirip ${esc(langName)} adını yaz</div>
               <div style="margin:0 0 8px"><input class="ba-input" style="font-size:12px" value="${esc(p.link || '')}" placeholder="Bağlantı (opsiyonel) https://…" oninput="blogProdField(${i},'link',this.value)" /></div>`
            : `<div style="font-weight:700">${i + 1}. ${esc(p.name)}</div>
               <div style="opacity:.55;font-size:12px;margin-bottom:8px">${(p.kind === 'subscription') ? `→ /subscriptions${p.affiliateUrl || p.website ? ' · resmi site' : ''}` : `→ /product/${esc(p.slug)}-${esc(p.id)}`} · <b>${esc(langName)}</b></div>`}
          <div class="bk-blocks">
            ${p.blocks.map((b, j) => b.t === 'image'
              ? `<div class="bk-block">
                   <div class="bk-block-bar"><span>🖼 Görsel ${j + 1}</span><span class="bk-block-ord"><button class="ba-mini" onclick="blogBlockMove(${i},${j},-1)" ${j === 0 ? 'disabled' : ''}>↑</button><button class="ba-mini" onclick="blogBlockMove(${i},${j},1)" ${j === p.blocks.length - 1 ? 'disabled' : ''}>↓</button><button class="ba-mini" style="color:#f87171" onclick="blogBlockRemove(${i},${j})">✕</button></span></div>
                   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
                     <input class="ba-input" style="flex:1;min-width:150px;font-size:12px" placeholder="Görsel URL" value="${esc(b.url || '')}" oninput="blogBlockField(${i},${j},'url',this.value)" />
                     <label class="ba-mini" style="cursor:pointer;white-space:nowrap">📷 Yükle<input type="file" accept="image/*" style="display:none" onchange="blogUploadBlockImage(this,${i},${j})"></label>
                     <select class="ba-input" style="width:165px;font-size:12px" onchange="blogBlockField(${i},${j},'pos',this.value)" title="Konum">
                       ${[['left', '◧ Solda · yazı sağda'], ['right', '◨ Sağda · yazı solda'], ['full', '▭ Tam genişlik']].map(([v, n]) => `<option value="${v}"${(b.pos || 'full') === v ? ' selected' : ''}>${n}</option>`).join('')}
                     </select>
                     <select class="ba-input" style="width:95px;font-size:12px" onchange="blogBlockField(${i},${j},'size',this.value)" title="Boyut">
                       ${[['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük']].map(([v, n]) => `<option value="${v}"${(b.size || 'm') === v ? ' selected' : ''}>🖼 ${n}</option>`).join('')}
                     </select>
                   </div>
                   ${_imgPreviewHtml(b.url)}
                   <div style="font-size:11px;opacity:.5;margin-top:4px">Her görsel linki çalışır (Wikipedia “Dosya:” sayfası dahil) — olmazsa “Yükle” ile cihazdan ekle · Üst/alt için bloğu ↑↓ taşı (önce=üstte, sonra=altta)</div>
                 </div>`
              : `<div class="bk-block">
                   <div class="bk-block-bar"><span>✍ Metin ${j + 1} · ${esc(langName)}</span><span class="bk-block-ord"><button class="ba-mini" onclick="blogBlockMove(${i},${j},-1)" ${j === 0 ? 'disabled' : ''}>↑</button><button class="ba-mini" onclick="blogBlockMove(${i},${j},1)" ${j === p.blocks.length - 1 ? 'disabled' : ''}>↓</button><button class="ba-mini" style="color:#f87171" onclick="blogBlockRemove(${i},${j})">✕</button></span></div>
                   <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
                     <select class="ba-input" style="width:170px;font-size:12px" onchange="blogBlockField(${i},${j},'style',this.value)" title="Metin tipi">
                       ${[['paragraph', '¶ Paragraf'], ['heading', '◆ Büyük başlık'], ['subheading', '— Alt başlık'], ['bullets', '• Madde listesi']].map(([v, n]) => `<option value="${v}"${(b.style || 'paragraph') === v ? ' selected' : ''}>${n}</option>`).join('')}
                     </select>
                     <span style="font-size:11px;opacity:.55">Madde listesi: her satır = bir madde · vurgu için <b>**kalın**</b></span>
                   </div>
                   <textarea class="ba-input" style="font-size:13px;margin-top:6px" rows="4" placeholder="${(b.style || 'paragraph') === 'bullets' ? 'Her satır bir madde olur' : (b.style === 'heading' || b.style === 'subheading') ? 'Başlık metni' : 'Paragraf metni — her satır ayrı görünür'} (${esc(langName)})" oninput="blogBlockField(${i},${j},'${_lang}',this.value)">${esc(b[_lang] || '')}</textarea>
                 </div>`).join('')}
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="ba-mini" onclick="blogBlockAdd(${i},'text')">＋ Metin</button>
              <button class="ba-mini" onclick="blogBlockAdd(${i},'image')">＋ Görsel</button>
            </div>
          </div>
        </div>
        <button class="ba-mini" onclick="blogProdRemove(${i})" style="color:#f87171">✕</button>
      </div>`).join('') || '<div style="opacity:.5;padding:8px">Henüz öğe eklenmedi.</div>';
    renderCoverThumbs();
  }

  function blogProdSearch(q) {
    clearTimeout(_searchTimer);
    const res = document.getElementById('b_prodresults');
    if (!q || q.trim().length < 2) { if (res) res.style.display = 'none'; return; }
    _searchTimer = setTimeout(async () => {
      try {
        const r = await window.TsClient.search(q, { perPage: 8 });
        const hits = (r.hits || []).map((h) => h.document);
        res.innerHTML = hits.map((d) => `<div class="hit" onclick='blogProdAdd(${JSON.stringify({ id: d.id, slug: d.slug || '', name: d.name, brand: d.brand || '', techScore: d.techScore || 0, imageUrl: d.imageUrl || '' }).replace(/'/g, "&#39;")})'>
            <img src="${esc(d.imageUrl || '')}" style="width:34px;height:34px;object-fit:contain;background:#fff;border-radius:6px"/>
            <span>${esc(d.name)} <span style="opacity:.5">${esc(d.brand || '')}</span></span></div>`).join('') || '<div style="padding:10px;opacity:.6">No match</div>';
        res.style.display = 'block';
      } catch (e) { /* ignore */ }
    }, 250);
  }
  function blogProdAdd(p) {
    if (!p || !p.id) return;
    p.kind = 'product';
    if (!_products.some((x) => x.id === p.id)) { p.slug = p.slug || slugify(p.name); _products.push(p); renderProducts(); }
    const res = document.getElementById('b_prodresults'); if (res) res.style.display = 'none';
    const inp = document.getElementById('b_prodsearch'); if (inp) inp.value = '';
  }
  function blogProdRemove(i) { _products.splice(i, 1); renderProducts(); }
  function blogProdMove(i, d) { const j = i + d; if (j < 0 || j >= _products.length) return; const t = _products[i]; _products[i] = _products[j]; _products[j] = t; renderProducts(); }
  function blogProdField(i, key, v) { if (_products[i]) _products[i][key] = v; }

  // Switch the active item-picker pane (product / subscription / custom).
  function blogPickKind(k) {
    _pickKind = k;
    document.querySelectorAll('.bk-tab').forEach((t) => t.classList.toggle('on', t.getAttribute('data-k') === k));
    ['product', 'subscription', 'custom'].forEach((kk) => { const el = document.getElementById('b_pick_' + kk); if (el) el.style.display = kk === k ? 'block' : 'none'; });
    const focusId = k === 'product' ? 'b_prodsearch' : k === 'subscription' ? 'b_subsearch' : '';
    if (focusId) setTimeout(() => document.getElementById(focusId)?.focus(), 30);
  }

  // Search the PocketBase `subscriptions` collection by name (Netflix, Spotify…).
  function blogSubSearch(q) {
    clearTimeout(_subSearchTimer);
    const res = document.getElementById('b_subresults');
    if (!q || q.trim().length < 2) { if (res) res.style.display = 'none'; return; }
    _subSearchTimer = setTimeout(async () => {
      try {
        const r = await getPb().collection('subscriptions').getList(1, 8, {
          filter: `name ~ "${q.replace(/"/g, '\\"')}"`, sort: 'name', $autoCancel: false,
        });
        const hits = r.items || [];
        res.innerHTML = hits.map((d) => `<div class="hit" onclick='blogSubAdd(${JSON.stringify({ id: d.id, slug: d.slug || '', name: d.name, logo: d.logo || '', website: d.website || '', affiliateUrl: d.affiliateUrl || '', category: d.category || '' }).replace(/'/g, '&#39;')})'>
            <img src="${esc(d.logo || '')}" style="width:34px;height:34px;object-fit:contain;background:#fff;border-radius:6px"/>
            <span>${esc(d.name)} <span style="opacity:.5">${esc(d.category || '')}</span></span></div>`).join('') || '<div style="padding:10px;opacity:.6">Eşleşme yok</div>';
        res.style.display = 'block';
      } catch (e) { if (res) { res.innerHTML = `<div style="padding:10px;color:#ef4444">${esc(e.message)}</div>`; res.style.display = 'block'; } }
    }, 250);
  }
  function blogSubAdd(s) {
    if (!s || !s.id) return;
    if (!_products.some((x) => x.kind === 'subscription' && x.id === s.id)) {
      _products.push({ kind: 'subscription', id: s.id, slug: s.slug || slugify(s.name), name: s.name, image: '', imageUrl: s.logo || '', logo: s.logo || '', website: s.website || '', affiliateUrl: s.affiliateUrl || '', category: s.category || '' });
      renderProducts();
    }
    const res = document.getElementById('b_subresults'); if (res) res.style.display = 'none';
    const inp = document.getElementById('b_subsearch'); if (inp) inp.value = '';
  }
  // Add a blank manual item (custom product/subscription that isn't in PB). It
  // lands in the list immediately with the SAME inline controls as a product —
  // editable name + link, image (URL or upload), layout template, image size and
  // both description blocks — so non-PB items are first-class, not a stripped form.
  function blogCustomAdd() {
    _products.push({ kind: 'custom', id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), slug: '', name: '', link: '', image: '', imageUrl: '', blocks: [{ t: 'text', tr: '', en: '', de: '' }] });
    renderProducts();
    setTimeout(() => {
      const list = document.getElementById('b_prodlist');
      const cards = list ? list.querySelectorAll('.ba-prod') : [];
      const last = cards[cards.length - 1];
      if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); const inp = last.querySelector('input'); if (inp) inp.focus(); }
    }, 40);
  }

  async function blogSave(forceStatus, silent) {
    syncPane();
    const a = _editing;
    const val = (id) => (document.getElementById(id) || {}).value || '';
    const slug = slugify(a.slug_tr || a.title_tr || '');
    if (!slug) { toast('TR başlık (ya da TR slug) gerekli', 'w'); return; }
    if (!a.title_tr) { toast('TR title required', 'w'); return; }
    const data = {
      slug, status: forceStatus || val('b_status') || 'draft',
      category: val('b_category'), cover: val('b_cover'),
      author: val('b_author').trim(),
      publishedAt: val('b_pub') ? new Date(val('b_pub')).toISOString() : (a.publishedAt || new Date().toISOString()),
      // Custom items carry a per-language name (name_tr/en/de). Keep a fallback
      // `name` (first filled language) + slug so the website can filter/link
      // them, and drop items with no name in any language.
      products: _products
        .map((p) => {
          if ((p.kind || 'product') !== 'custom') return p;
          const nm = (p.name_tr || p.name_en || p.name_de || p.name || '').trim();
          return { ...p, name: nm, slug: slugify(nm) };
        })
        .filter((p) => (p.kind || 'product') !== 'custom' || String(p.name || '').trim()),
    };
    LANGS.forEach(([c]) => {
      data['title_' + c] = a['title_' + c] || ''; data['lead_' + c] = a['lead_' + c] || '';
      data['body_' + c] = a['body_' + c] || ''; data['conclusion_' + c] = a['conclusion_' + c] || '';
      data['tags_' + c] = (a['tags_' + c] || '').trim();
      data['metaTitle_' + c] = (a['metaTitle_' + c] || '').trim();
      data['metaDescription_' + c] = (a['metaDescription_' + c] || '').trim();
    });
    // Per-language slugs so a TR/EN/DE visitor reaches the same article from its
    // own URL. Preserve any existing slug, otherwise derive from that language's
    // title (fallback to the canonical slug).
    LANGS.forEach(([c]) => { data['slug_' + c] = slugify(a['slug_' + c] || a['title_' + c] || '') || slug; });
    try {
      if (a.id) await getPb().collection('articles').update(a.id, data, { $autoCancel: false });
      else { const rec = await getPb().collection('articles').create(data, { $autoCancel: false }); _editing.id = rec.id; _editing.coverFile = rec.coverFile; _editing.publishedAt = toDtLocal(rec.publishedAt); }
      if (!silent) { toast(data.status === 'published' ? 'Published — live on the site now' : 'Draft saved', 's'); loadBlogAdmin(); }
    } catch (e) { toast('Save failed: ' + e.message, 'e'); if (silent) throw e; }
  }

  window.loadBlogAdmin = loadBlogAdmin;
  window.blogNew = blogNew; window.blogEdit = blogEdit; window.blogDelete = blogDelete;
  window.blogSave = blogSave; window.blogTab = blogTab;
  window.blogProdSearch = blogProdSearch; window.blogProdAdd = blogProdAdd;
  window.blogProdRemove = blogProdRemove; window.blogProdMove = blogProdMove; window.blogProdField = blogProdField;
  window.blogPickKind = blogPickKind; window.blogSubSearch = blogSubSearch; window.blogSubAdd = blogSubAdd; window.blogCustomAdd = blogCustomAdd;
  window.blogBlockAdd = blogBlockAdd; window.blogBlockRemove = blogBlockRemove; window.blogBlockMove = blogBlockMove; window.blogBlockField = blogBlockField; window.blogUploadBlockImage = uploadBlockImage;
  window.blogUploadCover = uploadCover;
  window.blogUploadProdImage = uploadProdImage;
  window.blogSetCover = blogSetCover;
  window.blogPreview = blogPreview;
  window.blogDeleteComment = blogDeleteComment;
})();
