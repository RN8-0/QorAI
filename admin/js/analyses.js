/* eslint-disable */
// ══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Analizler (`analyses` koleksiyonu)
//
//  UC IS YAPAR:
//   1. ANALIZ URETIR. Urunu ara, quiz'i BURADA yanitla, rapor TR + EN olarak
//      uretilsin. Quiz ve rapor prompt'lari SITENIN prompt'larinin AYNISI —
//      kopya degil, ayni dosya (admin/js/qor_ai_prompts.js; site tarafi
//      web/src/lib/aiPrompts.js ile ayni dosyayi ice aktariyor).
//   2. SITEDE YAPILMIS analizleri yayina alir (`saved_analyses`): urun, link
//      ve abonelik analizleri.
//   3. Yayin meta'sini uretir ve YINELENMEYI ENGELLER: ayni dilde iki analiz
//      ayni <title>/description tasiyamaz; yasakli liste prompt'a gider ve
//      kayit oncesi tekrar denetlenir.
//
//  Yayinlanan kayit /analiz/<slug> (+ /tr/analiz/<slug>) adresinde sitedeki
//  raporun BIREBIR AYNISI olarak cizilir ve sitemap'e girer.
//
//  ONEMLI: burada IKINCI bir prompt ya da IKINCI bir rapor gorunumu YOKTUR.
//  Ilk surumde ikisi de vardi ve yayinlanan sayfa siteyle ayrisiyordu.
// ══════════════════════════════════════════════════════════════
(function () {
  var LANGS = [['tr', 'Türkçe'], ['en', 'English']];
  var SITE = 'https://qorai.net';
  var KIND_LABEL = { product: 'Ürün', link: 'Link', subscription: 'Abonelik' };
  var SAVED_CATEGORY = {
    product: 'product_history',
    link: 'link_history',
    subscription: 'subscription_history',
  };

  var _items = [];
  var _editing = null;
  var _lang = 'tr';
  var _searchTimer = null;
  // Uretim akisinin durumu: { product, questions, answers, step, stages }
  var _run = null;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  // Slug uretimi TEK KAYNAKTAN: site urun adreslerini ayni fonksiyonla
  // uretiyor, ikinci bir slugify ayrisir.
  var slugify = function (v) { return QorAiPrompts.slugifyProduct(v); };
  var num = function (v) { return Number(v) || 0; };

  // `saved_analyses.analysisData` icindeki HAM raporu cozer.
  //  - urun  : `analysisData.analysis` (metin ya da obje) -> product_full_report
  //  - link  : `analysisData.result`   -> ortak ("enhanced") sekil ya da compare
  //  - abone : `analysisData.result`   -> abonelik sekli (services[])
  function raporCoz(ham) {
    if (!ham) return null;
    if (typeof ham === 'object') return ham;
    var s = String(ham).trim();
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    var ilk = s.indexOf('{');
    var son = s.lastIndexOf('}');
    if (ilk < 0 || son <= ilk) return null;
    try { return JSON.parse(s.slice(ilk, son + 1)); } catch (_) { return null; }
  }

  // Kayittan turun okunmasi — site tarafiyla ayni kural
  // (web/src/lib/analysisRecord.js: bos alan = eski urun analizi).
  function kindOf(a) {
    var k = String((a && a.kind) || '').trim().toLowerCase();
    return KIND_LABEL[k] ? k : 'product';
  }
  function reportOf(a, lang) {
    var other = lang === 'tr' ? 'en' : 'tr';
    var pick = function (v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; };
    return pick(a['report_' + lang]) || pick(a['report_' + other]) || pick(a.report);
  }
  function langsOf(a) {
    return ['tr', 'en'].filter(function (l) {
      var v = a['report_' + l];
      return v && typeof v === 'object';
    });
  }
  function subjectOf(a) {
    if (Array.isArray(a.subjectNames) && a.subjectNames.length) return a.subjectNames.filter(Boolean).join(' · ');
    if (a.productName) return a.productName;
    var r = reportOf(a, 'tr');
    return String((r && r.base && r.base.title) || (r && r.product && r.product.name) || '');
  }

  function styles() {
    if ($('anStyles')) return;
    var s = document.createElement('style');
    s.id = 'anStyles';
    s.textContent = [
      /* Ayrim kutu/golge ile degil, 1px hairline + bosluk ile. Sabit hex yok. */
      '.an-tabbar{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px}',
      '.an-tabbar button{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--text2);',
      '  font:inherit;font-size:13px;font-weight:600;padding:10px 16px;cursor:pointer;margin-bottom:-1px;transition:color .12s}',
      '.an-tabbar button:hover{color:var(--text1)}',
      '.an-tabbar button.on{color:var(--accent);border-bottom-color:var(--accent)}',

      '.an-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}',
      '.an-bar input,.an-bar select{padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);',
      '  font:inherit;background:var(--bg2);color:var(--text1)}',
      '.an-bar input:focus,.an-bar select:focus{outline:2px solid var(--accent);outline-offset:1px}',

      '.an-grid{display:flex;flex-direction:column;gap:8px}',
      '.an-row{display:grid;grid-template-columns:52px 1fr auto;gap:14px;align-items:center;',
      '  border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;background:var(--bg2);transition:border-color .12s}',
      /* Gorsel yoksa yer tutucu kutu CIZILMEZ — bos gri kare bilgi tasimiyor,
         yalnizca gurultu ekliyordu. Izgara iki sutuna duser. */
      '.an-row.noimg{grid-template-columns:1fr auto}',
      '.an-row:hover{border-color:var(--bg5)}',
      '.an-row img{width:52px;height:52px;object-fit:contain;border-radius:var(--radius-sm);background:var(--bg3)}',
      '.an-row h4{margin:0 0 4px;font-size:14.5px;font-weight:650;color:var(--text1);line-height:1.3}',
      '.an-meta{font-size:12px;color:var(--text3);display:flex;gap:10px;flex-wrap:wrap;align-items:center}',
      /* Sayilar daima tabular: puanlar alt alta hizalansin. */
      '.an-meta b{font-variant-numeric:tabular-nums;font-weight:650;color:var(--text2)}',
      '.an-pill{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:2px 7px;border-radius:4px;white-space:nowrap}',
      '.an-pill.pub{color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent)}',
      '.an-pill.draft{color:var(--amber);background:color-mix(in srgb,var(--amber) 12%,transparent)}',
      '.an-pill.kind{color:var(--accent);background:var(--accent3)}',
      '.an-pill.warn{color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent)}',
      '.an-acts{display:flex;gap:6px;flex-wrap:wrap}',

      '.an-card{border:1px solid var(--border);border-radius:var(--radius);padding:18px;background:var(--bg2);margin-bottom:14px;max-width:960px}',
      '.an-card-wide{max-width:none}',
      '.an-card h3{margin:0 0 14px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:700}',
      '.an-hint{font-size:12px;color:var(--text3);margin-top:6px;line-height:1.55}',
      '.an-hint a{color:var(--accent)}',
      '.an-note{background:var(--bg3);color:var(--text2);border-left:2px solid var(--accent);padding:12px 14px;',
      '  border-radius:0 var(--radius-sm) var(--radius-sm) 0;font-size:13px;margin-bottom:16px;max-width:960px;line-height:1.65}',
      '.an-note-err{border-left-color:var(--red);color:var(--red)}',

      /* Editor basligi: eylemler SAGA yaslanir, bulunmasi icin aranmaz. */
      '.an-head{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap}',
      '.an-head strong{font-size:15px;color:var(--text1)}',
      '.an-head-sp{flex:1 1 auto}',

      /* Onizleme: sitedeki sayfanin KENDISI. Yukseklik sabit degil, ekrana
         gore — rapor uzun ve kucuk bir kutuda okunmuyor. */
      '.an-frame{border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;background:var(--bg3)}',
      '.an-frame iframe{display:block;width:100%;height:min(78vh,900px);border:0}',

      /* Salt okunur kunye satiri — input DEGIL, cunku duzenlenmiyor. */
      '.an-ro{padding:12px 0;border-top:1px solid var(--border)}',
      '.an-ro:first-of-type{border-top:0;padding-top:0}',
      '.an-ro > span{display:block;font-size:11.5px;font-weight:600;color:var(--text3);margin-bottom:5px;letter-spacing:.02em}',
      '.an-ro > span i{font-style:normal;font-variant-numeric:tabular-nums;font-weight:500}',
      '.an-ro > span i.over{color:var(--red);font-weight:700}',
      '.an-ro > p{margin:0;font-size:14px;line-height:1.6;color:var(--text1)}',
      '.an-ro > p em{color:var(--text3)}',
      '.an-faqlist{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px}',
      '.an-faqlist li{color:var(--text2);font-size:13.5px;line-height:1.55}',
      '.an-faqlist b{display:block;color:var(--text1);font-weight:650}',
      '.an-tabbar button em{font-style:normal;font-size:11px;color:var(--text3);margin-left:4px}',

      /* Rapor ozeti — sayilar mono/tabular, etiketler sabit genislikte. */
      '.an-rapor{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:1px;background:var(--border);',
      '  border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}',
      '.an-rapor div{background:var(--bg3);padding:10px 12px}',
      '.an-rapor span{display:block;font-size:11px;color:var(--text3);margin-bottom:3px}',
      '.an-rapor b{font-size:15px;color:var(--text1);font-variant-numeric:tabular-nums;font-weight:650}',
      '.an-lead{margin:12px 0 0;color:var(--text2);font-size:13.5px;line-height:1.65}',

      /* ── Uretim akisi ── */
      '.an-steps{display:flex;gap:0;margin-bottom:20px;max-width:960px}',
      '.an-step{flex:1;padding:10px 0 12px;border-top:2px solid var(--border);color:var(--text3);font-size:12px;font-weight:600}',
      '.an-step.on{border-top-color:var(--accent);color:var(--accent)}',
      '.an-step.done{border-top-color:var(--green);color:var(--text2)}',
      '.an-step em{display:block;font-style:normal;font-size:11px;font-weight:500;color:var(--text3);margin-top:2px}',

      '.an-q{border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;margin-bottom:10px;background:var(--bg2)}',
      '.an-q > p{margin:0 0 12px;font-size:14.5px;line-height:1.6;color:var(--text1)}',
      '.an-q > p b{font-variant-numeric:tabular-nums;color:var(--text3);font-weight:650;margin-right:8px}',
      /* Quiz'de secenek sayisi DAIMA 4 (prompt'un sart kostugu sey). auto-fit
         3+1 gibi dengesiz bir satir birakiyordu; iki sutun 2+2 veriyor. */
      '.an-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '@media (max-width:720px){.an-opts{grid-template-columns:1fr}}',
      '.an-opt{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--border);',
      '  border-radius:var(--radius-sm);background:var(--bg3);cursor:pointer;font-size:13px;line-height:1.5;color:var(--text2);transition:border-color .12s,color .12s}',
      '.an-opt:hover{border-color:var(--bg5);color:var(--text1)}',
      '.an-opt.on{border-color:var(--accent);color:var(--text1);background:var(--accent3)}',
      '.an-opt input{margin:3px 0 0;accent-color:var(--accent);flex:0 0 auto}',

      '.an-prog{display:flex;flex-direction:column;gap:2px;max-width:640px;margin:18px 0}',
      '.an-prog div{display:flex;align-items:center;gap:10px;padding:11px 14px;border:1px solid var(--border);',
      '  border-radius:var(--radius-sm);background:var(--bg2);font-size:13px;color:var(--text3)}',
      '.an-prog div.on{color:var(--text1);border-color:var(--accent)}',
      '.an-prog div.done{color:var(--text2)}',
      '.an-prog div.fail{color:var(--red);border-color:var(--red)}',
      '.an-prog i{font-style:normal;width:18px;text-align:center;flex:0 0 auto}',
      '.an-empty{color:var(--text3);padding:24px 0;font-size:13.5px}',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ══ LISTE ══════════════════════════════════════════════════
  async function loadAnalysesAdmin() {
    styles();
    var root = $('analysesAdminRoot');
    if (!root) return;
    _run = null;
    _editing = null;
    root.innerHTML = '<p class="an-empty">Yükleniyor…</p>';
    try {
      _items = await getPb().collection('analyses').getFullList({ sort: '-updated', $autoCancel: false });
    } catch (e) {
      root.innerHTML = '<p style="color:var(--red)">Yüklenemedi: ' + esc(e.message || e) + '</p>';
      return;
    }
    var cnt = $('analysesCount');
    if (cnt) cnt.textContent = _items.length;
    renderList();
  }

  function renderList(filtre, durum, tur) {
    filtre = filtre || ''; durum = durum || ''; tur = tur || '';
    var root = $('analysesAdminRoot');
    if (!root) return;
    var f = filtre.trim().toLowerCase();
    var list = _items.filter(function (a) {
      if (durum && a.status !== durum) return false;
      if (tur && kindOf(a) !== tur) return false;
      if (!f) return true;
      return [subjectOf(a), a.slug, a.category].some(function (x) {
        return String(x || '').toLowerCase().indexOf(f) >= 0;
      });
    });
    var yayin = _items.filter(function (a) { return a.status === 'published'; }).length;

    root.innerHTML = ''
      + '<div class="an-note">'
      + '<strong>Analiz artık burada üretilir.</strong> <strong>+ Yeni analiz</strong> → ürünü ara → '
      + 'quiz\'i bu ekranda yanıtla → rapor <strong>TR ve EN</strong> olarak üretilsin. '
      + 'Sitede yapılmış ürün / link / abonelik analizlerini de yayına alabilirsin. '
      + 'Yayınlanan sayfa <code>/analiz/&lt;slug&gt;</code> adresinde <em>sitedeki raporun birebir aynısı</em> olarak çizilir.'
      + '</div>'
      + '<div class="an-bar">'
      + '<input id="anSearch" placeholder="Konu ya da slug ara…" style="min-width:260px" value="' + esc(filtre) + '">'
      + '<select id="anStatus">'
      + '<option value="">Tüm durumlar (' + _items.length + ')</option>'
      + '<option value="draft"' + (durum === 'draft' ? ' selected' : '') + '>Taslak (' + (_items.length - yayin) + ')</option>'
      + '<option value="published"' + (durum === 'published' ? ' selected' : '') + '>Yayında (' + yayin + ')</option>'
      + '</select>'
      + '<select id="anKind">'
      + '<option value="">Tüm türler</option>'
      + Object.keys(KIND_LABEL).map(function (k) {
        var n = _items.filter(function (a) { return kindOf(a) === k; }).length;
        return '<option value="' + k + '"' + (tur === k ? ' selected' : '') + '>' + KIND_LABEL[k] + ' (' + n + ')</option>';
      }).join('')
      + '</select>'
      + '<button class="btn btn-primary" onclick="analysesNew()">+ Yeni analiz</button>'
      + '</div>'
      + (list.length
        ? '<div class="an-grid">' + list.map(rowHtml).join('') + '</div>'
        : '<p class="an-empty">Kayıt yok.</p>');

    var si = $('anSearch');
    if (si) {
      si.oninput = function () {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(function () { renderList(si.value, $('anStatus').value, $('anKind').value); }, 200);
      };
      si.focus(); si.setSelectionRange(si.value.length, si.value.length);
    }
    ['anStatus', 'anKind'].forEach(function (id) {
      var el = $(id);
      if (el) el.onchange = function () { renderList($('anSearch').value, $('anStatus').value, $('anKind').value); };
    });
  }

  function rowHtml(a) {
    var diller = langsOf(a);
    var kind = kindOf(a);
    var r = reportOf(a, 'tr');
    var p = (r && r.product) || null;
    var skor = p ? num(p.matchScore) : num(r && r.enhancedScore);
    return ''
      + '<div class="an-row' + (a.productImage ? '' : ' noimg') + '">'
      + (a.productImage
        ? '<img src="' + esc(a.productImage) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
        : '')
      + '<div>'
      + '<h4>' + esc(subjectOf(a) || a.slug || '(adsız)') + '</h4>'
      + '<div class="an-meta">'
      + '<span class="an-pill ' + (a.status === 'published' ? 'pub' : 'draft') + '">' + (a.status === 'published' ? 'yayında' : 'taslak') + '</span>'
      + '<span class="an-pill kind">' + esc(KIND_LABEL[kind]) + '</span>'
      + (diller.length ? '<span>' + diller.map(function (l) { return l.toUpperCase(); }).join(' + ') + '</span>'
        : '<span class="an-pill warn">tek dil</span>')
      + (a.productBrand ? '<span>' + esc(a.productBrand) + '</span>' : '')
      + (skor ? '<span>uyum <b>' + skor + '</b>/100</span>' : '')
      + (a.techScore ? '<span>Qor AI <b>' + num(a.techScore) + '</b>/100</span>' : '')
      + (!r ? '<span class="an-pill warn">rapor yok</span>' : '')
      + '</div></div>'
      + '<div class="an-acts">'
      + (a.status === 'published'
        ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + SITE + '/analiz/' + esc(a.slug) + '">Sitede aç</a>' : '')
      // "Duzenle" DEGIL: ekran duzenlemiyor, gosteriyor ve yayinliyor.
      + '<button class="btn" onclick="analysesEdit(\'' + a.id + '\')">Aç</button>'
      + '<button class="btn btn-ghost" onclick="analysesDelete(\'' + a.id + '\')">Sil</button>'
      + '</div></div>';
  }

  // ══ YENI ANALIZ — iki yol ══════════════════════════════════
  function analysesNew(sekme) {
    styles();
    _run = null;
    var t = sekme || 'uret';
    var root = $('analysesAdminRoot');
    root.innerHTML = ''
      + '<button class="btn btn-ghost" onclick="loadAnalysesAdmin()" style="margin-bottom:14px">← Geri</button>'
      + '<div class="an-tabbar">'
      + '<button class="' + (t === 'uret' ? 'on' : '') + '" onclick="analysesNew(\'uret\')">Yeni analiz üret</button>'
      + '<button class="' + (t === 'sitede' ? 'on' : '') + '" onclick="analysesNew(\'sitede\')">Sitede yapılmışlardan al</button>'
      + '</div>'
      + '<div id="anNewBody"></div>';
    if (t === 'uret') renderUretAra('');
    else renderSitedeSec('product');
  }

  // ── 1) Yeni analiz üret: ürün ara ──────────────────────────
  function renderUretAra(q, hits, yukleniyor) {
    var b = $('anNewBody');
    if (!b) return;
    b.innerHTML = ''
      + adimlar(0)
      + '<div class="an-card">'
      + '<h3>1 · Analiz edilecek ürün</h3>'
      + '<div class="an-bar">'
      + '<input id="anProdQ" placeholder="Ürün adı, marka ya da model…" style="min-width:340px" value="' + esc(q || '') + '">'
      + '<button class="btn btn-primary" onclick="analysesProdSearch()">Ara</button>'
      + '</div>'
      + (yukleniyor ? '<p class="an-empty">Aranıyor…</p>' : '')
      + (hits && hits.length
        ? '<div class="an-grid">' + hits.map(function (p, i) {
          return ''
            + '<div class="an-row' + (p.imageUrl ? '' : ' noimg') + '">'
            + (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '')
            + '<div><h4>' + esc(p.name || '') + '</h4>'
            + '<div class="an-meta">'
            + (p.brand ? '<span>' + esc(p.brand) + '</span>' : '')
            + (p.category ? '<span>' + esc(p.category) + '</span>' : '')
            + (p.techScore ? '<span>Qor AI <b>' + num(p.techScore) + '</b>/100</span>' : '')
            + '</div></div>'
            + '<button class="btn btn-primary" onclick="analysesPickProduct(' + i + ')">Seç</button>'
            + '</div>';
        }).join('') + '</div>'
        : (hits ? '<p class="an-empty">Sonuç yok.</p>' : '<p class="an-hint">Katalogda arama Typesense üzerinden yapılır — sitedeki aramanın aynısı.</p>'))
      + '</div>';
    var el = $('anProdQ');
    if (el) {
      el.focus();
      el.onkeydown = function (e) { if (e.key === 'Enter') analysesProdSearch(); };
    }
  }

  function adimlar(i) {
    var ad = [
      ['Ürün', 'katalogdan seç'],
      ['Quiz', 'soruları yanıtla'],
      ['Rapor', 'TR + EN üret'],
      ['Yayın', 'meta ve slug'],
    ];
    return '<div class="an-steps">' + ad.map(function (x, k) {
      var cls = k < i ? 'done' : (k === i ? 'on' : '');
      return '<div class="an-step ' + cls + '">' + (k + 1) + '. ' + x[0] + '<em>' + x[1] + '</em></div>';
    }).join('') + '</div>';
  }

  async function analysesProdSearch() {
    var q = ($('anProdQ') || {}).value || '';
    renderUretAra(q, null, true);
    try {
      var hits = await QorAiRun.searchProducts(q, 12);
      window.__anHits = hits;
      renderUretAra(q, hits);
    } catch (e) {
      renderUretAra(q, []);
      toast('Arama başarısız: ' + (e.message || e), 'e');
    }
  }

  // ── 2) Quiz ────────────────────────────────────────────────
  async function analysesPickProduct(i) {
    var hit = (window.__anHits || [])[i];
    if (!hit) return;
    var b = $('anNewBody');
    b.innerHTML = adimlar(1) + '<p class="an-empty">Ürün yükleniyor ve quiz hazırlanıyor…</p>';
    try {
      // Quiz ve rapor TAM PB kaydindan uretilir: Typesense dokumaninda
      // specSections yok, oysa prompt'un tasidigi en degerli baglam o.
      var product = await QorAiRun.loadProduct(hit.id);
      var quiz = await QorAiRun.generateQuiz(product, 'tr');
      if (!quiz.length) throw new Error('Quiz üretilemedi');
      _run = { product: product, questions: quiz, answers: [], stages: [] };
      renderQuiz();
    } catch (e) {
      b.innerHTML = adimlar(1)
        + '<div class="an-card"><h3>Quiz üretilemedi</h3>'
        + '<p class="an-hint">' + esc(e.message || e) + '</p>'
        + '<button class="btn btn-primary" onclick="analysesPickProduct(' + i + ')">Tekrar dene</button>'
        + '<button class="btn btn-ghost" onclick="analysesNew(\'uret\')">Başka ürün</button></div>';
    }
  }

  function renderQuiz() {
    var b = $('anNewBody');
    var r = _run;
    var yanit = r.questions.filter(function (q, i) { return r.answers[i] != null; }).length;
    b.innerHTML = ''
      + adimlar(1)
      + '<div class="an-note">Quiz, sitedeki analizin ürettiği quiz\'in <strong>aynısı</strong> (aynı prompt, aynı soru sayısı). '
      + 'Verdiğin cevaplar rapordaki uyum puanını ve "cevapların neyi değiştirdi" bölümünü belirler.</div>'
      + '<div class="an-card" style="max-width:960px">'
      + '<h3 id="anQuizHead">2 · ' + esc(r.product.name || '') + ' · ' + yanit + '/' + r.questions.length + ' yanıtlandı</h3>'
      + r.questions.map(function (q, qi) {
        return '<div class="an-q"><p><b>' + (qi + 1) + '.</b>' + esc(q.text) + '</p>'
          + '<div class="an-opts">'
          + q.options.map(function (o, oi) {
            var on = r.answers[qi] === o;
            return '<label class="an-opt' + (on ? ' on' : '') + '">'
              + '<input type="radio" name="anq' + qi + '"' + (on ? ' checked' : '')
              + ' onchange="analysesAnswer(' + qi + ',' + oi + ')">'
              + '<span>' + esc(o) + '</span></label>';
          }).join('')
          + '</div></div>';
      }).join('')
      + '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">'
      + '<button class="btn btn-primary" id="anQuizGo" onclick="analysesRunReport()"' + (yanit < r.questions.length ? ' disabled' : '') + '>'
      + (yanit < r.questions.length ? 'Tüm soruları yanıtla' : 'Raporu üret (TR + EN)') + '</button>'
      + '<button class="btn btn-ghost" onclick="analysesNew(\'uret\')">Vazgeç</button>'
      + '</div>'
      + '<p class="an-hint">Rapor üretimi 5 AI çağrısı sürer (TR araştırma + TR rapor, EN araştırma + EN rapor, yayın meta\'sı). '
      + 'Bu sekmeyi kapatma.</p>'
      + '</div>';
  }

  // TUM QUIZ'I YENIDEN CIZMEZ. Ilk surumde her cevap renderQuiz() cagiriyordu:
  // 6 soruluk quizde her tiklamada sayfa bastan cizilip kaydirma konumu basa
  // doneyordu (ve ust uste tiklamalar birbirini yiyordu). Degisen tek sey
  // secili secenek, sayac ve butonun durumu — yalnizca onlar guncellenir.
  function analysesAnswer(qi, oi) {
    if (!_run) return;
    _run.answers[qi] = _run.questions[qi].options[oi];
    var kart = document.querySelectorAll('#anNewBody .an-q')[qi];
    if (kart) {
      var secenekler = kart.querySelectorAll('.an-opt');
      for (var i = 0; i < secenekler.length; i++) {
        secenekler[i].classList.toggle('on', i === oi);
      }
    }
    var yanit = _run.questions.filter(function (q, i) { return _run.answers[i] != null; }).length;
    var baslik = $('anQuizHead');
    if (baslik) baslik.textContent = '2 · ' + (_run.product.name || '') + ' · ' + yanit + '/' + _run.questions.length + ' yanıtlandı';
    var btn = $('anQuizGo');
    if (btn) {
      var tam = yanit === _run.questions.length;
      btn.disabled = !tam;
      btn.textContent = tam ? 'Raporu üret (TR + EN)' : 'Tüm soruları yanıtla';
    }
  }

  // ── 3) Rapor üret (TR + EN) ────────────────────────────────
  var PROG = [
    ['tr-research', 'Türkçe · web araştırması'],
    ['tr-report', 'Türkçe · rapor'],
    ['en-research', 'İngilizce · web araştırması'],
    ['en-report', 'İngilizce · rapor'],
    ['meta', 'Yayın meta\'sı ve SSS (TR + EN)'],
  ];

  function renderProgress(durum, hata) {
    var b = $('anNewBody');
    if (!b) return;
    b.innerHTML = adimlar(2)
      + '<div class="an-card"><h3>3 · Rapor üretiliyor</h3>'
      + '<div class="an-prog">'
      + PROG.map(function (p) {
        var st = durum[p[0]] || '';
        var ic = st === 'done' ? '✓' : st === 'run' ? '◐' : st === 'fail' ? '✕' : '·';
        return '<div class="' + (st === 'run' ? 'on' : st === 'done' ? 'done' : st === 'fail' ? 'fail' : '') + '">'
          + '<i>' + ic + '</i>' + esc(p[1]) + '</div>';
      }).join('')
      + '</div>'
      + (hata
        ? '<p style="color:var(--red);font-size:13px;line-height:1.6">' + esc(hata) + '</p>'
          + '<button class="btn btn-primary" onclick="analysesRunReport()">Tekrar dene</button> '
          + '<button class="btn btn-ghost" onclick="analysesBackToQuiz()">Quiz\'e dön</button>'
        : '<p class="an-hint">Araştırma adımı başarısız olursa rapor yine üretilir — sadece "kanıt zayıf" olarak işaretlenir.</p>')
      + '</div>';
  }

  function analysesBackToQuiz() { if (_run) renderQuiz(); }

  async function analysesRunReport() {
    if (!_run) return;
    var r = _run;
    var durum = {};
    renderProgress(durum);
    var answers = r.questions.map(function (q, i) {
      return { question: q.text, answer: r.answers[i] };
    }).filter(function (a) { return a.answer != null; });

    function mark(key, st) { durum[key] = st; renderProgress(durum); }

    try {
      var similar = await QorAiRun.similarProducts(r.product, 8);
      var out = {};
      // Quiz Turkce yanitlandi. Her dil KENDI dilindeki cevaplarla rapor
      // uretir; ceviri basarisiz olursa orijinal cevaplarla devam eder.
      var cevaplar = { tr: answers, en: null };
      for (var li = 0; li < LANGS.length; li++) {
        var lang = LANGS[li][0];
        if (!cevaplar[lang]) {
          mark('translate', 'run');
          cevaplar[lang] = await QorAiRun.translateQuizAnswers(answers, lang);
          mark('translate', 'done');
        }
        var res = await QorAiRun.runProductReport({
          product: r.product,
          lang: lang,
          answers: cevaplar[lang],
          similar: similar,
          onStage: (function (l) {
            return function (stage) {
              if (stage === 'research') mark(l + '-research', 'run');
              if (stage === 'report') { mark(l + '-research', 'done'); mark(l + '-report', 'run'); }
            };
          }(lang)),
        });
        mark(lang + '-research', 'done');
        mark(lang + '-report', 'done');
        out[lang] = res.data;
      }

      mark('meta', 'run');
      var meta = await metaUret(P_subject(r.product), 'product', out.tr);
      mark('meta', 'done');

      _editing = {
        kind: 'product',
        productId: r.product.id,
        productSlug: r.product.slug || slugify(r.product.name),
        productName: r.product.name || '',
        productImage: r.product.imageUrl || (Array.isArray(r.product.images) ? r.product.images[0] : '') || '',
        productBrand: r.product.brand || '',
        category: r.product.category || '',
        techScore: num(r.product.techScore),
        slug: slugify(r.product.slug || r.product.name),
        report_tr: out.tr,
        report_en: out.en,
        quiz: answers,
        subjectNames: [],
        sourceRef: '',
        status: 'draft',
        author: 'Qor AI',
        views: 0,
        likes: 0,
      };
      metaYaz(_editing, meta);
      // TASLAK OLARAK HEMEN KAYDET. Onizleme sitedeki sayfanin kendisi ve o
      // sayfa kaydi `?id=` ile cekiyor — kayit yoksa onizleyecek bir sey de
      // yok. Ayrica 6 AI cagrisinin sonucu sekme kazara kapanirsa kaybolmasin.
      mark('save', 'run');
      await kaydet('draft');
      mark('save', 'done');
      renderEditor();
    } catch (e) {
      var acik = Object.keys(durum).filter(function (k) { return durum[k] === 'run'; });
      acik.forEach(function (k) { durum[k] = 'fail'; });
      renderProgress(durum, e.message || String(e));
    }
  }

  function P_subject(product) {
    return QorAiPrompts.cleanProductName(product.name || '');
  }

  // Yasakli meta listesi: AYNI DILDE yinelenen <title>/description Google'da
  // iki sayfayi birbirinin kopyasi yapar. Liste prompt'a gider, kayit oncesi
  // ayrica denetlenir (metaCakismasi, kaydet oncesi).
  async function metaUret(subject, kind, report) {
    var used = { titles: [], descriptions: [] };
    _items.forEach(function (a) {
      ['tr', 'en'].forEach(function (l) {
        if (a['metaTitle_' + l]) used.titles.push(a['metaTitle_' + l]);
        if (a['metaDescription_' + l]) used.descriptions.push(a['metaDescription_' + l]);
      });
    });
    return QorAiRun.publishMeta({ subject: subject, kind: kind, report: report, used: used });
  }

  function metaYaz(a, meta) {
    ['tr', 'en'].forEach(function (l) {
      var m = meta[l] || {};
      a['title_' + l] = m.title || '';
      a['lead_' + l] = m.lead || '';
      a['metaTitle_' + l] = m.metaTitle || '';
      a['metaDescription_' + l] = m.metaDescription || '';
      a['faq_' + l] = m.faq || [];
    });
  }

  // ── Sitede yapılmışlardan al ───────────────────────────────
  async function renderSitedeSec(tur) {
    var b = $('anNewBody');
    b.innerHTML = ''
      + '<div class="an-tabbar" style="margin-bottom:14px">'
      + Object.keys(KIND_LABEL).map(function (k) {
        return '<button class="' + (tur === k ? 'on' : '') + '" onclick="analysesSitede(\'' + k + '\')">' + KIND_LABEL[k] + '</button>';
      }).join('')
      + '</div><p class="an-empty">Yükleniyor…</p>';
    var kayitlar = [];
    try {
      kayitlar = await getPb().collection('saved_analyses').getFullList({
        filter: 'category="' + SAVED_CATEGORY[tur] + '"', sort: '-savedAt', $autoCancel: false,
      });
    } catch (e) {
      b.innerHTML += '<p style="color:var(--red)">Okunamadı: ' + esc(e.message || e) + '</p>';
      return;
    }
    var uygun = kayitlar.map(function (k) {
      var d = k.analysisData || {};
      var rapor = tur === 'product' ? raporCoz(d.analysis) : raporCoz(d.result || d.analysisResult);
      return { k: k, d: d, rapor: rapor };
    }).filter(function (x) { return gecerliRapor(x.rapor, tur); });
    window.__anSaved = uygun;

    b.innerHTML = ''
      + '<div class="an-tabbar" style="margin-bottom:14px">'
      + Object.keys(KIND_LABEL).map(function (k) {
        return '<button class="' + (tur === k ? 'on' : '') + '" onclick="analysesSitede(\'' + k + '\')">' + KIND_LABEL[k] + '</button>';
      }).join('')
      + '</div>'
      + '<div class="an-note">Bu liste sitede GERÇEKTEN yapılmış analizlerden gelir. Yayına alınan kayıt tek dillidir '
      + '(analizin yapıldığı dil); iki dilli yayın için <strong>Yeni analiz üret</strong> yolunu kullan.</div>'
      + (uygun.length
        ? '<div class="an-grid">' + uygun.map(function (x, i) {
          var bilgi = sitedeBilgi(x, tur);
          return '<div class="an-row noimg">'
            + '<div><h4>' + esc(bilgi.ad) + '</h4><div class="an-meta">'
            + '<span>' + new Date(x.k.savedAt || x.k.created).toLocaleDateString('tr-TR') + '</span>'
            + bilgi.meta
            + '</div></div>'
            + '<button class="btn btn-primary" onclick="analysesPick(' + i + ',\'' + tur + '\')">Seç</button></div>';
        }).join('') + '</div>'
        : '<p class="an-empty">Yayınlanabilir ' + KIND_LABEL[tur].toLowerCase() + ' analizi yok.</p>');
  }

  function gecerliRapor(r, tur) {
    if (!r || typeof r !== 'object') return false;
    if (tur === 'product') return !!r.product;
    if (tur === 'subscription') return Array.isArray(r.services) && r.services.length > 0;
    // link: tekil rapor (ortak sekil) ya da karsilastirma
    return r.enhancedScore != null || !!r.base || Array.isArray(r.products);
  }

  function sitedeBilgi(x, tur) {
    if (tur === 'product') {
      var p = x.rapor.product || {};
      return {
        ad: x.d.productName || x.k.title || '',
        meta: (p.matchScore ? '<span>uyum <b>' + num(p.matchScore) + '</b>/100</span>' : '')
          + (p.decision ? '<span>' + esc(p.decision) + '</span>' : '')
          + (Array.isArray(p.quizInsights) ? '<span><b>' + p.quizInsights.length + '</b> quiz cevabı</span>' : ''),
      };
    }
    if (tur === 'subscription') {
      var svc = (x.rapor.services || []).map(function (s) { return s.name; }).filter(Boolean);
      return {
        ad: svc.join(' vs ') || x.k.title || '',
        meta: '<span><b>' + svc.length + '</b> servis</span>'
          + (x.rapor.winner && x.rapor.winner.name ? '<span>kazanan: ' + esc(x.rapor.winner.name) + '</span>' : ''),
      };
    }
    var cok = Array.isArray(x.rapor.products);
    return {
      ad: (x.rapor.base && x.rapor.base.title) || x.k.title || '',
      meta: '<span>' + (cok ? 'karşılaştırma' : 'tekil') + '</span>'
        + (x.rapor.enhancedScore ? '<span>uyum <b>' + num(x.rapor.enhancedScore) + '</b>/100</span>' : ''),
    };
  }

  function analysesSitede(tur) { renderSitedeSec(tur); }

  async function analysesPick(i, tur) {
    var x = (window.__anSaved || [])[i];
    if (!x) return;
    var b = $('anNewBody');
    b.innerHTML = '<p class="an-empty">Yayın meta\'sı üretiliyor…</p>';

    var d = x.d;
    var ad = sitedeBilgi(x, tur).ad;
    // Analizin dili tespit edilemiyor; kaynak dil olarak TR varsayilir ve
    // rapor O dilin alanina yazilir. Ikinci dil BOS kalir — site okurken
    // otekine duser, uydurma ceviri yazilmaz.
    var lang = 'tr';
    var kayit = {
      kind: tur,
      slug: slugify(ad),
      sourceRef: x.k.id,
      subjectNames: tur === 'product' ? [] : konuAdlari(x, tur),
      status: 'draft',
      author: 'Qor AI',
      views: 0,
      likes: 0,
      productId: '', productSlug: '', productName: '', productImage: '', productBrand: '',
      category: '', techScore: 0,
    };
    kayit['report_' + lang] = x.rapor;

    if (tur === 'product') {
      var pid = d.productId || '';
      var p = {};
      try { p = await getPb().collection('products').getOne(pid, { $autoCancel: false }); } catch (_) { p = {}; }
      kayit.productId = pid;
      kayit.productSlug = p.slug || slugify(ad);
      kayit.productName = d.productName || p.name || ad;
      kayit.productImage = p.imageUrl || '';
      kayit.productBrand = p.brand || '';
      kayit.category = d.category || p.category || '';
      kayit.techScore = num(p.techScore) || num(x.k.aiScore);
      kayit.slug = slugify(p.slug || kayit.productName);
    }

    // Ayni kaynak zaten yayindaysa IKINCI kayit acma, mevcudu tazele.
    var mevcut = _items.find(function (a) {
      return (a.sourceRef && a.sourceRef === x.k.id)
        || (tur === 'product' && kayit.productId && a.productId === kayit.productId);
    });
    if (mevcut) {
      mevcut['report_' + lang] = x.rapor;
      mevcut.kind = tur;
      mevcut.sourceRef = x.k.id;
      _editing = mevcut;
      await kaydet(mevcut.status || 'draft');
      toast('Bu analizin kaydı vardı — raporu tazelendi', 'i');
      renderEditor();
      return;
    }

    _editing = kayit;
    try {
      var meta = await metaUret(ad, tur, x.rapor);
      metaYaz(_editing, meta);
    } catch (e) {
      toast('Meta üretilemedi: ' + (e.message || e), 'e');
    }
    // TASLAK OLARAK KAYDET: onizleme sitedeki sayfanin kendisi ve kaydi
    // `?id=` ile cekiyor — kayit yoksa onizlenecek bir sey de yok.
    await kaydet('draft');
    renderEditor();
  }

  function konuAdlari(x, tur) {
    if (tur === 'subscription') return (x.rapor.services || []).map(function (s) { return s.name; }).filter(Boolean);
    if (Array.isArray(x.rapor.products)) return x.rapor.products.map(function (p) { return p.name; }).filter(Boolean);
    var t = (x.rapor.base && x.rapor.base.title) || x.k.title || '';
    return t ? [t] : [];
  }

  async function analysesEdit(id) {
    styles();
    try {
      _editing = await getPb().collection('analyses').getOne(id, { $autoCancel: false });
      renderEditor();
    } catch (e) { toast('Açılamadı: ' + (e.message || e), 'e'); }
  }

  // ══ EDITOR ═════════════════════════════════════════════════
  //
  //  BURADA HICBIR SEY ELLE DUZENLENMEZ.
  //  Rapor da, baslik/ozet/meta/SSS de AI uretiyor ve hepsi SEO'ya gore
  //  kuruluyor. Ilk surumde her alan bir <input> idi; anlamsizdi — insanin
  //  yapacagi is metni yeniden yazmak degil, ONAYLAMAK ya da yeniden urettirmek.
  //  Ekran artik: ONIZLEME (sitedeki sayfanin kendisi) + kunye (salt okunur) +
  //  Yayinla/Yayindan kaldir/Yeniden uret.
  //
  //  ONIZLEME NEDEN IFRAME: admin duz vanilla JS, site React. Raporu burada
  //  ikinci kez cizmek iki tasarimin ayrismasi demek — zaten bir kez yasandi.
  //  Bunun yerine sitenin KENDI sayfasi gomuluyor (`?id=` taslagi da acar,
  //  bkz. pages/AnalysisPost.jsx). Dil sekmesi adres onekini degistirir:
  //  `/analiz/...` = EN, `/tr/analiz/...` = TR. Sitede dil tarayicidan gelir,
  //  manuel secici YOKTUR; onek zaten var olan mekanizma.
  function renderEditor() {
    var a = _editing;
    var root = $('analysesAdminRoot');
    var L = _lang;
    var kind = kindOf(a);
    var rapor = reportOf(a, L);
    var diller = langsOf(a);
    var yayinda = a.status === 'published';

    root.innerHTML = ''
      + '<div class="an-head">'
      + '<button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Geri</button>'
      + '<strong>' + esc(subjectOf(a) || '') + '</strong>'
      + '<span class="an-pill ' + (yayinda ? 'pub' : 'draft') + '">' + (yayinda ? 'yayında' : 'taslak') + '</span>'
      + '<span class="an-pill kind">' + esc(KIND_LABEL[kind]) + '</span>'
      + '<span class="an-head-sp"></span>'
      + eylemler(a, yayinda)
      + '</div>'
      + adimlar(3)
      + (rapor ? '' : '<div class="an-note an-note-err">Rapor verisi yok — bu kayıt yayınlanamaz.</div>')
      + '<div class="an-tabbar">'
      + LANGS.map(function (x) {
        var v = a['report_' + x[0]] ? '' : ' <em>rapor yok</em>';
        return '<button class="' + (x[0] === L ? 'on' : '') + '" onclick="analysesLang(\'' + x[0] + '\')">'
          + x[1] + v + '</button>';
      }).join('')
      + '</div>'
      + onizlemeKart(a, L, diller)
      + kunyeKart(a, L, kind, rapor);
  }

  function eylemler(a, yayinda) {
    var kayitli = Boolean(a.id);
    return '<div class="an-acts">'
      + (yayinda && kayitli
        ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + SITE + '/analiz/' + esc(a.slug) + '">Sitede aç</a>'
        : '')
      + '<button class="btn btn-ghost" onclick="analysesMetaYenile()">Meta\'yı yeniden üret</button>'
      + (yayinda
        ? '<button class="btn" onclick="analysesYayindanKaldir()">Yayından kaldır</button>'
        : '<button class="btn btn-primary" onclick="analysesYayinla()">Yayınla</button>')
      + (kayitli ? '<button class="btn btn-ghost" onclick="analysesDelete(\'' + a.id + '\')">Sil</button>' : '')
      + '</div>';
  }

  // Onizleme adresi. Kayit HENUZ KAYDEDILMEMISSE (id yok) sitede gosterilecek
  // bir sey de yoktur — o durumda once taslak olarak kaydedilir.
  function onizlemeAdresi(a, lang) {
    var onek = lang === 'tr' ? '/tr' : '';
    return SITE + onek + '/analiz/' + encodeURIComponent(a.slug || '') + '?id=' + encodeURIComponent(a.id || '');
  }

  function onizlemeKart(a, L, diller) {
    if (!a.id) {
      return '<div class="an-card">'
        + '<h3>Önizleme</h3>'
        + '<p class="an-hint">Önizleme sitedeki sayfanın kendisidir; bunun için kaydın önce '
        + '<strong>taslak olarak kaydedilmesi</strong> gerekiyor.</p>'
        + '<button class="btn btn-primary" onclick="analysesTaslakKaydet()">Taslak olarak kaydet</button>'
        + '</div>';
    }
    if (diller.indexOf(L) < 0 && !reportOf(a, L)) {
      return '<div class="an-card"><h3>Önizleme</h3>'
        + '<p class="an-hint">Bu dilde rapor yok.</p></div>';
    }
    var url = onizlemeAdresi(a, L);
    return '<div class="an-card an-card-wide">'
      + '<h3>Önizleme · sitedeki sayfanın kendisi</h3>'
      + '<div class="an-frame"><iframe src="' + esc(url) + '" loading="lazy" title="Analiz önizleme"></iframe></div>'
      + '<div class="an-hint">Bu çerçevedeki sayfa <code>' + esc(url.replace(SITE, '')) + '</code> adresinden geliyor — '
      + 'ürün sayfasındaki analizle <strong>aynı bileşen</strong>. '
      + '<a href="' + esc(url) + '" target="_blank" rel="noopener">Yeni sekmede aç</a></div>'
      + '</div>';
  }

  // Kunye: AI'nin urettigi yayin metni + rapor ozeti. SALT OKUNUR.
  function kunyeKart(a, L, kind, rapor) {
    var t = function (f) { return String(a[f + '_' + L] || '').trim(); };
    var faq = Array.isArray(a['faq_' + L]) ? a['faq_' + L] : [];
    var mt = t('metaTitle');
    var md = t('metaDescription');
    var uzun = function (v, max) {
      return '<i class="' + (v.length > max ? 'over' : '') + '">' + v.length + '/' + max + '</i>';
    };
    var satir = function (etiket, deger, sayac) {
      return '<div class="an-ro"><span>' + esc(etiket) + (sayac || '') + '</span>'
        + '<p>' + (deger ? esc(deger) : '<em>boş</em>') + '</p></div>';
    };
    return '<div class="an-card">'
      + '<h3>Yayın metni · ' + esc(LANGS.filter(function (x) { return x[0] === L; })[0][1]) + ' · AI üretti</h3>'
      + satir('Başlık (H1)', t('title'))
      + satir('Özet', t('lead'))
      + satir('Arama başlığı <title>', mt, ' ' + uzun(mt, 60))
      + satir('Arama açıklaması', md, ' ' + uzun(md, 155))
      + '<div class="an-ro"><span>Sık sorulan sorular (' + faq.length + ')</span>'
      + (faq.length
        ? '<ol class="an-faqlist">' + faq.map(function (f) {
          return '<li><b>' + esc(f.q) + '</b><span>' + esc(f.a) + '</span></li>';
        }).join('') + '</ol>'
        : '<p><em>boş</em></p>')
      + '</div>'
      + satir('Adres', (a.slug || '') && (SITE + '/analiz/' + a.slug + '  ·  ' + SITE + '/tr/analiz/' + a.slug))
      + raporOzeti(kind, rapor)
      + '<div class="an-hint">Bu alanlar <strong>elle düzenlenmez</strong>. Rapor da, başlık/özet/meta/SSS de '
      + 'AI üretir ve SEO kurallarına göre kurulur; insanın işi onaylamak ya da '
      + '<strong>yeniden ürettirmek</strong>. Metin yanlışsa analizi yeniden üret.</div>'
      + '</div>';
  }

  function raporOzeti(kind, rapor) {
    if (!rapor) return '';
    var hucre = function (etiket, deger) {
      return '<div><span>' + esc(etiket) + '</span><b>' + esc(String(deger)) + '</b></div>';
    };
    var govde = '';
    if (kind === 'product' && rapor.product) {
      var p = rapor.product;
      govde = hucre('Karar', p.decision || '—')
        + hucre('Uyum', num(p.matchScore) + '/100')
        + hucre('Güven', num(p.confidence) + '/100')
        + hucre('Quiz cevabı', (p.quizInsights || []).length)
        + hucre('Faktör', (p.factors || []).length)
        + hucre('Kritik nokta', (p.criticalPoints || []).length)
        + hucre('Güçlü / zayıf', (p.strengths || []).length + ' / ' + (p.weaknesses || []).length)
        + hucre('Alternatif', (rapor.alternatives || []).length);
    } else if (kind === 'subscription') {
      var svc = rapor.services || [];
      govde = hucre('Servis', svc.length)
        + hucre('Kazanan', (rapor.winner && rapor.winner.name) || '—')
        + hucre('Güven', num(rapor.confidence) + '/100')
        + hucre('Fark', (rapor.decisiveDifferences || []).length);
    } else {
      govde = hucre('Biçim', Array.isArray(rapor.products) ? 'karşılaştırma' : 'tekil')
        + hucre('Uyum', num(rapor.enhancedScore) + '/100')
        + hucre('Karar', rapor.decision || '—')
        + hucre('Faktör', (rapor.factors || []).length);
    }
    return '<div class="an-ro"><span>Rapor</span><div class="an-rapor">' + govde + '</div></div>';
  }

  function analysesLang(c) { _lang = c; renderEditor(); }

  // ── kaydetme / yayin ───────────────────────────────────────
  // Ayni dilde YINELENEN meta yayina cikamaz. seo-audit.mjs build'i ayrica
  // kirar; burada yakalamak, kirik build'i beklemekten ucuz.
  function metaCakismasi(a) {
    var carp = [];
    ['tr', 'en'].forEach(function (l) {
      var t = String(a['metaTitle_' + l] || '').trim().toLowerCase();
      var d = String(a['metaDescription_' + l] || '').trim().toLowerCase();
      _items.forEach(function (o) {
        if (o.id && a.id && o.id === a.id) return;
        if (t && String(o['metaTitle_' + l] || '').trim().toLowerCase() === t) {
          carp.push(l.toUpperCase() + ' <title> — "' + (o.slug || o.id) + '" ile aynı');
        }
        if (d && String(o['metaDescription_' + l] || '').trim().toLowerCase() === d) {
          carp.push(l.toUpperCase() + ' açıklama — "' + (o.slug || o.id) + '" ile aynı');
        }
      });
    });
    return carp;
  }

  function slugCakismasi(a) {
    // Ayni slug ikinci bir kayitta olursa /analiz/<slug> hangisini cizecegi
    // BELIRSIZ olur ve on-render iki kaydi ayni dosyaya yazip birini ezer.
    return _items.filter(function (o) {
      return o.id !== a.id && String(o.slug || '') === a.slug;
    })[0];
  }

  async function kaydet(durum) {
    var a = _editing;
    if (!a.slug) { toast('Slug boş olamaz', 'e'); return false; }
    var carpanSlug = slugCakismasi(a);
    if (carpanSlug) {
      toast('Bu slug zaten kullanılıyor: ' + (subjectOf(carpanSlug) || carpanSlug.id), 'e');
      return false;
    }
    if (durum === 'published') {
      if (!reportOf(a, 'tr')) { toast('Rapor verisi olmayan analiz yayınlanamaz', 'e'); return false; }
      var carp = metaCakismasi(a);
      if (carp.length) {
        toast('Yinelenen meta: ' + carp[0] + ' — düzeltmeden yayınlanamaz', 'e');
        return false;
      }
      if (!a.publishedAt) a.publishedAt = new Date().toISOString();
    }
    a.status = durum;
    try {
      var rec = a.id
        ? await getPb().collection('analyses').update(a.id, a, { $autoCancel: false })
        : await getPb().collection('analyses').create(a, { $autoCancel: false });
      _editing = rec;
      // Liste onbellegi de tazelensin: slug/meta catisma denetimi _items'a bakiyor.
      var i = _items.findIndex(function (o) { return o.id === rec.id; });
      if (i >= 0) _items[i] = rec; else _items.unshift(rec);
      return true;
    } catch (e) { toast('Kaydedilemedi: ' + (e.message || e), 'e'); return false; }
  }

  async function analysesTaslakKaydet() {
    if (await kaydet('draft')) { toast('Taslak kaydedildi', 's'); renderEditor(); }
  }
  async function analysesYayinla() {
    if (await kaydet('published')) { toast('Yayınlandı', 's'); renderEditor(); }
  }
  async function analysesYayindanKaldir() {
    if (await kaydet('draft')) { toast('Yayından kaldırıldı', 'i'); renderEditor(); }
  }

  // Meta begenilmediyse: raporu yeniden uretmeden YALNIZ yayin metnini tazele.
  async function analysesMetaYenile() {
    var a = _editing;
    var rapor = reportOf(a, 'tr');
    if (!rapor) { toast('Rapor yok', 'e'); return; }
    toast('Meta yeniden üretiliyor…', 'i');
    try {
      var meta = await metaUret(subjectOf(a), kindOf(a), rapor);
      metaYaz(a, meta);
      // kaydet() catisma/dogrulama nedeniyle REDDEDEBILIR; o zaman "yenilendi"
      // demek yalan olur — yeni meta yalniz ekranda durur, kayitta degil.
      var yazildi = a.id ? await kaydet(a.status || 'draft') : true;
      toast(yazildi ? 'Meta yenilendi' : 'Meta üretildi ama KAYDEDİLEMEDİ', yazildi ? 's' : 'e');
      renderEditor();
    } catch (e) { toast('Meta üretilemedi: ' + (e.message || e), 'e'); }
  }

  async function analysesDelete(id) {
    if (!confirm('Bu analiz silinsin mi? Geri alınamaz.')) return;
    try {
      await getPb().collection('analyses').delete(id, { $autoCancel: false });
      toast('Silindi', 's');
      loadAnalysesAdmin();
    } catch (e) { toast('Silinemedi: ' + (e.message || e), 'e'); }
  }

  window.loadAnalysesAdmin = loadAnalysesAdmin;
  window.analysesNew = analysesNew;
  window.analysesProdSearch = analysesProdSearch;
  window.analysesPickProduct = analysesPickProduct;
  window.analysesAnswer = analysesAnswer;
  window.analysesRunReport = analysesRunReport;
  window.analysesBackToQuiz = analysesBackToQuiz;
  window.analysesSitede = analysesSitede;
  window.analysesPick = analysesPick;
  window.analysesEdit = analysesEdit;
  window.analysesDelete = analysesDelete;
  window.analysesLang = analysesLang;
  window.analysesTaslakKaydet = analysesTaslakKaydet;
  window.analysesYayinla = analysesYayinla;
  window.analysesYayindanKaldir = analysesYayindanKaldir;
  window.analysesMetaYenile = analysesMetaYenile;
})();
