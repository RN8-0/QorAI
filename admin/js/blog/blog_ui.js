// ══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — BLOG ARAYÜZÜ (liste + tuval + raylar + kaydetme)
//
//  DÜZEN — ÜÇ KOLON
//    sol   ANAHAT  yapı haritası; öğeler BURADAN da sürüklenip sıralanır
//    orta  TUVAL   yazının kendisi: site ölçüsü, site puntosu, yerinde düzenleme
//    sağ   BAĞLAM  AI konsolu · yayın+SEO · kontrol · yorumlar
//
//  Eski düzen "iki kolon form + ayrı ürün kartları"ydı ve yazının nasıl
//  görüneceğini HİÇ göstermiyordu — şikâyetin kökü buydu.
//
//  DIŞ BAĞIMLILIK YÜZEYİ SADECE İKİ AD:
//    window.loadBlogAdmin  (admin/js/app.js:170 ve index.html "Yenile")
//    window.blogNew        (index.html "+ Yeni makale")
//  Geri kalan her şey delegasyonla bağlanıyor; satır içi onclick YOK —
//  string HTML içinde Türkçe karakter/tırnak kaçış hataları oradan çıkıyordu.
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  var C = root.BlogCore;
  var AI = root.BlogAi;
  var D = root.BlogDnd;
  if (!C || !AI || !D) throw new Error('blog_ui.js: core/ai/dnd ÖNCE yüklenmeli');

  var SITE = 'https://qorai.net';
  var esc = C.esc;

  // ── DURUM ───────────────────────────────────────────────────────────────
  var S = {
    editing: null, products: [], lang: 'tr', yanYana: false,
    items: [], listQ: '', listStatus: 'all',
    stats: {}, cats: [], yorumSayisi: 0,
    dirty: false, saving: false, lastSavedJson: '',
    srcMode: { body: false, concl: false },
    bodyQ: null, conclQ: null,
    importReport: null, qaReport: null, pendingBackup: null,
    autoTimer: null, backupTimer: null, searchTimer: null, subTimer: null,
  };

  /* İKİNCİ PARÇA (blog_ui2.js) — anahat rayı, bağlam rayı, sürükle-bırak
     bağlama, otokayıt, kaydetme, yorumlar. Ayrı dosya çünkü tek dosya 1500
     satırı aşıyordu; ikisi AYNI `S` durumunu paylaşıyor.
     Aşağıdaki sarmalayıcılar GEÇ BAĞLAR: blog_ui2.js bu dosyadan SONRA
     yükleniyor, yani doğrudan fonksiyon referansı verilemez. */
  var P2 = root.BlogUI2 = (root.BlogUI2 || {});
  function renderOutline() { if (P2.renderOutline) P2.renderOutline(); }
  function renderCtx() { if (P2.renderCtx) P2.renderCtx(); }
  function ctxYenile() { if (P2.ctxYenile) P2.ctxYenile(); }
  function serpYaz() { if (P2.serpYaz) P2.serpYaz(); }
  function kirlet() { if (P2.kirlet) P2.kirlet(); }
  function durdurOtokayit() { if (P2.durdurOtokayit) P2.durdurOtokayit(); }
  function yedekYukle(id) { return P2.yedekYukle ? P2.yedekYukle(id) : null; }
  function yedekZaman(b) { return P2.yedekZaman ? P2.yedekZaman(b) : ''; }
  function yedekSil(id) { if (P2.yedekSil) P2.yedekSil(id); }
  function anlikJson() { return P2.anlikJson ? P2.anlikJson() : ''; }
  function blogSave(a, b) { return P2.blogSave ? P2.blogSave(a, b) : Promise.resolve(); }
  function yorumlariYukle() { if (P2.yorumlariYukle) P2.yorumlariYukle(); }

  var kok = function () { return document.getElementById('blogAdminRoot'); };
  var el = function (id) { return document.getElementById(id); };
  var deger = function (id) { var e = el(id); return e ? e.value : undefined; };

  function nf(n) { return Number(n || 0).toLocaleString('tr-TR'); }

  /* GORUNEN AD = SITENIN GOSTERDIGI AD.
     Katalog adlari SKU tasiyor ("... Tablet (1024 GB / 5G) (MH9V4TU/A)") ve
     site bunu `cleanProductName` ile temizleyip oyle basiyor. Editorde ham adi
     gostermek "ne duzenliyorsam o yayina gidiyor" sozunu bozuyordu.
     KAYITTAKI `name` DEGISMEZ — yalnizca ekranda temizlenir; temizligi site
     kendi yapiyor ve tek kaynak orasi (qor_ai_prompts.js).
     `QorAiPrompts` bu dosyadan SONRA yukleniyor, o yuzden cagri aninda alinir. */
  function gorunenAd(p, lang) {
    var ad = C.itemName(p, lang);
    var P = root.QorAiPrompts;
    if (P && typeof P.cleanProductName === 'function' && (p.kind || 'product') === 'product') {
      return P.cleanProductName(ad) || ad;
    }
    return ad;
  }

  function pbFileUrl(rec, fname) {
    if (!rec || !fname) return '';
    var coll = rec.collectionId || rec.collectionName || 'articles';
    return root.getPb().baseUrl.replace(/\/$/, '') + '/api/files/' + coll + '/' + rec.id + '/' + fname;
  }

  // ── DELEGASYON ──────────────────────────────────────────────────────────
  var ACT = {};   // data-bl   → tıklama
  var INP = {};   // data-bli  → input
  var CHG = {};   // data-blc  → change

  function args(e) {
    return [e, Number(e.getAttribute('data-i')), e.getAttribute('data-j') == null ? null : Number(e.getAttribute('data-j')), e.getAttribute('data-v')];
  }
  function bagla() {
    if (document._blogBagli) return;
    document._blogBagli = true;
    document.addEventListener('click', function (ev) {
      var e = ev.target.closest('[data-bl]'); if (!e) return;
      var fn = ACT[e.getAttribute('data-bl')]; if (!fn) return;
      ev.preventDefault(); fn.apply(null, args(e));
    });
    document.addEventListener('input', function (ev) {
      var e = ev.target.closest('[data-bli]'); if (!e) return;
      var fn = INP[e.getAttribute('data-bli')]; if (fn) fn.apply(null, args(e));
    });
    document.addEventListener('change', function (ev) {
      var e = ev.target.closest('[data-blc]'); if (!e) return;
      var fn = CHG[e.getAttribute('data-blc')]; if (fn) fn.apply(null, args(e));
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') D.iptal();
      // Ctrl/Cmd+S → kaydet (yayındaki makalede elle kaydetmek gerekiyor)
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's' && S.editing) {
        ev.preventDefault(); blogSave(S.editing.status === 'published' ? 'published' : 'draft');
      }
    });
  }

  // Kendiliğinden büyüyen metin alanı — çıktının yüksekliğiyle aynı olsun.
  function buyut(e) { if (!e) return; e.style.height = 'auto'; e.style.height = (e.scrollHeight + 2) + 'px'; }
  function hepsiniBuyut() { document.querySelectorAll('.bl-txt,.bl-h1,.bl-lead').forEach(buyut); }

  // ── VERİ ────────────────────────────────────────────────────────────────
  async function loadCats() {
    if (S.cats.length) return;
    try {
      var r = await root.TsClient.request('GET', '/collections/products/documents/search?q=*&query_by=name&per_page=0&facet_by=category&max_facet_values=80');
      S.cats = ((r.facet_counts && r.facet_counts[0] && r.facet_counts[0].counts) || []).map(function (c) { return c.value; }).filter(Boolean).sort();
    } catch (_) { S.cats = []; }
  }
  async function loadStats() {
    S.stats = {};
    try {
      var evs = await root.getPb().collection('article_events').getFullList({ fields: 'slug,type,duration', $autoCancel: false, batch: 2000 });
      evs.forEach(function (e) {
        var s = S.stats[e.slug] || (S.stats[e.slug] = { view: 0, read: 0, like: 0, dur: 0 });
        if (s[e.type] != null) s[e.type] += 1;
        if (e.type === 'read') s.dur += Number(e.duration) || 0;
      });
    } catch (_) { /* olay tablosu boş olabilir */ }
  }
  var avgRead = function (s) { return s && s.read ? Math.round(s.dur / s.read) : 0; };

  // ── LİSTE ───────────────────────────────────────────────────────────────
  async function loadBlogAdmin() {
    root.blogInjectStyles(); bagla(); durdurOtokayit();
    var e = kok(); if (!e) return;
    e.innerHTML = '<div style="padding:26px;color:var(--text3)">Yükleniyor…</div>';
    try {
      await loadStats();
      S.items = await root.getPb().collection('articles').getFullList({ sort: '-updated', $autoCancel: false });
      var b = el('blogCount'); if (b) b.textContent = S.items.length;
      renderList();
    } catch (err) { e.innerHTML = '<div style="padding:26px;color:var(--red)">Hata: ' + esc(err.message) + '</div>'; }
  }

  var dilTam = function (a, c) { return Boolean(a['title_' + c] && (a['body_' + c] || (a.products || []).length)); };

  function renderList() {
    var e = kok(); if (!e) return;
    var items = S.items.filter(function (a) {
      if (S.listStatus !== 'all' && a.status !== S.listStatus) return false;
      if (!S.listQ) return true;
      var q = S.listQ.toLowerCase();
      return ['title_tr', 'title_en', 'slug', 'category'].some(function (f) { return String(a[f] || '').toLowerCase().includes(q); });
    });
    var tot = S.items.reduce(function (acc, a) {
      var s = S.stats[a.slug] || {};
      acc.v += s.view || 0; acc.l += s.like || 0; acc.r += s.read || 0; acc.dur += s.dur || 0; return acc;
    }, { v: 0, l: 0, r: 0, dur: 0 });
    var kritik = S.items.reduce(function (n, a) {
      return n + C.articleHealth(a, a.products).filter(function (x) { return x.level === 'error'; }).length;
    }, 0);

    var stat = [['Görüntüleme', nf(tot.v)], ['Beğeni', nf(tot.l)], ['Okuma', nf(tot.r)],
      ['Ort. süre', (tot.r ? Math.round(tot.dur / tot.r) : 0) + ' sn'], ['Makale', S.items.length]];

    e.innerHTML = '<div class="bl-wrap">'
      + '<div class="bl-stats">' + stat.map(function (x) {
        return '<div class="bl-stat"><div class="k">' + x[0] + '</div><div class="v bl-num">' + x[1] + '</div></div>';
      }).join('') + '</div>'
      + '<div class="bl-tools">'
      + '<input class="bl-in bl-search" placeholder="Makale ara — başlık, slug, kategori…" value="' + esc(S.listQ) + '" data-bli="listQ" />'
      + [['all', 'Tümü'], ['published', 'Yayında'], ['draft', 'Taslak']].map(function (x) {
        return '<button class="bl-btn' + (S.listStatus === x[0] ? ' on' : '') + '" data-bl="listFilter" data-v="' + x[0] + '">' + x[1] + '</button>';
      }).join('')
      + '<button class="bl-btn pri" data-bl="topicOpen" title="Güncel küresel trendlere göre konu önerir, seçtiğini baştan sona yazar">🧭 Konu bul &amp; yaz</button>'
      + '<button class="bl-btn" data-bl="auditAll" title="Tüm makalelerde dil/slug, SEO, görsel ve içerik sorunlarını tarar">🔍 Tümünü denetle'
      + (kritik ? ' <b class="bl-num" style="color:var(--red)">' + kritik + '</b>' : '') + '</button>'
      + '</div>'
      + (!S.items.length
        ? '<div class="bl-empty">Henüz makale yok. “+ Yeni makale” ya da “Konu bul &amp; yaz” ile başla.</div>'
        : (!items.length
          ? '<div class="bl-empty">Filtreye uyan makale yok.</div>'
          : '<div class="bl-rows"><div class="bl-row bl-row-hd" style="border-bottom:1px solid var(--border)">'
            + '<span></span><span>Makale</span><span>Dil</span>'
            + '<span style="text-align:right">Görün.</span><span style="text-align:right">Beğeni</span>'
            + '<span style="text-align:right">Okuma</span><span style="text-align:right">Süre</span>'
            + '<span style="text-align:right">İşlem</span></div>'
            + items.map(satir).join('') + '</div>'))
      + '</div>';
  }

  function satir(a) {
    var st = S.stats[a.slug] || {};
    var p0 = (a.products || [])[0] || {};
    var cov = a.cover || (a.coverFile ? pbFileUrl(a, a.coverFile) : '') || p0.image || p0.imageUrl || '';
    var sorun = C.articleHealth(a, a.products).filter(function (x) { return x.level === 'error'; }).length;
    return '<div class="bl-row">'
      + '<div class="bl-row-cover">' + (cov ? '<img src="' + esc(cov) + '" loading="lazy" onerror="this.style.display=\'none\'"/>' : '') + '</div>'
      + '<div style="min-width:0">'
      + '<div class="bl-row-t">' + esc(a.title_tr || a.title_en || a.slug) + '</div>'
      + '<div class="bl-row-s">'
      + '<span class="bl-pill' + (a.status === 'published' ? ' pub' : '') + '">' + (a.status === 'published' ? 'YAYIN' : 'TASLAK') + '</span> '
      + (sorun ? '<span class="bl-pill" style="color:var(--red);border-color:color-mix(in srgb,var(--red) 45%,transparent)">' + sorun + ' kritik</span> ' : '')
      + '/blog/' + esc(a.slug) + (a.category ? ' · ' + esc(a.category) : '')
      + ' · <span class="bl-num">' + esc(String(a.publishedAt || a.created || '').slice(0, 10)) + '</span></div></div>'
      + '<div class="bl-dots">' + C.LANG_CODES.map(function (c) {
        return '<span class="bl-dot' + (dilTam(a, c) ? ' on' : '') + '">' + c.toUpperCase() + '</span>';
      }).join('') + '</div>'
      + '<div class="bl-row-n bl-num">' + nf(st.view) + '</div>'
      + '<div class="bl-row-n bl-num">' + nf(st.like) + '</div>'
      + '<div class="bl-row-n bl-num">' + nf(st.read) + '</div>'
      + '<div class="bl-row-n bl-num">' + avgRead(st) + 's</div>'
      + '<div class="bl-row-act">'
      + '<button class="bl-btn sm" data-bl="edit" data-v="' + a.id + '">Düzenle</button>'
      + '<button class="bl-btn sm" data-bl="dup" data-v="' + a.id + '" title="Kopyala">⧉</button>'
      + '<button class="bl-btn sm dang" data-bl="del" data-v="' + a.id + '" title="Sil">🗑</button>'
      + '</div></div>';
  }

  ACT.listFilter = function (e, i, j, v) { S.listStatus = v; renderList(); };
  INP.listQ = function (e) {
    S.listQ = e.value; renderList();
    var inp = kok().querySelector('.bl-search');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  };
  ACT.edit = function (e, i, j, v) { blogEdit(v); };
  ACT.del = async function (e, i, j, v) {
    var a = S.items.find(function (x) { return x.id === v; }) || {};
    var st = S.stats[a.slug] || {};
    if (!confirm('"' + (a.title_tr || a.slug) + '" silinsin mi?\n\n'
      + (st.view ? 'Bu yazının ' + st.view + ' görüntülenmesi ve tüm yorumları da erişilemez olur.' : 'Bu işlem geri alınamaz.'))) return;
    try { await root.getPb().collection('articles').delete(v, { $autoCancel: false }); root.toast('Silindi', 's'); loadBlogAdmin(); }
    catch (err) { root.toast('Silinemedi: ' + err.message, 'e'); }
  };
  ACT.dup = async function (e, i, j, v) {
    try {
      var a = await root.getPb().collection('articles').getOne(v, { $autoCancel: false });
      var copy = {};
      Object.keys(a).forEach(function (k) {
        if (['id', 'created', 'updated', 'collectionId', 'collectionName', 'coverFile', 'media', 'expand'].includes(k)) return;
        copy[k] = a[k];
      });
      // Kopyanın istatistiği SIFIR olmalı — `article_events` slug'a bağlı ve
      // yeni slug yeni bir sayaç demek. Bu doğru davranış, ama bilinçli olsun.
      copy.slug = (a.slug || 'makale') + '-kopya';
      C.LANG_CODES.forEach(function (c) { if (copy['slug_' + c]) copy['slug_' + c] += '-kopya'; });
      copy.status = 'draft';
      var rec = await root.getPb().collection('articles').create(copy, { $autoCancel: false });
      root.toast('Kopya oluşturuldu (taslak) — istatistikleri sıfırdan başlar', 's');
      blogEdit(rec.id);
    } catch (err) { root.toast('Kopyalanamadı: ' + err.message, 'e'); }
  };
  ACT.auditAll = function () {
    var e = kok(); if (!e) return;
    var rows = S.items.map(function (a) { return { a: a, issues: C.articleHealth(a, a.products) }; })
      .filter(function (r) { return r.issues.length; });
    var errN = rows.reduce(function (n, r) { return n + r.issues.filter(function (x) { return x.level === 'error'; }).length; }, 0);
    var warnN = rows.reduce(function (n, r) { return n + r.issues.filter(function (x) { return x.level === 'warn'; }).length; }, 0);
    var ic = { error: '⛔', warn: '⚠', info: 'ℹ' };
    e.innerHTML = '<div class="bl-wrap">'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">'
      + '<button class="bl-btn" data-bl="back">← Geri</button>'
      + '<h2 style="margin:0;font-size:18px">Tüm makaleler denetlendi</h2>'
      + '<span style="color:var(--text3);font-size:12.5px" class="bl-num">' + S.items.length + ' makale · ' + errN + ' kritik · ' + warnN + ' uyarı</span></div>'
      + (!rows.length ? '<div class="bl-card" style="color:var(--green)">✓ Hiçbir makalede yapısal sorun bulunamadı.</div>'
        : rows.map(function (r) {
          return '<div class="bl-card">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">'
            + '<b style="font-size:14px">' + esc(r.a.title_tr || r.a.slug) + '</b>'
            + '<span style="display:flex;gap:8px;align-items:center;flex-shrink:0">'
            + '<span class="bl-pill' + (r.a.status === 'published' ? ' pub' : '') + '">' + (r.a.status === 'published' ? 'YAYIN' : 'TASLAK') + '</span>'
            + '<button class="bl-btn sm pri" data-bl="edit" data-v="' + r.a.id + '">Düzelt</button></span></div>'
            + r.issues.map(function (x) { return '<div class="bl-issue ' + x.level + '"><span class="ic">' + (ic[x.level] || '•') + '</span><span>' + esc(x.text) + '</span></div>'; }).join('')
            + '</div>';
        }).join('')) + '</div>';
  };
  ACT.back = function () { loadBlogAdmin(); };

  // ── EDİTÖRÜ AÇ ──────────────────────────────────────────────────────────
  async function blogNew() {
    root.blogInjectStyles(); bagla(); await loadCats();
    S.editing = { id: '', slug: '', status: 'draft', category: '', cover: '', publishedAt: C.toDtLocal(new Date()), template: '' };
    S.products = []; S.lang = 'tr'; S.srcMode = { body: false, concl: false };
    S.importReport = null; S.qaReport = null; S.yorumSayisi = 0;
    S.pendingBackup = yedekYukle('new');
    renderEditor();
  }

  async function blogEdit(id) {
    root.blogInjectStyles(); bagla(); await loadCats();
    try {
      var a = await root.getPb().collection('articles').getOne(id, { $autoCancel: false });
      S.editing = a; S.lang = 'tr'; S.srcMode = { body: false, concl: false };
      S.importReport = null; S.qaReport = null; S.yorumSayisi = 0;
      S.products = Array.isArray(a.products) ? a.products.map(function (p) { return Object.assign({}, p); }) : [];
      S.products.forEach(C.ensureBlocks);
      S.editing.publishedAt = C.toDtLocal(a.publishedAt);
      // SLUG KOPMASI için açılıştaki adresi sakla (bkz. blogSave).
      S.editing._slugKayitli = a.slug || '';
      S.lastSavedJson = anlikJson();
      var b = yedekYukle(id);
      S.pendingBackup = (b && b.at > (Date.parse(String(a.updated || '').replace(' ', 'T')) || 0)) ? b : null;
      renderEditor();
      S.products.forEach(function (p) { if (p && p.id && (p.kind || 'product') === 'product') fiyatOku(p.id); });
      yorumlariYukle();
    } catch (e) { root.toast('Yüklenemedi: ' + e.message, 'e'); }
  }

  // ── EDİTÖR KABUĞU ───────────────────────────────────────────────────────
  function renderEditor() {
    var a = S.editing; var e = kok(); if (!e || !a) return;
    e.innerHTML = '<div class="bl-wrap">' + ustBar(a)
      + (S.pendingBackup ? yedekSeridi(a) : '')
      + '<div class="bl-shell">'
      + '<aside class="bl-rail" id="bl_out"></aside>'
      + '<div class="bl-canvas"><div class="bl-doc" id="bl_doc"></div></div>'
      + '<aside class="bl-rail" id="bl_ctx"></aside>'
      + '</div></div>';
    renderDoc(); renderOutline(); renderCtx();
    D.bagla(e);
    if (root.BlogFlows) root.BlogFlows.konsolYaz();
  }

  function ustBar(a) {
    return '<div class="bl-top">'
      + '<button class="bl-btn" data-bl="listeye" title="Listeye dön">←</button>'
      + '<span class="tt">' + esc(a['title_' + S.lang] || a.title_tr || 'Yeni makale') + '</span>'
      + '<span class="bl-pill' + (a.status === 'published' ? ' pub' : '') + '" id="bl_badge">' + (a.status === 'published' ? 'YAYIN' : 'TASLAK') + '</span>'
      + '<span class="bl-save" id="bl_save">' + (a.id ? 'Kaydedildi' : 'Henüz kaydedilmedi') + '</span>'
      + '<span style="flex:1"></span>'
      + C.LANGS.map(function (x) {
        return '<button class="bl-btn' + (S.lang === x[0] ? ' on' : '') + '" data-bl="dil" data-v="' + x[0] + '"'
          + ' title="' + esc(x[1]) + (dilTam(a, x[0]) ? ' — dolu' : ' — eksik') + '">'
          + x[0].toUpperCase() + ' <span style="opacity:.7">' + (dilTam(a, x[0]) ? '●' : '○') + '</span></button>';
      }).join('')
      + '<button class="bl-btn' + (S.yanYana ? ' on' : '') + '" data-bl="yanYana" aria-label="İki dili yan yana göster" title="Öğe metinlerini TR ve EN yan yana göster">⇄</button>'
      + '<span style="width:1px;height:20px;background:var(--border)"></span>'
      + '<button class="bl-btn" data-bl="cmdOpen" title="Gündelik dille değiştir: “girişi kısalt”, “3. ürünü çıkar”">✏️ Değiştir</button>'
      + '<button class="bl-btn" data-bl="qaRun" id="bl_qa_btn" title="AI yazıyı okur: görsellerin yerini metne göre ayarlar ve sorunları listeler">🤖 Düzen</button>'
      + '<button class="bl-btn" data-bl="ceviri" aria-label="TR içeriği İngilizceye çevir" title="TR içeriği İngilizceye çevirir">🌍 EN</button>'
      + '<button class="bl-btn" data-bl="importOpen" aria-label="İçe aktar" title="Markdown / JSON / serbest metin içe aktar">📥</button>'
      + '<span style="width:1px;height:20px;background:var(--border)"></span>'
      + '<button class="bl-btn" data-bl="onizle" aria-label="Sitede önizle" title="Kaydet ve sitede önizle">👁</button>'
      + '<button class="bl-btn" data-bl="kaydetTaslak">Kaydet</button>'
      + '<button class="bl-btn pri" data-bl="yayinla">🚀 Yayınla</button>'
      + '</div>';
  }

  function yedekSeridi(a) {
    var b = S.pendingBackup;
    return '<div class="bl-note" style="display:flex;justify-content:space-between;align-items:center;gap:10px">'
      + '<span>💾 <b>Kaydedilmemiş yerel yedek var</b> (' + esc(yedekZaman(b)) + ')'
      + (b.e && b.e.title_tr ? ' — “' + esc(String(b.e.title_tr).slice(0, 60)) + '”' : '') + '</span>'
      + '<span style="display:flex;gap:8px;flex-shrink:0">'
      + '<button class="bl-btn pri sm" data-bl="yedekGeri" data-v="' + esc(a.id || 'new') + '">Geri yükle</button>'
      + '<button class="bl-btn sm" data-bl="yedekSil" data-v="' + esc(a.id || 'new') + '">Yoksay</button></span></div>';
  }

  ACT.listeye = function () {
    if (S.dirty && !confirm('Kaydedilmemiş değişiklikler var. Yine de çık?')) return;
    durdurOtokayit(); loadBlogAdmin();
  };
  ACT.dil = function (e, i, j, v) {
    editorleriBosalt(); paneliOku(); S.lang = v; S.srcMode = { body: false, concl: false };
    renderEditor();
  };
  ACT.yanYana = function () { editorleriBosalt(); S.yanYana = !S.yanYana; renderEditor(); };

  // ── TUVAL ───────────────────────────────────────────────────────────────
  function renderDoc() {
    var a = S.editing; var d = el('bl_doc'); if (!d) return;
    var c = S.lang;
    d.innerHTML = kapakHtml(a)
      + '<textarea class="bl-h1" id="bl_title" rows="1" placeholder="Makale başlığı (' + c.toUpperCase() + ')" data-bli="title">' + esc(a['title_' + c] || '') + '</textarea>'
      + '<textarea class="bl-lead" id="bl_lead" rows="1" placeholder="Kısa özet — arama sonucunda görünür" data-bli="lead">' + esc(a['lead_' + c] || '') + '</textarea>'
      + '<div class="bl-zone-h">Giriş <span style="text-transform:none;letter-spacing:0;font-weight:400">— öğelerden ÖNCE</span>'
      + '<button class="bl-btn sm" data-bl="src" data-v="body">' + (S.srcMode.body ? '👁 Görsel editör' : '&lt;/&gt; HTML') + '</button></div>'
      + '<div id="bl_body_wrap" class="bl-rte"></div>'
      + '<div class="bl-zone-h">Öğeler <span style="text-transform:none;letter-spacing:0;font-weight:400">— ürün · abonelik · özel</span></div>'
      + '<div id="bl_items"></div>'
      + ogeEkleHtml()
      + '<div class="bl-zone-h">Sonuç <span style="text-transform:none;letter-spacing:0;font-weight:400">— öğelerden SONRA · SSS burada</span>'
      + '<button class="bl-btn sm" data-bl="src" data-v="concl">' + (S.srcMode.concl ? '👁 Görsel editör' : '&lt;/&gt; HTML') + '</button></div>'
      + '<div id="bl_concl_wrap" class="bl-rte"></div>';
    renderItems();
    editorleriKur();
    hepsiniBuyut();
  }

  function kapakHtml(a) {
    var u = a.cover || (a.coverFile && a.id ? pbFileUrl(a, a.coverFile) : '')
      || C.itemImageUrl(S.products.find(function (p) { return p.imageSource !== 'brand-logo' && C.itemImageUrl(p); }) || {});
    return '<div class="bl-cover">'
      + (u ? '<img src="' + esc(u) + '" onerror="this.style.display=\'none\'"/>' : '<div class="bl-cover-e">Kapak görseli yok — paylaşımlarda ve listede boş görünür</div>')
      + '<span class="bl-cover-a">'
      + '<label class="bl-btn sm" style="cursor:pointer">📷 Yükle<input type="file" accept="image/*" style="display:none" data-blc="kapakYukle"></label>'
      + '<button class="bl-btn sm" data-bl="kapakUrl">🔗 URL</button>'
      + (u ? '<button class="bl-btn sm dang" data-bl="kapakSil">✕</button>' : '')
      + '</span></div>';
  }

  function ogeEkleHtml() {
    return '<div class="bl-add" style="position:relative">'
      + '<input class="bl-in" style="flex:1" id="bl_pick" placeholder="＋ Öğe ekle — katalogdan ürün ya da abonelik ara…" autocomplete="off" data-bli="pick" />'
      + '<button class="bl-btn" data-bl="ozelEkle" title="Katalogda olmayan ürün/hizmet">＋ Özel öğe</button>'
      + '<div id="bl_hits" class="bl-hits" style="display:none;top:100%"></div></div>';
  }

  // ── ÖĞELER ──────────────────────────────────────────────────────────────
  function renderItems() {
    var box = el('bl_items'); if (!box) return;
    S.products.forEach(C.ensureBlocks);
    box.innerHTML = S.products.map(ogeHtml).join('')
      || '<div class="bl-empty" style="padding:26px">Henüz öğe yok — yukarıdan ürün ara ya da “İçe aktar” ile bir taslak yükle.</div>';
    hepsiniBuyut();
  }

  function ogeHtml(p, i) {
    var kind = p.kind || 'product';
    var ad = gorunenAd(p, S.lang);
    var kl = kind === 'subscription' ? 'Abonelik' : kind === 'custom' ? 'Özel' : 'Ürün';
    var hedef = kind === 'product' ? '/product/' + esc(p.slug || '') : kind === 'subscription' ? '/subscriptions' : (p.link || '—');
    return '<div class="bl-item" data-drop="item" data-i="' + i + '">'
      + '<div class="bl-item-h">'
      + '<button class="bl-grip" data-grip="item" data-i="' + i + '" data-label="' + esc(ad) + '" title="Sürükle — sırayı değiştir (klavye: Boşluk)" aria-label="Öğeyi taşı">⠿</button>'
      + '<span class="bl-item-t"><span class="ppn bl-num">' + (i + 1) + '.</span> '
      + (kind === 'custom'
        ? '<input value="' + esc(p['name_' + S.lang] || '') + '" placeholder="İsim (' + S.lang.toUpperCase() + ')" data-bli="ogeAd" data-i="' + i + '" />'
        : esc(ad))
      + '</span></div>'
      + '<div class="bl-item-m">'
      + '<span class="bl-kind k-' + kind + '">' + kl + '</span>'
      + '<span>' + esc(hedef) + '</span>'
      + (kind === 'product' ? '<span>💰 <b class="bl-num" id="bl_pr_' + esc(p.id) + '">' + (p._livePrice ? esc(p._livePrice) : '…') + '</b></span>' : '')
      + (kind === 'custom' ? '<input class="bl-in" style="max-width:260px;font-size:11.5px;padding:4px 8px" value="' + esc(p.link || '') + '" placeholder="Bağlantı (opsiyonel)" data-bli="ogeLink" data-i="' + i + '" />' : '')
      + '</div>'
      + '<button class="bl-btn sm dang bl-item-x" data-bl="ogeSil" data-i="' + i + '" aria-label="Öğeyi çıkar" title="Öğeyi çıkar">✕</button>'
      + p.blocks.map(function (b, j) { return blokHtml(b, i, j); }).join('')
      + '<div class="bl-clear"></div>'
      + '<div class="bl-add">'
      + '<button class="bl-btn sm" data-bl="blokEkle" data-i="' + i + '" data-v="text">＋ Metin</button>'
      + '<button class="bl-btn sm" data-bl="blokEkle" data-i="' + i + '" data-v="image">＋ Görsel</button>'
      + '</div></div>';
  }

  function blokBar(i, j) {
    return '<div class="bl-blk-bar">'
      + '<button class="bl-grip" data-grip="block" data-i="' + i + '" data-j="' + j + '" title="Sürükle — başka öğeye de bırakabilirsin" aria-label="Bloğu taşı">⠿</button>'
      + '<button class="bl-grip" data-bl="blokSil" data-i="' + i + '" data-j="' + j + '" title="Bloğu sil" aria-label="Bloğu sil">✕</button>'
      + '</div>';
  }

  function blokHtml(b, i, j) {
    if (b.t === 'image') return gorselBlokHtml(b, i, j);
    var st = b.style || 'paragraph';
    var ipucu = st === 'bullets' ? 'Her satır bir madde' : (st === 'heading' || st === 'subheading') ? 'Başlık metni' : 'Paragraf — **kalın**, satır başına "- " madde yapar';
    var alan = function (c) {
      return '<textarea class="bl-txt s-' + st + '" rows="1" placeholder="' + esc(ipucu) + ' (' + c.toUpperCase() + ')" '
        + 'data-bli="blokMetin" data-i="' + i + '" data-j="' + j + '" data-v="' + c + '">' + esc(b[c] || '') + '</textarea>';
    };
    var govde;
    if (S.yanYana) {
      govde = '<div class="bl-split">' + C.LANG_CODES.map(function (c) {
        return '<div class="bl-sp' + (String(b[c] || '').trim() ? '' : ' miss') + '"><div class="bl-sp-l">' + c.toUpperCase()
          + (String(b[c] || '').trim() ? '' : ' · BOŞ') + '</div>' + alan(c) + '</div>';
      }).join('') + '</div>';
    } else {
      var oteki = S.lang === 'tr' ? 'en' : 'tr';
      govde = alan(S.lang)
        + (String(b[oteki] || '').trim() ? '' : '<div class="bl-sp-l" style="color:var(--amber);margin-top:2px">' + oteki.toUpperCase() + ' metni boş</div>');
    }
    return '<div class="bl-blk" data-drop="block" data-i="' + i + '" data-j="' + j + '">'
      + blokBar(i, j)
      + '<div class="bl-blk-tools">'
      + '<select class="bl-in" style="width:auto;font-size:11.5px;padding:3px 7px" data-blc="blokStil" data-i="' + i + '" data-j="' + j + '">'
      + [['paragraph', '¶ Paragraf'], ['heading', '◆ Büyük başlık'], ['subheading', '— Alt başlık'], ['bullets', '• Madde listesi']].map(function (x) {
        return '<option value="' + x[0] + '"' + (st === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select>'
      + '<button class="bl-btn sm" data-bl="fmt" data-i="' + i + '" data-j="' + j + '" data-v="bold" title="Seçimi kalın yap">**B**</button>'
      + '<button class="bl-btn sm" data-bl="fmt" data-i="' + i + '" data-j="' + j + '" data-v="li" title="Satırı madde yap">• Madde</button>'
      + '<span style="font-size:11px;color:var(--text3)">Düz metin — HTML etiketi koyma</span>'
      + '</div>' + govde + '</div>';
  }

  function gorselBlokHtml(b, i, j) {
    var u = b.url || '';
    var w = Number(b.w) || 0;
    var stil = (w >= 15 && w <= 100) ? ' style="width:' + w + '%"' : '';
    // Konum sınıfı SARMALAYICIDA: float figure'de olursa sarmalayıcı çöküyor
    // (ölçüldü: 4px) ve blok sürüklenebilir bir hedef olmaktan çıkıyor.
    return '<div class="bl-blk img-' + (b.pos || 'full') + ' z-' + (b.size || 'm') + '" data-drop="block" data-i="' + i + '" data-j="' + j + '"' + stil + '>'
      + blokBar(i, j)
      + '<figure class="bl-fig z-' + (b.size || 'm') + '">'
      /* GÖRSELİN KENDİSİ BLOĞUN TUTAMAĞI.
         draggable="false" ŞART: <img> tarayıcıda YERLEŞİK olarak
         sürüklenebilir ve o sürükleme yalnızca URL taşır. Kullanıcı görseli
         tutup taşımaya çalışınca pointer sürüklemesi hiç devreye giremiyor,
         yerine tarayıcının link sürüklemesi çalışıyordu — "taşıyınca sürükle
         bırak ile sadece link geliyor" (2026-09-04). Yerleşik sürükleme
         kapatıldı; resmi tutmak artık BLOĞU taşıyor, zaten denenen hareket
         buydu. Altyazı kutusu tutamak DEĞİL — orada metin seçilebilmeli. */
      + (u ? '<img src="' + esc(u) + '" draggable="false" alt="" title="Sürükleyip taşı"'
        + ' data-grip="block" data-i="' + i + '" data-j="' + j + '"'
        + ' onerror="this.style.display=\'none\';this.nextElementSibling&&this.nextElementSibling.classList.add(\'show\')"/>'
        /* GÖRSEL BOŞ KALABİLİR VE BU HATA DEĞİL. Ürün görseli KATALOGDAN
           gelir; katalogda yoksa yazar elle koyar. AI görsel ARAMAZ. */
        : '<div class="bl-fig-e">Görsel yok — katalogdan gelmedi.<br>Elle ekle: <button class="bl-btn sm" data-bl="gorselUrl" data-i="' + i + '" data-j="' + j + '">🔗 URL</button> '
          + '<label class="bl-btn sm" style="cursor:pointer">📷 Yükle<input type="file" accept="image/*" style="display:none" data-blc="blokYukle" data-i="' + i + '" data-j="' + j + '"></label></div>')
      + '<input class="bl-cap" placeholder="Altyazı (' + S.lang.toUpperCase() + ') — görselde ne görüldüğünü yaz" value="' + esc(b['cap_' + S.lang] || '') + '" data-bli="blokCap" data-i="' + i + '" data-j="' + j + '" />'
      + '</figure>'
      + '<div class="bl-blk-tools">'
      + '<select class="bl-in" style="width:auto;font-size:11.5px;padding:3px 7px" data-blc="blokPos" data-i="' + i + '" data-j="' + j + '">'
      + [['left', '◧ Solda'], ['right', '◨ Sağda'], ['center', '▣ Ortada'], ['full', '▭ Tam genişlik']].map(function (x) {
        return '<option value="' + x[0] + '"' + ((b.pos || 'full') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select>'
      + '<select class="bl-in" style="width:auto;font-size:11.5px;padding:3px 7px" data-blc="blokSize" data-i="' + i + '" data-j="' + j + '">'
      + [['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük'], ['xl', 'Çok büyük']].map(function (x) {
        return '<option value="' + x[0] + '"' + ((b.size || 'm') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select>'
      + '<label style="font-size:11.5px;color:var(--text3);display:inline-flex;align-items:center;gap:4px">↔'
      + '<input class="bl-in bl-num" type="number" min="15" max="100" step="5" style="width:66px;font-size:11.5px;padding:3px 6px" placeholder="oto" value="' + (w || '') + '" data-bli="blokW" data-i="' + i + '" data-j="' + j + '" />%</label>'
      + '<button class="bl-btn sm" data-bl="gorselUrl" data-i="' + i + '" data-j="' + j + '" title="Görsel adresini değiştir">🔗 URL</button>'
      + '<label class="bl-btn sm" style="cursor:pointer" title="Cihazdan yükle">📷<input type="file" accept="image/*" style="display:none" data-blc="blokYukle" data-i="' + i + '" data-j="' + j + '"></label>'
      + '</div></div>';
  }

  // ── ÖĞE / BLOK EYLEMLERİ ────────────────────────────────────────────────
  INP.title = function (e) {
    S.editing['title_' + S.lang] = e.value; buyut(e);
    var t = document.querySelector('.bl-top .tt'); if (t) t.textContent = e.value || 'Yeni makale';
    kirlet(); serpYaz(); ctxYenile(); renderOutline();
  };
  INP.lead = function (e) { S.editing['lead_' + S.lang] = e.value; buyut(e); kirlet(); serpYaz(); ctxYenile(); };
  INP.ogeAd = function (e, i) { if (S.products[i]) { S.products[i]['name_' + S.lang] = e.value; kirlet(); renderOutline(); } };
  INP.ogeLink = function (e, i) { if (S.products[i]) { S.products[i].link = e.value; kirlet(); } };
  INP.blokMetin = function (e, i, j) {
    var b = S.products[i] && S.products[i].blocks[j]; if (!b) return;
    b[e.getAttribute('data-v') || S.lang] = e.value; buyut(e); kirlet(); ctxYenile();
  };
  INP.blokCap = function (e, i, j) { var b = blok(i, j); if (b) { b['cap_' + S.lang] = e.value; kirlet(); } };
  INP.blokUrl = function (e, i, j) { var b = blok(i, j); if (b) { b.url = e.value; kirlet(); } };
  INP.blokW = function (e, i, j) { var b = blok(i, j); if (b) { b.w = e.value ? Number(e.value) : ''; kirlet(); renderItems(); } };
  CHG.blokStil = function (e, i, j) { var b = blok(i, j); if (b) { b.style = e.value; kirlet(); renderItems(); } };
  CHG.blokPos = function (e, i, j) { var b = blok(i, j); if (b) { b.pos = e.value; kirlet(); renderItems(); } };
  CHG.blokSize = function (e, i, j) { var b = blok(i, j); if (b) { b.size = e.value; kirlet(); renderItems(); } };
  var blok = function (i, j) { var p = S.products[i]; return p && p.blocks ? p.blocks[j] : null; };

  ACT.blokEkle = function (e, i, j, v) {
    var p = S.products[i]; if (!p) return; C.ensureBlocks(p);
    p.blocks.push(v === 'image' ? { t: 'image', url: '', pos: 'right', size: 'm' } : C.bosMetinBlok());
    renderItems(); renderOutline(); kirlet();
  };
  ACT.blokSil = function (e, i, j) {
    var p = S.products[i]; if (!p || !p.blocks) return;
    p.blocks.splice(j, 1);
    if (!p.blocks.length) p.blocks.push(C.bosMetinBlok());
    renderItems(); renderOutline(); kirlet();
  };
  ACT.ogeSil = function (e, i) {
    if (!confirm('“' + C.itemName(S.products[i], S.lang) + '” çıkarılsın mı?')) return;
    S.products.splice(i, 1); renderItems(); renderOutline(); ctxYenile(); kirlet();
  };
  /* Biçim düğmeleri seçime YAZAR — **kalın** ve "- " işaretleri metnin
     kendisinde durur, çünkü site bu işaretleri okuyup render ediyor.
     contenteditable'da seçimle çalışmak için execCommand('insertText'):
     geri-al (Ctrl+Z) yığınını da doğru besleyen tek yol. */
  ACT.fmt = function (e, i, j, v) {
    var ce = document.querySelector('.bl-txt[data-i="' + i + '"][data-j="' + j + '"]'); if (!ce) return;
    ce.focus();
    var sel = window.getSelection();
    var secili = (sel && !sel.isCollapsed) ? sel.toString() : '';
    var yazi = v === 'bold' ? ('**' + (secili || 'kalın') + '**') : ('- ' + secili);
    document.execCommand('insertText', false, yazi);
    ce.dispatchEvent(new Event('input', { bubbles: true }));
  };
  ACT.gorselUrl = function (e, i, j) {
    var u = prompt('Görsel URL’si (doğrudan .png/.jpg/.webp linki):', '');
    var b = blok(i, j);
    if (u && b) { b.url = u.trim(); renderItems(); kirlet(); }
  };
  ACT.ozelEkle = function () {
    S.products.push({
      kind: 'custom', id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      slug: '', name: '', name_tr: '', name_en: '', link: '', image: '', imageUrl: '',
      blocks: [C.bosMetinBlok()],
    });
    renderItems(); renderOutline(); kirlet();
    setTimeout(function () {
      var list = el('bl_items'); var kartlar = list ? list.querySelectorAll('.bl-item') : [];
      var son = kartlar[kartlar.length - 1];
      if (son) { son.scrollIntoView({ behavior: 'smooth', block: 'center' }); var inp = son.querySelector('input'); if (inp) inp.focus(); }
    }, 40);
  };

  // ── ÖĞE ARAMA (katalog + abonelik TEK kutuda) ───────────────────────────
  INP.pick = function (e) {
    clearTimeout(S.searchTimer);
    var q = e.value.trim();
    var box = el('bl_hits');
    if (q.length < 2) { if (box) box.style.display = 'none'; return; }
    S.searchTimer = setTimeout(async function () {
      var satirlar = [];
      try {
        var r = await root.TsClient.search(q, { perPage: 6 });
        (r.hits || []).map(function (h) { return h.document; }).forEach(function (d) {
          satirlar.push({ tur: 'product', id: d.id, ad: d.name, alt: d.brand || '', img: d.imageUrl || '', ham: d });
        });
      } catch (_) { /* katalog yoksa devam */ }
      try {
        var rs = await root.getPb().collection('subscriptions').getList(1, 4, { filter: 'name ~ "' + q.replace(/"/g, '\\"') + '"', sort: 'name', $autoCancel: false });
        (rs.items || []).forEach(function (d) {
          satirlar.push({ tur: 'subscription', id: d.id, ad: d.name, alt: d.category || 'abonelik', img: d.logo || '', ham: d });
        });
      } catch (_) { /* abonelik yoksa devam */ }
      if (!box) return;
      S._hits = satirlar;
      box.innerHTML = satirlar.length
        ? satirlar.map(function (h, k) {
          return '<div class="bl-hit" data-bl="hitEkle" data-i="' + k + '">'
            + '<img src="' + esc(h.img) + '" onerror="this.style.visibility=\'hidden\'"/>'
            + '<span style="flex:1;min-width:0"><b>' + esc(h.ad) + '</b> <span style="color:var(--text3)">' + esc(h.alt) + '</span></span>'
            + '<span class="bl-kind k-' + (h.tur === 'subscription' ? 'subscription' : 'product') + '">' + (h.tur === 'subscription' ? 'Abonelik' : 'Ürün') + '</span></div>';
        }).join('')
        : '<div class="bl-hit" style="color:var(--text3)">Eşleşme yok — “＋ Özel öğe” ile elle ekleyebilirsin</div>';
      box.style.display = 'block';
    }, 250);
  };
  ACT.hitEkle = function (e, i) {
    var h = (S._hits || [])[i]; if (!h) return;
    if (h.tur === 'subscription') {
      var d = h.ham;
      S.products.push({
        kind: 'subscription', id: d.id, slug: d.slug || C.slugify(d.name), name: d.name,
        image: '', imageUrl: d.logo || '', logo: d.logo || '', website: d.website || '',
        affiliateUrl: d.affiliateUrl || '', category: d.category || '', blocks: [C.bosMetinBlok()],
      });
    } else {
      var p = h.ham;
      if (S.products.some(function (x) { return x.id === p.id; })) { root.toast('Bu ürün zaten ekli', 'w'); return; }
      S.products.push({
        kind: 'product', id: p.id, slug: p.slug || C.slugify(p.name), name: p.name, brand: p.brand || '',
        techScore: p.techScore || 0, imageUrl: p.imageUrl || '', image: p.imageUrl || '', blocks: [C.bosMetinBlok()],
      });
      fiyatOku(p.id);
    }
    var box = el('bl_hits'); if (box) box.style.display = 'none';
    var inp = el('bl_pick'); if (inp) inp.value = '';
    renderItems(); renderOutline(); kirlet();
  };

  var _CUR = { TR: 'TRY', DE: 'EUR', GB: 'GBP', US: 'USD' };
  var _LOC = { TR: 'tr-TR', GB: 'en-GB', US: 'en-US', DE: 'de-DE' };
  async function fiyatOku(id) {
    try {
      var r = await root.getPb().collection('products').getOne(id, { fields: 'id,prices,lowestPrice,lowestPriceCurrency', $autoCancel: false });
      var prices = r.prices || {};
      var parts = [];
      ['TR', 'DE', 'GB', 'US'].forEach(function (cc) {
        var amt = Number(prices[cc]) || 0;
        if (amt > 0) {
          try { parts.push(new Intl.NumberFormat(_LOC[cc], { style: 'currency', currency: _CUR[cc], maximumFractionDigits: 0 }).format(amt)); }
          catch (_) { parts.push(Math.round(amt) + ' ' + _CUR[cc]); }
        }
      });
      var rec = S.products.find(function (x) { return x.id === id; });
      if (rec) {
        rec._livePrice = parts.length ? parts.join(' · ') : '—';
        var span = el('bl_pr_' + id); if (span) span.textContent = rec._livePrice;
      }
    } catch (_) { /* fiyat yoksa sessiz geç */ }
  }

  // ── RTE (Quill + HTML kaynak kipi) ──────────────────────────────────────
  function normalizeRte(html) {
    if (!html || html === '<p><br></p>') return '';
    try {
      var doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
      doc.querySelectorAll('ol').forEach(function (ol) {
        var lis = Array.prototype.slice.call(ol.children).filter(function (n) { return n.tagName === 'LI'; });
        var hepsiBullet = lis.length && lis.every(function (li) { return li.getAttribute('data-list') === 'bullet'; });
        lis.forEach(function (li) { li.removeAttribute('data-list'); });
        if (hepsiBullet) { var ul = doc.createElement('ul'); while (ol.firstChild) ul.appendChild(ol.firstChild); ol.replaceWith(ul); }
      });
      return doc.getElementById('r').innerHTML;
    } catch (_) { return html; }
  }
  // Quill 2 TABLOYU BOZUYOR — tablolu içerik otomatik HTML kaynak kipine geçer.
  var tabloVar = function (h) { return /<table/i.test(h || ''); };

  function mkQuill(wrapId, html, onChange) {
    var wrap = el(wrapId);
    if (!wrap || !root.Quill) return null;
    wrap.innerHTML = '<div></div>';
    var q = new root.Quill(wrap.firstChild, {
      theme: 'snow',
      placeholder: 'Yazmaya başla… (ya da “İçe aktar” ile bir taslak yükle)',
      modules: {
        toolbar: {
          container: [[{ header: [2, 3, 4, false] }], ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote', 'link', 'image'], ['clean']],
          handlers: {
            image: function () {
              var quill = this.quill;
              var u = prompt('Görsel URL’si:', '');
              if (!u) return;
              var r = quill.getSelection(true) || { index: quill.getLength() };
              quill.insertEmbed(r.index, 'image', u.trim(), 'user');
              quill.setSelection(r.index + 1);
            },
          },
        },
      },
    });
    if (html) q.clipboard.dangerouslyPasteHTML(html);
    q.on('text-change', function (d, od, src) {
      var h = q.root.innerHTML;
      onChange(h === '<p><br></p>' ? '' : h);
      if (src === 'user') kirlet();
    });
    return q;
  }

  function editorleriKur() {
    ['body', 'concl'].forEach(function (key) {
      var alan = key === 'body' ? 'body_' : 'conclusion_';
      var wrapId = key === 'body' ? 'bl_body_wrap' : 'bl_concl_wrap';
      var wrap = el(wrapId); if (!wrap) return;
      var html = S.editing[alan + S.lang] || '';
      if (tabloVar(html) && !S.srcMode[key]) S.srcMode[key] = true;
      if (S.srcMode[key]) {
        if (key === 'body') S.bodyQ = null; else S.conclQ = null;
        wrap.innerHTML = '<textarea class="bl-src" data-bli="src_' + key + '" spellcheck="false">' + esc(html) + '</textarea>'
          + (tabloVar(html) ? '<div style="font-size:11px;color:var(--text3);margin-top:4px">Tablo var — görsel editör tabloyu bozar, HTML kipinde kalıyor.</div>' : '');
      } else {
        var q = mkQuill(wrapId, html, function (h) { S.editing[alan + S.lang] = h; });
        if (key === 'body') S.bodyQ = q; else S.conclQ = q;
      }
    });
  }
  INP.src_body = function (e) { S.editing['body_' + S.lang] = e.value; kirlet(); ctxYenile(); };
  INP.src_concl = function (e) { S.editing['conclusion_' + S.lang] = e.value; kirlet(); ctxYenile(); };
  ACT.src = function (e, i, j, v) {
    editorleriBosalt();
    var alan = v === 'body' ? 'body_' : 'conclusion_';
    if (S.srcMode[v] && tabloVar(S.editing[alan + S.lang])) { root.toast('İçerikte tablo var — HTML kipinde kalıyor', 'w'); return; }
    S.srcMode[v] = !S.srcMode[v];
    renderDoc();
  };
  function editorleriBosalt() {
    if (!S.editing) return;
    var c = S.lang;
    if (!S.srcMode.body && S.bodyQ && S.bodyQ.root && S.bodyQ.root.isConnected) S.editing['body_' + c] = normalizeRte(S.bodyQ.root.innerHTML);
    if (!S.srcMode.concl && S.conclQ && S.conclQ.root && S.conclQ.root.isConnected) S.editing['conclusion_' + c] = normalizeRte(S.conclQ.root.innerHTML);
  }
  function paneliOku() {
    var a = S.editing; if (!a) return;
    if (deger('bl_title') !== undefined) a['title_' + S.lang] = deger('bl_title');
    if (deger('bl_lead') !== undefined) a['lead_' + S.lang] = deger('bl_lead');
    ['metaTitle', 'metaDescription', 'tags'].forEach(function (f) {
      var v = deger('bl_' + f); if (v !== undefined) a[(f === 'tags' ? 'tags_' : f + '_') + S.lang] = v;
    });
    var sl = deger('bl_slug'); if (sl !== undefined) a['slug_' + S.lang] = sl;
    if (deger('bl_cat') !== undefined) a.category = deger('bl_cat');
    if (deger('bl_author') !== undefined) a.author = deger('bl_author');
    if (deger('bl_pub') !== undefined) a.publishedAt = deger('bl_pub');
    var st = el('bl_status'); if (st) a.status = st.value;
    editorleriBosalt();
  }

  root.BlogUI = {
    S: S, kok: kok, el: el, renderEditor: renderEditor, renderDoc: renderDoc,
    renderItems: renderItems, renderOutline: function () { renderOutline(); },
    renderCtx: function () { renderCtx(); }, ctxYenile: function () { ctxYenile(); },
    paneliOku: paneliOku, editorleriBosalt: editorleriBosalt, kirlet: function () { kirlet(); },
    fiyatOku: fiyatOku, ACT: ACT, INP: INP, CHG: CHG, buyut: buyut, gorunenAd: gorunenAd,
    loadBlogAdmin: loadBlogAdmin, blogEdit: blogEdit, dilTam: dilTam, pbFileUrl: pbFileUrl,
    yedekTemizle: function (id) { yedekSil(id); },
  };

  // Dış yüzey — SADECE bu iki ad. `app.js:170` ve `index.html` bunlara bağlı.
  root.loadBlogAdmin = loadBlogAdmin;
  root.blogNew = blogNew;
})(typeof globalThis !== 'undefined' ? globalThis : window);
