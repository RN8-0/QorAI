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
  let _stats = {};   // slug -> {views, likes, reads}
  let _cats = [];    // site category tokens for the datalist

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slugify(v) {
    return String(v || '').trim().toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  const root = () => document.getElementById('blogAdminRoot');

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
      .ba-input{width:100%;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:9px;padding:10px 12px;color:inherit;font:inherit}
      .ba-prod{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border,#262c38);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--surface,#161b24)}
      .ba-prod img{width:60px;height:60px;object-fit:contain;background:#fff;border-radius:8px;flex:0 0 60px}
      .ba-prod-ord{display:flex;flex-direction:column;gap:4px}
      .ba-mini{padding:4px 9px;border-radius:8px;border:1px solid var(--border,#3a4150);background:transparent;color:inherit;cursor:pointer;font-size:12px}
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
      const u = getPb().files.getURL(rec, rec.coverFile);
      const prev = document.getElementById('b_cover_prev'); if (prev) { prev.src = u; prev.style.display = 'block'; }
      const ci = document.getElementById('b_cover'); if (ci) ci.value = '';
      toast('Cover uploaded', 's');
    } catch (e) { toast('Upload failed: ' + e.message, 'e'); }
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
        return `<div class="ba-card">
          <div class="ba-card-cover"><img src="${esc(a.cover || '')}" onerror="this.style.visibility='hidden'"/></div>
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
    _editing = { id: '', slug: '', status: 'draft', category: '', cover: '', publishedAt: new Date().toISOString().slice(0, 16) };
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
      if (a.publishedAt) _editing.publishedAt = String(a.publishedAt).slice(0, 16);
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
    const coverPrev = a.coverFile && a.id ? getPb().files.getURL(a, a.coverFile) : (a.cover || '');
    el.innerHTML = `
      <div class="card" style="padding:18px;max-width:920px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px">
          <button class="btn btn-ghost" onclick="loadBlogAdmin()">← Back</button>
          <strong style="font-size:16px">${a.id ? 'Edit article' : 'New article'}</strong>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" onclick="blogSave('draft')">Save draft</button>
            <button class="btn btn-primary" onclick="blogSave('published')">Publish</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="ba-field"><label>Slug (URL)</label><input class="ba-input" id="b_slug" value="${esc(a.slug || '')}" placeholder="en-iyi-telefonlar-2026" /></div>
          <div class="ba-field"><label>Publish date</label><input class="ba-input" id="b_pub" type="datetime-local" value="${esc(a.publishedAt || '')}" /></div>
          <div class="ba-field"><label>Category</label>
            <input class="ba-input" id="b_category" list="b_catlist" value="${esc(a.category || '')}" placeholder="kategori seç ya da yaz…" />
            <datalist id="b_catlist">${_cats.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
          </div>
          <div class="ba-field"><label>Status</label><select class="ba-input" id="b_status">
            <option value="draft"${a.status !== 'published' ? ' selected' : ''}>draft</option>
            <option value="published"${a.status === 'published' ? ' selected' : ''}>published</option></select></div>
        </div>
        <div class="ba-field"><label>Cover image — upload from device or paste a URL</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <input type="file" accept="image/*" onchange="blogUploadCover(this)" />
            <span style="opacity:.5">veya</span>
            <input class="ba-input" style="flex:1;min-width:220px" id="b_cover" value="${esc(a.cover || '')}" placeholder="https://…" oninput="var p=document.getElementById('b_cover_prev');p.src=this.value;p.style.display=this.value?'block':'none'" />
          </div>
          <img id="b_cover_prev" src="${esc(coverPrev)}" style="max-height:140px;margin-top:10px;border-radius:10px;background:#fff;${coverPrev ? '' : 'display:none'}" onerror="this.style.display='none'" />
        </div>
        <div class="ba-tabs">${LANGS.map(([c, n]) => `<div class="ba-tab ${c === _lang ? 'on' : ''}" onclick="blogTab('${c}')">${n}</div>`).join('')}</div>
        <div class="ba-pane" id="b_pane"></div>
        <h3 style="margin:20px 0 8px">Products <span style="opacity:.5;font-weight:400;font-size:13px">— link to on-site specs page, ordered</span></h3>
        <div style="position:relative" class="ba-field">
          <input class="ba-input" id="b_prodsearch" placeholder="🔍 Type a product name to add…" autocomplete="off" oninput="blogProdSearch(this.value)" />
          <div id="b_prodresults" class="ba-results" style="display:none"></div>
        </div>
        <div id="b_prodlist"></div>
        <h3 style="margin:24px 0 8px">Bitiş yazısı / Conclusion <span style="opacity:.5;font-weight:400;font-size:13px">— ürünlerden sonra · aktif dil sekmesi</span></h3>
        <div class="ba-field"><textarea class="ba-input" id="b_concl" rows="4" placeholder="Sonuç / kapanış paragrafı…"></textarea></div>
      </div>`;
    renderPane();
    renderProducts();
    renderConcl();
  }

  function blogTab(c) { syncPane(); _lang = c; document.querySelectorAll('.ba-tab').forEach((t) => t.classList.remove('on')); renderPaneTabs(); renderPane(); renderProducts(); renderConcl(); }
  function renderConcl() { const el = document.getElementById('b_concl'); if (el) el.value = _editing['conclusion_' + _lang] || ''; }
  function renderPaneTabs() { const tabs = document.querySelectorAll('.ba-tab'); LANGS.forEach(([c], i) => { if (tabs[i]) tabs[i].classList.toggle('on', c === _lang); }); }
  function syncPane() {
    const a = _editing; const c = _lang;
    const g = (id) => (document.getElementById(id) || {}).value;
    if (document.getElementById('p_title') != null) {
      a['title_' + c] = g('p_title'); a['lead_' + c] = g('p_lead'); a['body_' + c] = g('p_body');
    }
    if (document.getElementById('b_concl') != null) a['conclusion_' + c] = g('b_concl');
  }
  function renderPane() {
    const a = _editing; const c = _lang; const pane = document.getElementById('b_pane'); if (!pane) return;
    pane.innerHTML = `
      <div class="ba-field"><label>Title</label><input class="ba-input" id="p_title" value="${esc(a['title_' + c] || '')}" /></div>
      <div class="ba-field"><label>Short description (lead)</label><textarea class="ba-input" id="p_lead" rows="2">${esc(a['lead_' + c] || '')}</textarea></div>
      <div class="ba-field"><label>Intro / general text (HTML: &lt;p&gt; &lt;h2&gt; &lt;ul&gt;&lt;li&gt; &lt;strong&gt;)</label><textarea class="ba-input" id="p_body" rows="6">${esc(a['body_' + c] || '')}</textarea></div>`;
  }

  function renderProducts() {
    const box = document.getElementById('b_prodlist'); if (!box) return;
    const langName = (LANGS.find(([c]) => c === _lang) || [])[1] || _lang;
    box.innerHTML = _products.map((p, i) => `
      <div class="ba-prod">
        <div class="ba-prod-ord">
          <button class="ba-mini" onclick="blogProdMove(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="ba-mini" onclick="blogProdMove(${i},1)" ${i === _products.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <img src="${esc(p.imageUrl || '')}" onerror="this.style.visibility='hidden'"/>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${i + 1}. ${esc(p.name)} ${p.techScore ? `<span style="opacity:.6;font-weight:400">· ${esc(p.techScore)}/100</span>` : ''}</div>
          <div style="opacity:.55;font-size:12px;margin-bottom:8px">→ /product/${esc(p.slug)}-${esc(p.id)} · <b>${esc(langName)}</b></div>
          <textarea class="ba-input" style="font-size:13px;margin-bottom:6px" rows="2" placeholder="Açıklama (görselin ÜSTÜNDE)" oninput="blogProdField(${i},'desc_${_lang}',this.value)">${esc(p['desc_' + _lang] || '')}</textarea>
          <textarea class="ba-input" style="font-size:13px" rows="2" placeholder="Açıklama (görselin ALTINDA)" oninput="blogProdField(${i},'desc2_${_lang}',this.value)">${esc(p['desc2_' + _lang] || '')}</textarea>
        </div>
        <button class="ba-mini" onclick="blogProdRemove(${i})" style="color:#f87171">✕</button>
      </div>`).join('') || '<div style="opacity:.5;padding:8px">No products added yet.</div>';
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
    if (!_products.some((x) => x.id === p.id)) { p.slug = p.slug || slugify(p.name); _products.push(p); renderProducts(); }
    const res = document.getElementById('b_prodresults'); if (res) res.style.display = 'none';
    const inp = document.getElementById('b_prodsearch'); if (inp) inp.value = '';
  }
  function blogProdRemove(i) { _products.splice(i, 1); renderProducts(); }
  function blogProdMove(i, d) { const j = i + d; if (j < 0 || j >= _products.length) return; const t = _products[i]; _products[i] = _products[j]; _products[j] = t; renderProducts(); }
  function blogProdField(i, key, v) { if (_products[i]) _products[i][key] = v; }

  async function blogSave(forceStatus, silent) {
    syncPane();
    const a = _editing;
    const val = (id) => (document.getElementById(id) || {}).value || '';
    const slug = slugify(val('b_slug') || a.title_tr || '');
    if (!slug) { toast('Slug or TR title required', 'w'); return; }
    if (!a.title_tr) { toast('TR title required', 'w'); return; }
    const data = {
      slug, status: forceStatus || val('b_status') || 'draft',
      category: val('b_category'), cover: val('b_cover'),
      publishedAt: val('b_pub') ? new Date(val('b_pub')).toISOString() : (a.publishedAt || new Date().toISOString()),
      products: _products,
    };
    LANGS.forEach(([c]) => { data['title_' + c] = a['title_' + c] || ''; data['lead_' + c] = a['lead_' + c] || ''; data['body_' + c] = a['body_' + c] || ''; data['conclusion_' + c] = a['conclusion_' + c] || ''; });
    // Per-language slugs so a TR/EN/DE visitor reaches the same article from its
    // own URL. Preserve any existing slug, otherwise derive from that language's
    // title (fallback to the canonical slug).
    LANGS.forEach(([c]) => { data['slug_' + c] = (a['slug_' + c] || '').trim() || slugify(a['title_' + c] || '') || slug; });
    try {
      if (a.id) await getPb().collection('articles').update(a.id, data, { $autoCancel: false });
      else { const rec = await getPb().collection('articles').create(data, { $autoCancel: false }); _editing.id = rec.id; _editing.coverFile = rec.coverFile; _editing.publishedAt = String(rec.publishedAt || '').slice(0, 16); }
      if (!silent) { toast(data.status === 'published' ? 'Published — live on the site now' : 'Draft saved', 's'); loadBlogAdmin(); }
    } catch (e) { toast('Save failed: ' + e.message, 'e'); if (silent) throw e; }
  }

  window.loadBlogAdmin = loadBlogAdmin;
  window.blogNew = blogNew; window.blogEdit = blogEdit; window.blogDelete = blogDelete;
  window.blogSave = blogSave; window.blogTab = blogTab;
  window.blogProdSearch = blogProdSearch; window.blogProdAdd = blogProdAdd;
  window.blogProdRemove = blogProdRemove; window.blogProdMove = blogProdMove; window.blogProdField = blogProdField;
  window.blogUploadCover = uploadCover;
})();
