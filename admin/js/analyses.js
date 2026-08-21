// ══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Analizler (`analyses` koleksiyonu)
//
//  NE ISE YARAR: sitenin tek OZGUN varligi AI analizi ve Tech Score. Spec
//  tablosu ve fiyat Epey'den geliyor, onlarca Turk sitesinde birebir ayni
//  duruyor. Bu ekran, o analizleri YAYINLANABILIR sayfaya cevirir.
//
//  AKIS: urun sec → uret (AI) → duzenle → onayla → yayinla.
//  Yayin butonu YALNIZ burada. Uretici betik (web/scripts/gen-analysis.mjs)
//  her seyi TASLAK yazar; hicbir kayit insan onayi olmadan yayina cikmaz.
//  Bu teknik degil politik bir sinir: 107k urune otomatik AI metni basmak
//  olcekli-icerik ihlalidir, tek tek onaylanan analiz degildir.
//
//  PROMPT TEK KOPYA: admin/js/analysis_prompt.js — Node uretecinin kosturdugu
//  dosyanin AYNISI. Iki taraf ayni metni uretmek zorunda; "ayni mantigi iki
//  yerde tut" ayrisir (bkz. spec_i18n dersi).
//
//  Diller: TR + EN (Almanca 2026-08-21'de kaldirildi).
// ══════════════════════════════════════════════════════════════
(function () {
  const LANGS = [['tr', '🇹🇷 Türkçe'], ['en', '🇬🇧 English']];
  const SITE = 'https://qorai.net';
  const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
  const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';

  let _items = [];
  let _editing = null;
  let _lang = 'tr';
  let _searchTimer = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const slugify = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  const kelime = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;

  // ── stiller ────────────────────────────────────────────────
  function styles() {
    if ($('anStyles')) return;
    const s = document.createElement('style');
    s.id = 'anStyles';
    s.textContent = `
      .an-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
      .an-bar input,.an-bar select{padding:8px 10px;border:1px solid #d8dee9;border-radius:6px;font:inherit}
      .an-grid{display:grid;gap:10px}
      .an-row{display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;
        border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#fff}
      .an-row img{width:56px;height:56px;object-fit:contain;border-radius:6px;background:#f1f5f9}
      .an-row h4{margin:0 0 3px;font-size:15px}
      .an-meta{font-size:12px;color:#64748b;display:flex;gap:10px;flex-wrap:wrap}
      .an-pill{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
        padding:2px 7px;border-radius:4px}
      .an-pill.pub{color:#047857;background:rgba(4,120,87,.09)}
      .an-pill.draft{color:#92400e;background:rgba(146,64,14,.09)}
      .an-acts{display:flex;gap:6px;flex-wrap:wrap}
      .an-ed{display:grid;grid-template-columns:1fr 320px;gap:18px;align-items:start}
      @media(max-width:1000px){.an-ed{grid-template-columns:1fr}}
      .an-card{border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#fff;margin-bottom:12px}
      .an-card h3{margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
      .an-f{margin-bottom:10px}
      .an-f label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px}
      .an-f input,.an-f textarea,.an-f select{width:100%;padding:8px 10px;border:1px solid #d8dee9;
        border-radius:6px;font:inherit;box-sizing:border-box}
      .an-f textarea{min-height:90px;resize:vertical;font-family:ui-monospace,Consolas,monospace;font-size:13px}
      .an-tabs{display:flex;gap:6px;margin-bottom:12px}
      .an-tabs button{padding:6px 12px;border:1px solid #d8dee9;background:#fff;border-radius:6px;cursor:pointer}
      .an-tabs button.on{background:#1565C0;color:#fff;border-color:#1565C0}
      .an-hint{font-size:12px;color:#64748b;margin-top:4px}
      .an-pick{border:1px solid #e2e8f0;border-radius:6px;max-height:260px;overflow:auto}
      .an-pick div{padding:8px 10px;border-bottom:1px solid #f1f5f9;cursor:pointer;display:flex;gap:10px;align-items:center}
      .an-pick div:hover{background:#f8fafc}
      .an-pick img{width:34px;height:34px;object-fit:contain}
      .an-faq{border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:8px}
      .an-warn{background:rgba(146,64,14,.07);border-left:3px solid #92400e;padding:10px 12px;
        border-radius:4px;font-size:13px;color:#7c2d12;margin-bottom:12px}
    `;
    document.head.appendChild(s);
  }

  // ── liste ──────────────────────────────────────────────────
  async function loadAnalysesAdmin() {
    styles();
    const root = $('analysesAdminRoot');
    if (!root) return;
    root.innerHTML = '<p style="color:#64748b">Yükleniyor…</p>';
    try {
      _items = await getPb().collection('analyses').getFullList({ sort: '-updated', $autoCancel: false });
    } catch (e) {
      root.innerHTML = `<p style="color:#b91c1c">Yüklenemedi: ${esc(e.message || e)}</p>`;
      return;
    }
    const cnt = $('analysesCount');
    if (cnt) cnt.textContent = _items.length;
    renderList();
  }

  function renderList(filtre = '', durum = '') {
    const root = $('analysesAdminRoot');
    if (!root) return;
    const f = filtre.trim().toLowerCase();
    const list = _items.filter((a) => {
      if (durum && a.status !== durum) return false;
      if (!f) return true;
      return [a.productName, a.title_tr, a.title_en, a.slug, a.category]
        .some((x) => String(x || '').toLowerCase().includes(f));
    });
    const yayin = _items.filter((a) => a.status === 'published').length;

    root.innerHTML = `
      <div class="an-bar">
        <input id="anSearch" placeholder="Ürün, başlık ya da slug ara…" style="min-width:260px" value="${esc(filtre)}">
        <select id="anStatus">
          <option value="">Tümü (${_items.length})</option>
          <option value="draft"${durum === 'draft' ? ' selected' : ''}>Taslak (${_items.length - yayin})</option>
          <option value="published"${durum === 'published' ? ' selected' : ''}>Yayında (${yayin})</option>
        </select>
        <button class="btn btn-primary" onclick="analysesNew()">+ Yeni analiz</button>
      </div>
      ${list.length ? `<div class="an-grid">${list.map(rowHtml).join('')}</div>`
    : '<p style="color:#64748b">Kayıt yok. “+ Yeni analiz” ile ürün seçip başlayabilirsin.</p>'}
    `;
    const si = $('anSearch');
    if (si) {
      si.oninput = () => { clearTimeout(_searchTimer); _searchTimer = setTimeout(() => renderList(si.value, $('anStatus').value), 200); };
      si.focus(); si.setSelectionRange(si.value.length, si.value.length);
    }
    const st = $('anStatus');
    if (st) st.onchange = () => renderList($('anSearch').value, st.value);
  }

  function rowHtml(a) {
    const t = a.title_tr || a.title_en || a.productName || '(başlıksız)';
    const w = kelime(a.body_tr) || kelime(a.body_en);
    return `
      <div class="an-row">
        <img src="${esc(a.productImage || '')}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <h4>${esc(t)}</h4>
          <div class="an-meta">
            <span class="an-pill ${a.status === 'published' ? 'pub' : 'draft'}">${a.status === 'published' ? 'yayında' : 'taslak'}</span>
            <span>${esc(a.productName || '—')}</span>
            <span>${esc(a.category || '')}</span>
            <span>${w} kelime</span>
            ${a.techScore ? `<span>skor ${a.techScore}/100</span>` : ''}
          </div>
        </div>
        <div class="an-acts">
          ${a.status === 'published' ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${SITE}/analiz/${esc(a.slug)}">Sitede aç</a>` : ''}
          <button class="btn" onclick="analysesEdit('${a.id}')">Düzenle</button>
          <button class="btn btn-ghost" onclick="analysesDelete('${a.id}')">Sil</button>
        </div>
      </div>`;
  }

  // ── ürün seçimi (Typesense) ────────────────────────────────
  async function urunAra(q) {
    const qs = new URLSearchParams({
      q, query_by: 'name', per_page: '12',
      include_fields: 'id,name,slug,brand,category,imageUrl,techScore,specsCount',
    });
    const r = await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, {
      headers: { 'X-TYPESENSE-API-KEY': TS_KEY },
    });
    if (!r.ok) throw new Error(`arama ${r.status}`);
    return ((await r.json()).hits || []).map((h) => h.document);
  }

  function analysesNew() {
    styles();
    const root = $('analysesAdminRoot');
    root.innerHTML = `
      <button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Geri</button>
      <div class="an-card" style="max-width:640px;margin-top:12px">
        <h3>Analiz edilecek ürünü seç</h3>
        <div class="an-f">
          <input id="anPickQ" placeholder="Ürün adı yaz… (örn. Galaxy S26 Ultra)" autofocus>
          <div class="an-hint">Analiz, ürünün katalogdaki gerçek spec'lerine dayanır. Spec'i zayıf ürün seçme.</div>
        </div>
        <div id="anPickList" class="an-pick"></div>
      </div>`;
    const inp = $('anPickQ');
    inp.oninput = () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(async () => {
        const q = inp.value.trim();
        if (q.length < 2) { $('anPickList').innerHTML = ''; return; }
        try {
          const hits = await urunAra(q);
          $('anPickList').innerHTML = hits.map((d) => `
            <div onclick="analysesPick('${d.id}')">
              <img src="${esc(d.imageUrl || '')}" alt="" onerror="this.style.visibility='hidden'">
              <div>
                <div style="font-weight:600">${esc(d.name)}</div>
                <div style="font-size:12px;color:#64748b">${esc(d.brand || '')} · ${esc(d.category || '')} · skor ${d.techScore || 0}/100 · ${d.specsCount || 0} spec</div>
              </div>
            </div>`).join('') || '<div style="color:#64748b">Sonuç yok</div>';
          window.__anHits = hits;
        } catch (e) { $('anPickList').innerHTML = `<div style="color:#b91c1c">${esc(e.message)}</div>`; }
      }, 250);
    };
  }

  async function analysesPick(id) {
    const d = (window.__anHits || []).find((x) => x.id === id);
    if (!d) return;
    const mevcut = _items.find((a) => a.productId === d.id);
    if (mevcut) { toast('Bu ürünün analizi zaten var, düzenleniyor', 'i'); analysesEdit(mevcut.id); return; }
    _editing = {
      productId: d.id,
      productSlug: d.slug || slugify(d.name),
      productName: d.name,
      productImage: d.imageUrl || '',
      productBrand: d.brand || '',
      category: d.category || '',
      techScore: Number(d.techScore) || 0,
      slug: slugify(d.slug || d.name),
      status: 'draft',
      author: 'Qor AI',
      views: 0,
      likes: 0,
    };
    renderEditor();
  }

  async function analysesEdit(id) {
    styles();
    try {
      _editing = await getPb().collection('analyses').getOne(id, { $autoCancel: false });
      renderEditor();
    } catch (e) { toast(`Açılamadı: ${e.message}`, 'e'); }
  }

  // ── editör ─────────────────────────────────────────────────
  function renderEditor() {
    const a = _editing;
    const root = $('analysesAdminRoot');
    const L = _lang;
    const faq = Array.isArray(a[`faq_${L}`]) ? a[`faq_${L}`] : [];
    root.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Geri</button>
        <strong>${esc(a.productName || 'Yeni analiz')}</strong>
        <span class="an-pill ${a.status === 'published' ? 'pub' : 'draft'}">${a.status === 'published' ? 'yayında' : 'taslak'}</span>
      </div>

      ${a.status !== 'published' ? `<div class="an-warn">
        Bu analiz <strong>taslak</strong>. Yayınla dediğin an <code>/analiz/${esc(a.slug)}</code>
        adresinde herkese açılır ve bir sonraki derlemede sitemap'e girer.
        Yayınlamadan önce metni oku — AI çıktısı onaylanmadan yayına çıkmamalı.
      </div>` : ''}

      <div class="an-tabs">
        ${LANGS.map(([c, n]) => `<button class="${c === L ? 'on' : ''}" onclick="analysesLang('${c}')">${n}</button>`).join('')}
      </div>

      <div class="an-ed">
        <div>
          <div class="an-card">
            <h3>İçerik — ${esc(LANGS.find((x) => x[0] === L)[1])}</h3>
            <div class="an-f"><label>Başlık (H1 + &lt;title&gt;)</label>
              <input id="anTitle" value="${esc(a[`title_${L}`] || '')}"></div>
            <div class="an-f"><label>Giriş (lead)</label>
              <textarea id="anLead" style="min-height:64px">${esc(a[`lead_${L}`] || '')}</textarea></div>
            <div class="an-f"><label>Gövde (HTML — h2/h3/p/ul/li/strong/em)</label>
              <textarea id="anBody" style="min-height:320px">${esc(a[`body_${L}`] || '')}</textarea>
              <div class="an-hint" id="anWords">${kelime(a[`body_${L}`])} kelime</div></div>
            <div class="an-f"><label>Sonuç / hüküm (HTML)</label>
              <textarea id="anVerdict" style="min-height:90px">${esc(a[`verdict_${L}`] || '')}</textarea></div>
          </div>

          <div class="an-card">
            <h3>Sık sorulan sorular — FAQPage şeması</h3>
            <div id="anFaq">${faq.map((f, i) => faqHtml(f, i)).join('')}</div>
            <button class="btn btn-ghost" onclick="analysesFaqAdd()">+ Soru ekle</button>
            <div class="an-hint">Bu sorular sayfaya FAQPage JSON-LD olarak eklenir. İnsanların arama kutusuna gerçekten yazdığı sorular olmalı.</div>
          </div>
        </div>

        <div>
          <div class="an-card">
            <h3>Yayın</h3>
            <div class="an-f"><label>Adres (slug)</label>
              <input id="anSlug" value="${esc(a.slug || '')}">
              <div class="an-hint">${SITE}/analiz/<span id="anSlugEcho">${esc(a.slug || '')}</span></div></div>
            <div class="an-f"><label>Durum</label>
              <select id="anStatusSel">
                <option value="draft"${a.status !== 'published' ? ' selected' : ''}>Taslak</option>
                <option value="published"${a.status === 'published' ? ' selected' : ''}>Yayında</option>
              </select></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="analysesSave()">Kaydet</button>
              <button class="btn" onclick="analysesGenerate()">🧠 AI ile üret</button>
            </div>
            <div class="an-hint">“AI ile üret”, seçili dildeki metni ürünün katalog spec'lerinden yeniden yazar. Mevcut metnin üzerine yazar.</div>
          </div>

          <div class="an-card">
            <h3>SEO</h3>
            <div class="an-f"><label>Meta başlık</label>
              <input id="anMetaTitle" value="${esc(a[`metaTitle_${L}`] || '')}"></div>
            <div class="an-f"><label>Meta açıklama</label>
              <textarea id="anMetaDesc" style="min-height:70px;font-family:inherit">${esc(a[`metaDescription_${L}`] || '')}</textarea>
              <div class="an-hint" id="anMetaLen"></div></div>
          </div>

          <div class="an-card">
            <h3>Ürün</h3>
            <div style="display:flex;gap:10px;align-items:center">
              <img src="${esc(a.productImage || '')}" style="width:52px;height:52px;object-fit:contain;background:#f1f5f9;border-radius:6px" onerror="this.style.visibility='hidden'">
              <div style="font-size:13px">
                <div style="font-weight:600">${esc(a.productName || '')}</div>
                <div style="color:#64748b">${esc(a.productBrand || '')} · ${esc(a.category || '')}</div>
                <div style="color:#64748b">Tech Score ${a.techScore || 0}/100</div>
              </div>
            </div>
            <div class="an-hint" style="margin-top:8px">
              <a href="${SITE}/product/${esc(a.productSlug || '')}" target="_blank" rel="noopener">Ürün sayfasını aç →</a>
            </div>
          </div>
        </div>
      </div>`;

    const b = $('anBody');
    if (b) b.oninput = () => { $('anWords').textContent = `${kelime(b.value)} kelime`; };
    const sl = $('anSlug');
    if (sl) sl.oninput = () => { $('anSlugEcho').textContent = sl.value; };
    const md = $('anMetaDesc');
    const metaLen = () => {
      const n = md.value.length;
      $('anMetaLen').textContent = `${n} / 155 karakter${n > 155 ? ' — çok uzun, Google kesecek' : ''}`;
      $('anMetaLen').style.color = n > 155 ? '#b91c1c' : '#64748b';
    };
    if (md) { md.oninput = metaLen; metaLen(); }
  }

  function faqHtml(f, i) {
    return `<div class="an-faq" data-i="${i}">
      <div class="an-f"><label>Soru ${i + 1}</label><input class="an-q" value="${esc(f.q || '')}"></div>
      <div class="an-f"><label>Cevap</label><textarea class="an-a" style="min-height:60px;font-family:inherit">${esc(f.a || '')}</textarea></div>
      <button class="btn btn-ghost" onclick="analysesFaqDel(${i})">Kaldır</button>
    </div>`;
  }

  function faqTopla() {
    return [...document.querySelectorAll('#anFaq .an-faq')].map((el) => ({
      q: el.querySelector('.an-q').value.trim(),
      a: el.querySelector('.an-a').value.trim(),
    })).filter((f) => f.q && f.a);
  }

  function alanlariTopla() {
    const L = _lang;
    const a = _editing;
    a.slug = slugify($('anSlug').value) || a.slug;
    a.status = $('anStatusSel').value;
    a[`title_${L}`] = $('anTitle').value.trim();
    a[`lead_${L}`] = $('anLead').value.trim();
    a[`body_${L}`] = $('anBody').value;
    a[`verdict_${L}`] = $('anVerdict').value;
    a[`metaTitle_${L}`] = $('anMetaTitle').value.trim();
    a[`metaDescription_${L}`] = $('anMetaDesc').value.trim();
    a[`faq_${L}`] = faqTopla();
    if (!a[`slug_${L}`]) a[`slug_${L}`] = slugify(`${a.productName}-${L === 'tr' ? 'analiz' : 'review'}`);
  }

  function analysesLang(c) { alanlariTopla(); _lang = c; renderEditor(); }
  function analysesFaqAdd() {
    const L = _lang;
    _editing[`faq_${L}`] = [...faqTopla(), { q: '', a: '' }];
    const cur = { ...(_editing) };
    alanlariTopla();
    _editing[`faq_${L}`] = [...cur[`faq_${L}`]];
    renderEditor();
  }
  function analysesFaqDel(i) {
    const L = _lang;
    const list = faqTopla();
    list.splice(i, 1);
    alanlariTopla();
    _editing[`faq_${L}`] = list;
    renderEditor();
  }

  // ── kaydet ─────────────────────────────────────────────────
  async function analysesSave() {
    alanlariTopla();
    const a = _editing;
    if (!a.slug) { toast('Slug boş olamaz', 'e'); return; }
    // Yayina alirken EN AZ bir dilde gercek metin sart; bos sayfa yayinlamak
    // tam da kacinmaya calistigimiz "ince icerik".
    if (a.status === 'published') {
      const varMi = LANGS.some(([c]) => kelime(a[`body_${c}`]) >= 150 && String(a[`title_${c}`] || '').trim());
      if (!varMi) { toast('Yayınlamak için en az bir dilde başlık + 150 kelime gövde gerekli', 'e'); return; }
      if (!a.publishedAt) a.publishedAt = new Date().toISOString();
    }
    try {
      const rec = a.id
        ? await getPb().collection('analyses').update(a.id, a, { $autoCancel: false })
        : await getPb().collection('analyses').create(a, { $autoCancel: false });
      _editing = rec;
      toast(a.status === 'published' ? 'Yayınlandı' : 'Taslak kaydedildi', 's');
      loadAnalysesAdmin();
    } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'e'); }
  }

  async function analysesDelete(id) {
    if (!confirm('Bu analiz silinsin mi? Geri alınamaz.')) return;
    try {
      await getPb().collection('analyses').delete(id, { $autoCancel: false });
      toast('Silindi', 's');
      loadAnalysesAdmin();
    } catch (e) { toast(`Silinemedi: ${e.message}`, 'e'); }
  }

  // ── AI üretimi ─────────────────────────────────────────────
  // Prompt admin/js/analysis_prompt.js'ten; Node ureteci AYNI dosyayi kosturur.
  async function analysesGenerate() {
    const P = globalThis.QorAiAnalysisPrompt;
    if (!P) { toast('analysis_prompt.js yüklenmedi', 'e'); return; }
    const a = _editing;
    const L = _lang;
    if (!a.productId) { toast('Önce ürün seç', 'e'); return; }
    toast('Analiz üretiliyor, bu 20-40 saniye sürebilir…', 'i', 8000);
    try {
      // Katalogdaki gercek spec'ler + ayni kategoriden alternatifler
      const [dRes, aRes] = await Promise.all([
        fetch(`${TS_URL}/collections/products/documents/search?${new URLSearchParams({ q: '*', query_by: 'name', filter_by: `id:=${a.productId}`, per_page: '1', include_fields: 'id,_raw' })}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } }),
        fetch(`${TS_URL}/collections/products/documents/search?${new URLSearchParams({ q: '*', query_by: 'name', filter_by: `category:=${a.category} && id:!=${a.productId} && lowestPriceUSD:>0`, sort_by: 'techScore:desc', per_page: '5', include_fields: 'name,techScore' })}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } }),
      ]);
      const raw = JSON.parse(((await dRes.json()).hits || [])[0].document._raw);
      const alts = ((await aRes.json()).hits || []).map((h) => h.document);

      let specs = {};
      try {
        const S = globalThis.QorAiSpecI18n;
        const m = S && S.localizeProduct(raw, L === 'tr' ? 'tr' : 'en', {});
        specs = (m && m.keySpecs) || {};
      } catch (_) { specs = {}; }

      const prompt = P.buildYayinAnaliziPrompt({
        name: raw.name, brand: raw.brand, category: raw.category,
        techScore: raw.techScore, specs,
        alternatives: alts.map((x) => ({ name: x.name, techScore: x.techScore })),
      }, L);

      const base = getPb().baseUrl.replace(/\/$/, '');
      const r = await fetch(`${base}/api/ai/gemini`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          systemInstruction: { parts: [{ text: 'You output only valid JSON. No markdown fences.' }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.8, responseMimeType: 'application/json' },
        }),
      });
      if (!r.ok) throw new Error(`gemini ${r.status}`);
      const data = await r.json();
      const txt = ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || '').join('');
      const norm = P.normalizeAnaliz(JSON.parse(txt));
      if (!norm.title || !norm.sections.length) throw new Error('boş analiz döndü');

      a[`title_${L}`] = norm.title;
      a[`lead_${L}`] = norm.lead;
      a[`metaTitle_${L}`] = norm.title;
      a[`metaDescription_${L}`] = norm.metaDescription || norm.lead.slice(0, 155);
      a[`body_${L}`] = P.analizHtml(norm, L);
      a[`verdict_${L}`] = norm.verdict ? `<p>${esc(norm.verdict)}</p>` : '';
      a[`faq_${L}`] = norm.faq;
      renderEditor();
      toast(`Üretildi: ${norm.sections.length} bölüm, ${norm.faq.length} SSS. Yayınlamadan önce oku.`, 's', 7000);
    } catch (e) { toast(`Üretilemedi: ${e.message}`, 'e'); }
  }

  window.loadAnalysesAdmin = loadAnalysesAdmin;
  window.analysesNew = analysesNew;
  window.analysesPick = analysesPick;
  window.analysesEdit = analysesEdit;
  window.analysesSave = analysesSave;
  window.analysesDelete = analysesDelete;
  window.analysesLang = analysesLang;
  window.analysesFaqAdd = analysesFaqAdd;
  window.analysesFaqDel = analysesFaqDel;
  window.analysesGenerate = analysesGenerate;
})();
