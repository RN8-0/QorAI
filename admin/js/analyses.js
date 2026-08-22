// ══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Analizler (`analyses` koleksiyonu)
//
//  BU EKRAN ANALIZ URETMEZ. Analiz SITEDE, urun sayfasindaki "Analiz Et"
//  akisinda uretilir: gercek quiz, gercek prompt (AiAnalysis.jsx
//  buildFullPrompt), gercek rapor. Sonuc zaten `saved_analyses` icine
//  yaziliyor (pbHistory.saveProductAnalysisHistory).
//
//  Buradaki is TEK SEY: o raporlardan hangisinin YAYINDA olacagini secmek.
//  Ilk surumde admin'e AYRI bir prompt ve blog benzeri bir cikti yazilmisti —
//  yanlisti: yayinlanan sayfa, urun sayfasinda calisan analizden farkli
//  goruntu veriyordu. Ikinci bir uretim yolu tutmak iki sistemin ayrismasi
//  demek; proje bu dersi spec cevirisinde bir kez odedi.
//
//  AKIS: sitede analiz et  ->  burada listeden sec  ->  Yayinla
//  Yayinlanan kayit /analiz/<slug> adresinde AYNI bilesenle (ProductFullReport)
//  cizilir ve sitemap'e girer.
// ══════════════════════════════════════════════════════════════
(function () {
  const LANGS = [['tr', '🇹🇷 Türkçe'], ['en', '🇬🇧 English']];
  const SITE = 'https://qorai.net';

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

  // `saved_analyses.analysisData.analysis` ham AI metnidir; icinde
  // `product_full_report` JSON'u durur (bazen ```json cite ile sarili).
  function raporCoz(ham) {
    if (!ham) return null;
    if (typeof ham === 'object') return ham.product ? ham : null;
    let s = String(ham).trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const ilk = s.indexOf('{');
    const son = s.lastIndexOf('}');
    if (ilk < 0 || son <= ilk) return null;
    try {
      const o = JSON.parse(s.slice(ilk, son + 1));
      return (o && o.product) ? o : null;
    } catch (_) { return null; }
  }

  function styles() {
    if ($('anStyles')) return;
    const s = document.createElement('style');
    s.id = 'anStyles';
    s.textContent = `
      .an-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
      .an-bar input,.an-bar select{padding:8px 10px;border:1px solid #d8dee9;border-radius:6px;font:inherit}
      .an-grid{display:flex;flex-direction:column;gap:10px}
      .an-row{display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;
        border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#fff}
      .an-row img{width:56px;height:56px;object-fit:contain;border-radius:6px;background:#f1f5f9}
      .an-row h4{margin:0 0 3px;font-size:15px}
      .an-meta{font-size:12px;color:#64748b;display:flex;gap:10px;flex-wrap:wrap}
      .an-pill{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:4px}
      .an-pill.pub{color:#047857;background:rgba(4,120,87,.09)}
      .an-pill.draft{color:#92400e;background:rgba(146,64,14,.09)}
      .an-acts{display:flex;gap:6px;flex-wrap:wrap}
      .an-card{border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#fff;margin-bottom:12px;max-width:820px}
      .an-card h3{margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
      .an-f{margin-bottom:10px}
      .an-f label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px}
      .an-f input,.an-f textarea,.an-f select{width:100%;padding:8px 10px;border:1px solid #d8dee9;border-radius:6px;font:inherit;box-sizing:border-box}
      .an-f textarea{min-height:70px;resize:vertical}
      .an-tabs{display:flex;gap:6px;margin-bottom:12px}
      .an-tabs button{padding:6px 12px;border:1px solid #d8dee9;background:#fff;border-radius:6px;cursor:pointer}
      .an-tabs button.on{background:#1565C0;color:#fff;border-color:#1565C0}
      .an-hint{font-size:12px;color:#64748b;margin-top:4px}
      .an-faq{border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:8px}
      .an-note{background:rgba(21,101,192,.06);border-left:3px solid #1565C0;padding:10px 12px;
        border-radius:4px;font-size:13px;margin-bottom:14px;max-width:820px;line-height:1.6}
      .an-rapor{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.6}
      .an-rapor b{display:inline-block;min-width:120px;color:#475569}
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
      return [a.productName, a.slug, a.category].some((x) => String(x || '').toLowerCase().includes(f));
    });
    const yayin = _items.filter((a) => a.status === 'published').length;

    root.innerHTML = `
      <div class="an-note">
        <strong>Analiz burada üretilmez.</strong> Sitede ürün sayfasına gir → <strong>Analiz Et</strong> →
        quiz'i yanıtla → rapor çıksın. Sonra buraya gel, <strong>+ Yeni analiz</strong> ile o raporu seç ve yayınla.
        Yayınlanan sayfa <code>/analiz/&lt;slug&gt;</code> adresinde <em>ürün sayfasındaki raporun birebir aynısı</em>
        olarak çizilir ve sitemap'e girer.
      </div>
      <div class="an-bar">
        <input id="anSearch" placeholder="Ürün ya da slug ara…" style="min-width:240px" value="${esc(filtre)}">
        <select id="anStatus">
          <option value="">Tümü (${_items.length})</option>
          <option value="draft"${durum === 'draft' ? ' selected' : ''}>Taslak (${_items.length - yayin})</option>
          <option value="published"${durum === 'published' ? ' selected' : ''}>Yayında (${yayin})</option>
        </select>
        <button class="btn btn-primary" onclick="analysesNew()">+ Yeni analiz</button>
      </div>
      ${list.length ? `<div class="an-grid">${list.map(rowHtml).join('')}</div>`
    : '<p style="color:#64748b">Kayıt yok.</p>'}`;

    const si = $('anSearch');
    if (si) {
      si.oninput = () => { clearTimeout(_searchTimer); _searchTimer = setTimeout(() => renderList(si.value, $('anStatus').value), 200); };
      si.focus(); si.setSelectionRange(si.value.length, si.value.length);
    }
    const st = $('anStatus');
    if (st) st.onchange = () => renderList($('anSearch').value, st.value);
  }

  function rowHtml(a) {
    const r = a.report && a.report.product ? a.report : null;
    return `
      <div class="an-row">
        <img src="${esc(a.productImage || '')}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <h4>${esc(a.productName || a.slug || '(adsız)')}</h4>
          <div class="an-meta">
            <span class="an-pill ${a.status === 'published' ? 'pub' : 'draft'}">${a.status === 'published' ? 'yayında' : 'taslak'}</span>
            ${a.productBrand ? `<span>${esc(a.productBrand)}</span>` : ''}
            ${r && r.product.matchScore ? `<span>uyum ${r.product.matchScore}/100</span>` : ''}
            ${r && r.product.decision ? `<span>${esc(r.product.decision)}</span>` : ''}
            ${a.techScore ? `<span>Qor AI ${a.techScore}/100</span>` : ''}
            ${!r ? '<span style="color:#b91c1c">rapor verisi YOK</span>' : ''}
          </div>
        </div>
        <div class="an-acts">
          ${a.status === 'published' ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${SITE}/analiz/${esc(a.slug)}">Sitede aç</a>` : ''}
          <button class="btn" onclick="analysesEdit('${a.id}')">Düzenle</button>
          <button class="btn btn-ghost" onclick="analysesDelete('${a.id}')">Sil</button>
        </div>
      </div>`;
  }

  // ── sitede yapilmis analizlerden sec ───────────────────────
  async function analysesNew() {
    styles();
    const root = $('analysesAdminRoot');
    root.innerHTML = `<button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Geri</button>
      <p style="color:#64748b;margin-top:12px">Sitede yapılmış analizler yükleniyor…</p>`;
    let kayitlar = [];
    try {
      kayitlar = await getPb().collection('saved_analyses').getFullList({
        filter: 'category="product_history"', sort: '-savedAt', $autoCancel: false,
      });
    } catch (e) {
      root.innerHTML = `<button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Geri</button>
        <p style="color:#b91c1c;margin-top:12px">Okunamadı: ${esc(e.message || e)}</p>`;
      return;
    }
    // Yalniz GERCEK rapor tasiyanlar — yarim kalmis analiz yayinlanamaz.
    const uygun = kayitlar
      .map((k) => ({ k, rapor: raporCoz(k.analysisData && k.analysisData.analysis) }))
      .filter((x) => x.rapor);
    window.__anSaved = uygun;

    root.innerHTML = `
      <button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Geri</button>
      <div class="an-card" style="margin-top:12px">
        <h3>Sitede yapılmış analizlerden seç</h3>
        ${uygun.length ? `<div class="an-grid">${uygun.map((x, i) => `
          <div class="an-row">
            <div></div>
            <div>
              <h4>${esc(x.k.analysisData.productName || x.k.title || '')}</h4>
              <div class="an-meta">
                <span>${new Date(x.k.savedAt || x.k.created).toLocaleDateString('tr-TR')}</span>
                ${x.rapor.product.matchScore ? `<span>uyum ${x.rapor.product.matchScore}/100</span>` : ''}
                ${x.rapor.product.decision ? `<span>${esc(x.rapor.product.decision)}</span>` : ''}
                ${Array.isArray(x.rapor.product.quizInsights) ? `<span>${x.rapor.product.quizInsights.length} quiz cevabı</span>` : ''}
              </div>
            </div>
            <button class="btn btn-primary" onclick="analysesPick(${i})">Seç</button>
          </div>`).join('')}</div>`
    : `<p style="color:#64748b">Yayınlanabilir analiz yok.</p>
         <p class="an-hint">Sitede bir ürün sayfasına gir → <strong>Analiz Et</strong> → quiz'i yanıtla.
         Rapor çıktığında burada listelenir.</p>`}
      </div>`;
  }

  async function analysesPick(i) {
    const x = (window.__anSaved || [])[i];
    if (!x) return;
    const d = x.k.analysisData || {};
    const pid = d.productId || '';
    const mevcut = _items.find((a) => a.productId === pid);
    if (mevcut) {
      // Ayni urun icin kayit varsa RAPORU TAZELE, ikinci kayit acma.
      mevcut.report = x.rapor;
      _editing = mevcut;
      toast('Bu ürünün kaydı vardı — raporu tazelendi', 'i');
      renderEditor();
      return;
    }
    // Urun bilgisi katalogdan: analiz kaydinda gorsel/marka yok.
    let p = {};
    try { p = await getPb().collection('products').getOne(pid, { $autoCancel: false }); } catch (_) { p = {}; }
    const ad = d.productName || p.name || x.k.title || '';
    _editing = {
      productId: pid,
      productSlug: p.slug || slugify(ad),
      productName: ad,
      productImage: p.imageUrl || '',
      productBrand: p.brand || '',
      category: d.category || p.category || '',
      techScore: Number(p.techScore) || Number(x.k.aiScore) || 0,
      slug: slugify(p.slug || ad),
      report: x.rapor,
      quiz: x.rapor.product && x.rapor.product.quizInsights ? x.rapor.product.quizInsights : null,
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
    const r = a.report && a.report.product ? a.report.product : null;

    root.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Geri</button>
        <strong>${esc(a.productName || '')}</strong>
        <span class="an-pill ${a.status === 'published' ? 'pub' : 'draft'}">${a.status === 'published' ? 'yayında' : 'taslak'}</span>
      </div>

      <div class="an-card">
        <h3>Rapor — sitede üretildi, burada değiştirilmez</h3>
        ${r ? `<div class="an-rapor">
          <div><b>Manşet</b> ${esc(r.headline || '—')}</div>
          <div><b>Karar</b> ${esc(r.decision || '—')} · uyum ${r.matchScore || 0}/100 · güven ${r.confidence || 0}/100</div>
          <div><b>Quiz cevabı</b> ${(r.quizInsights || []).length}</div>
          <div><b>Faktör</b> ${(r.factors || []).length} · <b>Kritik nokta</b> ${(r.criticalPoints || []).length}</div>
          <div><b>Güçlü/zayıf</b> ${(r.strengths || []).length} / ${(r.weaknesses || []).length}</div>
          <div><b>Alternatif</b> ${(a.report.alternatives || []).length}</div>
        </div>
        <div class="an-hint">Bu içerik <code>/analiz/${esc(a.slug)}</code> sayfasında ürün sayfasındakiyle
        <strong>aynı bileşenle</strong> çizilir. Değiştirmek için sitede yeniden analiz et.</div>`
    : '<p style="color:#b91c1c">Rapor verisi yok — bu kayıt yayınlanamaz.</p>'}
      </div>

      <div class="an-tabs">
        ${LANGS.map(([c, n]) => `<button class="${c === L ? 'on' : ''}" onclick="analysesLang('${c}')">${n}</button>`).join('')}
      </div>

      <div class="an-card">
        <h3>Sık sorulan sorular — ${esc(LANGS.find((x) => x[0] === L)[1])}</h3>
        <div id="anFaq">${faq.map((f, i) => faqHtml(f, i)).join('')}</div>
        <button class="btn btn-ghost" onclick="analysesFaqAdd()">+ Soru ekle</button>
        <div class="an-hint">Sayfaya <code>FAQPage</code> şeması olarak eklenir. İnsanların arama kutusuna
        gerçekten yazdığı sorular olmalı ("batarya ömrü nasıl", "oyun için uygun mu") — başlık tekrarı değil.</div>
      </div>

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
        <button class="btn btn-primary" onclick="analysesSave()">Kaydet</button>
      </div>`;

    const sl = $('anSlug');
    if (sl) sl.oninput = () => { $('anSlugEcho').textContent = sl.value; };
  }

  function faqHtml(f, i) {
    return `<div class="an-faq" data-i="${i}">
      <div class="an-f"><label>Soru ${i + 1}</label><input class="an-q" value="${esc(f.q || '')}"></div>
      <div class="an-f"><label>Cevap</label><textarea class="an-a">${esc(f.a || '')}</textarea></div>
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
    const a = _editing;
    a.slug = slugify($('anSlug').value) || a.slug;
    a.status = $('anStatusSel').value;
    a[`faq_${_lang}`] = faqTopla();
  }

  function analysesLang(c) { alanlariTopla(); _lang = c; renderEditor(); }
  function analysesFaqAdd() {
    alanlariTopla();
    _editing[`faq_${_lang}`] = [...(_editing[`faq_${_lang}`] || []), { q: '', a: '' }];
    renderEditor();
  }
  function analysesFaqDel(i) {
    alanlariTopla();
    const list = [...(_editing[`faq_${_lang}`] || [])];
    list.splice(i, 1);
    _editing[`faq_${_lang}`] = list;
    renderEditor();
  }

  async function analysesSave() {
    alanlariTopla();
    const a = _editing;
    if (!a.slug) { toast('Slug boş olamaz', 'e'); return; }
    // Rapor yoksa yayinlanamaz: /analiz sayfasi ProductFullReport cizmek zorunda.
    if (a.status === 'published' && !(a.report && a.report.product)) {
      toast('Rapor verisi olmayan analiz yayınlanamaz', 'e');
      return;
    }
    if (a.status === 'published' && !a.publishedAt) a.publishedAt = new Date().toISOString();
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

  window.loadAnalysesAdmin = loadAnalysesAdmin;
  window.analysesNew = analysesNew;
  window.analysesPick = analysesPick;
  window.analysesEdit = analysesEdit;
  window.analysesSave = analysesSave;
  window.analysesDelete = analysesDelete;
  window.analysesLang = analysesLang;
  window.analysesFaqAdd = analysesFaqAdd;
  window.analysesFaqDel = analysesFaqDel;
})();
