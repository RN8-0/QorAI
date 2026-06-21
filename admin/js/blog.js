// ══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Blog (articles collection)
//  List / create / edit / delete blog articles. Product picker uses
//  Typesense search and stores the on-site product ref so the public
//  blog links straight to /product/<slug>-<id> (specs page).
// ══════════════════════════════════════════════════════════════
(function () {
  const LANGS = [['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch']];
  let _editing = null;       // current article record/draft
  let _products = [];        // [{id,slug,name,brand,techScore,imageUrl,desc_tr,desc_en,desc_de}]
  let _searchTimer = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slugify(v) {
    return String(v || '').trim().toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  const root = () => document.getElementById('blogAdminRoot');

  // ── LIST ──────────────────────────────────────────────────────
  async function loadBlogAdmin() {
    const el = root(); if (!el) return;
    el.innerHTML = '<div style="padding:24px;opacity:.6">Loading…</div>';
    try {
      const items = await getPb().collection('articles').getFullList({ sort: '-updated', $autoCancel: false });
      const badge = document.getElementById('blogCount'); if (badge) badge.textContent = items.length;
      if (!items.length) { el.innerHTML = '<div style="padding:24px;opacity:.6">No articles yet. Click “+ New article”.</div>'; return; }
      el.innerHTML = `<div class="card" style="overflow:auto"><table class="data-table" style="width:100%">
        <thead><tr><th>Title (TR)</th><th>Slug</th><th>Status</th><th>Products</th><th>Updated</th><th></th></tr></thead>
        <tbody>${items.map((a) => `<tr>
          <td>${esc(a.title_tr || a.title_en || '—')}</td>
          <td><code>${esc(a.slug)}</code></td>
          <td><span class="badge ${a.status === 'published' ? 'badge-green' : ''}">${esc(a.status)}</span></td>
          <td>${(a.products || []).length}</td>
          <td style="white-space:nowrap;opacity:.7">${esc(String(a.updated || '').slice(0, 10))}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" onclick="blogEdit('${a.id}')">Edit</button>
            <a class="btn btn-ghost btn-sm" href="https://qorai.net/blog/${esc(a.slug)}" target="_blank">View</a>
            <button class="btn btn-ghost btn-sm" onclick="blogDelete('${a.id}','${esc(a.slug)}')">Delete</button>
          </td></tr>`).join('')}</tbody></table></div>`;
    } catch (e) { el.innerHTML = `<div style="padding:24px;color:#ef4444">Error: ${esc(e.message)}</div>`; }
  }

  function blogNew() {
    _editing = { id: '', slug: '', status: 'draft', category: '', cover: '' };
    _products = [];
    renderEditor();
  }
  async function blogEdit(id) {
    try {
      const a = await getPb().collection('articles').getOne(id, { $autoCancel: false });
      _editing = a;
      _products = Array.isArray(a.products) ? a.products.map((p) => ({ ...p })) : [];
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
    const langFields = LANGS.map(([code, name]) => `
      <fieldset style="border:1px solid var(--border,#2a2f3a);border-radius:10px;padding:14px;margin:10px 0">
        <legend style="padding:0 8px;font-weight:700">${name}</legend>
        <label class="form-label">Title</label>
        <input class="form-input" id="b_title_${code}" value="${esc(a['title_' + code] || '')}" />
        <label class="form-label">Lead (1-2 sentences)</label>
        <textarea class="form-input" id="b_lead_${code}" rows="2">${esc(a['lead_' + code] || '')}</textarea>
        <label class="form-label">Body (HTML: &lt;h2&gt; &lt;p&gt; &lt;ul&gt;&lt;li&gt; &lt;strong&gt;)</label>
        <textarea class="form-input" id="b_body_${code}" rows="6">${esc(a['body_' + code] || '')}</textarea>
      </fieldset>`).join('');

    el.innerHTML = `
      <div class="card" style="padding:18px;max-width:900px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <button class="btn btn-ghost" onclick="loadBlogAdmin()">← Back</button>
          <strong>${a.id ? 'Edit article' : 'New article'}</strong>
          <button class="btn btn-primary" onclick="blogSave()">Save</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="form-label">Slug (URL)</label><input class="form-input" id="b_slug" value="${esc(a.slug || '')}" placeholder="en-iyi-telefonlar" /></div>
          <div><label class="form-label">Status</label><select class="form-input" id="b_status">
            <option value="draft"${a.status === 'draft' ? ' selected' : ''}>draft</option>
            <option value="published"${a.status === 'published' ? ' selected' : ''}>published</option></select></div>
          <div><label class="form-label">Category (optional)</label><input class="form-input" id="b_category" value="${esc(a.category || '')}" placeholder="smartphones" /></div>
        </div>
        <label class="form-label">Cover image URL</label>
        <input class="form-input" id="b_cover" value="${esc(a.cover || '')}" oninput="document.getElementById('b_cover_prev').src=this.value" />
        <img id="b_cover_prev" src="${esc(a.cover || '')}" style="max-height:120px;margin-top:8px;border-radius:8px;${a.cover ? '' : 'display:none'}" onerror="this.style.display='none'" onload="this.style.display='block'" />
        ${langFields}
        <h3 style="margin:18px 0 8px">Products (link to on-site specs page)</h3>
        <div style="position:relative">
          <input class="form-input" id="b_prodsearch" placeholder="Type a product name…" autocomplete="off" oninput="blogProdSearch(this.value)" />
          <div id="b_prodresults" style="position:absolute;z-index:20;left:0;right:0;background:var(--surface,#1a1f29);border:1px solid var(--border,#2a2f3a);border-radius:8px;max-height:280px;overflow:auto;display:none"></div>
        </div>
        <div id="b_prodlist" style="margin-top:12px"></div>
      </div>`;
    renderProducts();
  }

  function renderProducts() {
    const box = document.getElementById('b_prodlist'); if (!box) return;
    box.innerHTML = _products.map((p, i) => `
      <div style="display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border,#2a2f3a);border-radius:10px;padding:10px;margin-bottom:8px">
        <img src="${esc(p.imageUrl || '')}" style="width:54px;height:54px;object-fit:contain;background:#fff;border-radius:8px" onerror="this.style.visibility='hidden'" />
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${esc(p.name)} ${p.techScore ? `<span style="opacity:.6;font-weight:400">· ${esc(p.techScore)}/100</span>` : ''}</div>
          <div style="opacity:.6;font-size:12px;margin-bottom:6px">→ /product/${esc(p.slug)}-${esc(p.id)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
            ${LANGS.map(([c]) => `<input class="form-input" style="font-size:12px" placeholder="desc ${c}" value="${esc(p['desc_' + c] || '')}" oninput="blogProdDesc(${i},'${c}',this.value)" />`).join('')}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="blogProdRemove(${i})">✕</button>
      </div>`).join('') || '<div style="opacity:.5">No products added.</div>';
  }

  function blogProdSearch(q) {
    clearTimeout(_searchTimer);
    const res = document.getElementById('b_prodresults');
    if (!q || q.trim().length < 2) { if (res) res.style.display = 'none'; return; }
    _searchTimer = setTimeout(async () => {
      try {
        const r = await window.TsClient.search(q, { perPage: 8 });
        const hits = (r.hits || []).map((h) => h.document);
        res.innerHTML = hits.map((d) => `<div style="padding:8px 10px;cursor:pointer;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border,#2a2f3a)"
            onclick='blogProdAdd(${JSON.stringify({ id: d.id, slug: d.slug || '', name: d.name, brand: d.brand || '', techScore: d.techScore || 0, imageUrl: d.imageUrl || '' }).replace(/'/g, "&#39;")})'>
            <img src="${esc(d.imageUrl || '')}" style="width:34px;height:34px;object-fit:contain;background:#fff;border-radius:6px" onerror="this.style.visibility='hidden'" />
            <span>${esc(d.name)} <span style="opacity:.5">${esc(d.brand || '')}</span></span></div>`).join('') || '<div style="padding:10px;opacity:.6">No match</div>';
        res.style.display = 'block';
      } catch (e) { /* ignore */ }
    }, 250);
  }
  function blogProdAdd(p) {
    if (!p || !p.id) return;
    if (!_products.some((x) => x.id === p.id)) {
      p.slug = p.slug || slugify(p.name);
      _products.push(p);
      renderProducts();
    }
    const res = document.getElementById('b_prodresults'); if (res) res.style.display = 'none';
    const inp = document.getElementById('b_prodsearch'); if (inp) inp.value = '';
  }
  function blogProdRemove(i) { _products.splice(i, 1); renderProducts(); }
  function blogProdDesc(i, lang, v) { if (_products[i]) _products[i]['desc_' + lang] = v; }

  async function blogSave() {
    const val = (id) => (document.getElementById(id) || {}).value || '';
    const slug = slugify(val('b_slug') || val('b_title_tr'));
    if (!slug) { toast('Slug or TR title required', 'w'); return; }
    if (!val('b_title_tr')) { toast('TR title required', 'w'); return; }
    const data = {
      slug, status: val('b_status') || 'draft', category: val('b_category'), cover: val('b_cover'),
      products: _products,
    };
    LANGS.forEach(([c]) => { data['title_' + c] = val('b_title_' + c); data['lead_' + c] = val('b_lead_' + c); data['body_' + c] = val('b_body_' + c); });
    try {
      if (_editing && _editing.id) await getPb().collection('articles').update(_editing.id, data, { $autoCancel: false });
      else await getPb().collection('articles').create(data, { $autoCancel: false });
      toast('Saved — live on the site after the next deploy/refresh', 's');
      loadBlogAdmin();
    } catch (e) { toast('Save failed: ' + e.message, 'e'); }
  }

  // expose globals (admin scripts are plain, non-module)
  window.loadBlogAdmin = loadBlogAdmin;
  window.blogNew = blogNew;
  window.blogEdit = blogEdit;
  window.blogDelete = blogDelete;
  window.blogSave = blogSave;
  window.blogProdSearch = blogProdSearch;
  window.blogProdAdd = blogProdAdd;
  window.blogProdRemove = blogProdRemove;
  window.blogProdDesc = blogProdDesc;
})();
