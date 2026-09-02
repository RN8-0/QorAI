/* eslint-disable */
// ══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Analizler (`analyses` koleksiyonu)
//
//  IKI IS YAPAR:
//   1. ANALIZ URETIR. Kaynagi sec (urun / karsilastirma / link / abonelik),
//      quiz'i BURADA yanitla, rapor TR + EN olarak uretilsin. Quiz ve rapor
//      prompt'lari SITENIN prompt'larinin AYNISI — kopya degil, ayni dosya
//      (admin/js/qor_ai_prompts.js; site tarafi web/src/lib/aiPrompts.js ile
//      ayni dosyayi ice aktariyor).
//   2. Yayin meta'sini uretir ve YINELENMEYI ENGELLER: ayni dilde iki analiz
//      ayni <title>/description tasiyamaz; yasakli liste prompt'a gider ve
//      kayit oncesi tekrar denetlenir.
//
//  KALDIRILDI — "Sitede yapilmislardan al" (`saved_analyses`).
//  Ziyaretcinin sitede yaptigi analiz TEK DILDE uretiliyor (onun dilinde).
//  Buradan yayina alinan her kayit dolayisiyla tek dilliydi: oteki dilde
//  rapor yok demek, o dilde ON-RENDER YOK ve hreflang listesinde YOK demek —
//  yani yayinlanan sayfanin yarisi eksik dogyordu. Ustelik o analizler bir
//  BASKASININ quiz cevaplariyla uretilmisti; yayinlanan sayfada "bu analiz su
//  cevaplara gore yapildi" kunyesi o kisinin tercihlerini gosteriyordu.
//  Artik tek yol var: analiz BURADA, iki dilde, bastan uretilir.
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
  var KIND_LABEL = { product: 'Ürün', compare: 'Karşılaştırma', link: 'Link', subscription: 'Abonelik' };

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
      /* ── OLCULU TEK SUTUN ──────────────────────────────────────────────
         .main-content ekranin TAMAMINI kapliyor (margin-left:220px, baska
         sinir yok). Kartlarin kendi max-width:960px'i vardi, yani genis bir
         monitorde butun ekran analiz ekraninin SOL UCTE BIRINE sikismis
         goruunuyordu ve sagda 700px bos alan kaliyordu. Genislik artik TEK
         yerde: bu sutun. Kartlar sutunu doldurur, sutun ortalanir. Baslik
         seridi de ayni sutuna hizalanir — yoksa baslik solda, icerik ortada
         kalir ve hiza kirilir. */
      '#analysesView .view-header{max-width:1120px;margin-left:auto;margin-right:auto;width:100%}',
      '#analysesAdminRoot{max-width:1120px;margin:0 auto}',
      /* Ayrim kutu/golge ile degil, 1px hairline + bosluk ile. Sabit hex yok. */
      /* Dar ekranda sekme cubugu TASIYORDU ve sayfa yatay kaydirmadigi icin
         tasan sekmeler ekranin disinda kalip TIKLANAMIYORDU (390px'te abonelik
         kategorilerinden 'Hosting / Site' ve 'Oyun' boyleydi — olculdu: son
         butonun sag kenari 538px). Cubugun kendisi kayiyor; butonlar da
         sikismasin diye buzulmuyor. */
      '.an-tabbar{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;',
      '  overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--bg5) transparent}',
      '.an-tabbar button{flex:0 0 auto}',
      '.an-tabbar button{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--text2);',
      '  font:inherit;font-size:13px;font-weight:600;padding:10px 16px;cursor:pointer;margin-bottom:-1px;transition:color .12s}',
      '.an-tabbar button:hover{color:var(--text1)}',
      '.an-tabbar button.on{color:var(--accent);border-bottom-color:var(--accent)}',
      /* Alt sekme (urun / link / abonelik): ust sekmeden hafif, ikinci duzey. */
      '.an-tabbar-sub button{font-weight:550;padding:8px 14px}',
      '.an-tabbar-sub button em{font-style:normal;font-size:11px;color:var(--text3);margin-left:5px}',
      '.an-tabbar-sub button.on em{color:var(--accent)}',
      '.an-err{color:var(--red);font-size:13px;line-height:1.6;margin:10px 0}',
      /* Link/abonelik girisi: tek alan, genis. */
      '.an-f{margin-bottom:12px}',
      '.an-f label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:5px}',
      '.an-f input,.an-f textarea{width:100%;padding:10px 12px;border:1px solid var(--border);',
      '  border-radius:var(--radius-sm);font:inherit;box-sizing:border-box;background:var(--bg3);color:var(--text1)}',
      '.an-f textarea{resize:vertical;line-height:1.6;font-size:13px}',
      '.an-f input:focus,.an-f textarea:focus{outline:2px solid var(--accent);outline-offset:1px}',

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
      /* Kunyedeki TEK duzenlenebilir alan: gorsel. */
      '.an-ro-edit{border-left:2px solid var(--border)}',
      '.an-img-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px}',
      '.an-img-row .ba-input{flex:1 1 260px;min-width:0}',
      '.an-img-prev{width:44px;height:44px;object-fit:contain;border-radius:8px;background:var(--bg3);border:1px solid var(--border);flex:0 0 auto}',
      '.an-img-prev.empty{display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text3)}',
      '.an-img-prev.bad{opacity:.35}',
      '.an-img-hint{font-size:11px;color:var(--text3);margin:6px 0 0}',
      /* Karsilastirmada / abonelikte secili konu cipleri. */
      '.an-chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px}',
      '.an-chips-lg{margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}',
      '.an-chip{display:inline-flex;align-items:center;gap:7px;padding:5px 10px 5px 6px;border-radius:999px;',
      '  background:var(--bg3);border:1px solid var(--border);font-size:12.5px;color:var(--text1);max-width:280px}',
      '.an-chip img{width:20px;height:20px;object-fit:contain;border-radius:5px;background:var(--bg2);flex:0 0 auto}',
      '.an-chip button{border:0;background:none;color:var(--text3);cursor:pointer;font-size:15px;line-height:1;padding:0 2px;flex:0 0 auto}',
      '.an-chip button:hover{color:var(--text1)}',

      /* ── ABONELIK SECICI ──────────────────────────────────────────────
         Kutucuk = logo + ad. Sitedeki `subs-tile` ile ayni fikir; fark
         KATEGORI ONCE geliyor, yani karisik tur secimi hic kurulamiyor. */
      '.an-sub-kat{margin:0 0 14px}',
      '.an-sub-kat button:disabled{opacity:.32;cursor:not-allowed}',
      '.an-sub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;margin-bottom:16px}',
      '.an-sub-tile{position:relative;display:flex;align-items:center;gap:10px;padding:9px 11px;text-align:left;',
      '  border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg3);color:var(--text2);',
      '  font:inherit;font-size:12.5px;cursor:pointer;transition:border-color .12s,color .12s}',
      '.an-sub-tile:hover{border-color:var(--bg5);color:var(--text1)}',
      '.an-sub-tile:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
      '.an-sub-tile.on{border-color:var(--accent);color:var(--text1);background:var(--accent3)}',
      '.an-sub-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.an-sub-tick{margin-left:auto;color:var(--accent);font-weight:800;font-size:12px;flex:0 0 auto}',
      '.an-sub-logo{flex:0 0 auto;object-fit:contain;border-radius:7px;background:var(--bg2)}',
      /* Logosu olmayan servis: bos kare degil, adin ilk harfi. */
      '.an-sub-mono{display:inline-flex;align-items:center;justify-content:center;font-weight:750;',
      '  color:var(--text3);border:1px solid var(--border);font-size:13px}',
      '.an-sub-add{display:flex;gap:8px;flex-wrap:wrap}',
      '.an-sub-add input{flex:1 1 300px;min-width:0;padding:9px 12px;border:1px solid var(--border);',
      '  border-radius:var(--radius-sm);font:inherit;background:var(--bg3);color:var(--text1)}',
      '.an-sub-add input:focus{outline:2px solid var(--accent);outline-offset:1px}',
      /* Uretim ilerlemesi: cubuk + donen gosterge + sayan sure. */
      '.an-bar-track{height:3px;border-radius:999px;background:var(--bg3);overflow:hidden;margin:2px 0 14px}',
      /* AI kota beklemesi. Motor 429'da bekleyip TEKRAR DENIYOR; kullanici
         bunu gormezse duran ilerleme cubugunu "cokme" saniyor. */
      '.an-kota:empty{display:none}',
      /* "Yayinda analizi var" rozeti — ayni konunun ikinci analizi uretilmesin. */
      '.an-var{background:rgba(16,185,129,.14);color:#047857;font-weight:700}',
      /* Kuyruk seridindeki "Aç" / "Önizle" — satir yuksekligini bozmasin. */
      '.btn-xs{padding:3px 9px;font-size:11px;border-radius:7px;text-decoration:none}',
      /* Kuyruk seridi kart araligini kendisi tasir; bos oldugunda yer kaplamaz. */
      '#anKuyrukSerit:empty{display:none}',
      '.an-kota{margin:10px 0 0;padding:8px 11px;border-radius:8px;font-size:13px;font-weight:700;',
      '  background:rgba(245,158,11,.12);color:#b45309}',
      '.an-bar-fill{height:100%;background:var(--accent,#7c5cff);transition:width .4s ease-out}',
      /* Asagidaki `.an-prog i` kurali (0,1,1) genislige 18px basiyor, yukseklik
         11px kaliyordu -> gosterge daire degil ELIPS donuyordu. Bu yuzden
         selektor ozgullukte onu YENMEK zorunda. Kare olcu + 2px yan bosluk,
         isaretcilerin 18px sutununa hizali tutar. */
      '.an-prog i.an-spin{display:inline-block;width:14px;height:14px;margin:0 2px;flex:0 0 14px;',
      '  border-radius:50%;border:2px solid var(--border);border-top-color:var(--accent,#7c5cff);',
      '  animation:anSpin .7s linear infinite}',
      '@keyframes anSpin{to{transform:rotate(360deg)}}',
      '.an-sure{margin-left:auto;font-size:11px;color:var(--text3);font-weight:600;font-variant-numeric:tabular-nums}',
      '.an-prog > div{display:flex;align-items:center;gap:8px}',
      /* Hareket azaltma tercihi: donmeyi durdur, durum yine okunur. */
      '@media (prefers-reduced-motion: reduce){.an-prog i.an-spin{animation:none}.an-bar-fill{transition:none}}',
      '.an-pill{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:2px 7px;border-radius:4px;white-space:nowrap}',
      '.an-pill.pub{color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent)}',
      '.an-pill.draft{color:var(--amber);background:color-mix(in srgb,var(--amber) 12%,transparent)}',
      '.an-pill.kind{color:var(--accent);background:var(--accent3)}',
      '.an-pill.warn{color:var(--amber);background:color-mix(in srgb,var(--amber) 12%,transparent)}',
      '.an-pill.ready{color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent)}',
      '.an-pill.err{color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent)}',
      '.an-acts{display:flex;gap:6px;flex-wrap:wrap}',

      /* Genislik artik SUTUNUN isi (yukaridaki #analysesAdminRoot); kart
         kendi tavanini koymuyor. `an-card-wide` bu yuzden gereksiz kaldi ama
         cagrilari duruyor — zararsiz, kaldirmak icin sebep yok. */
      '.an-card{border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;background:var(--bg2);margin-bottom:14px}',
      '.an-card h3{margin:0 0 14px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:700;',
      '  display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.an-card h3 em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:600;color:var(--text2);font-variant-numeric:tabular-nums}',
      '.an-hint{font-size:12px;color:var(--text3);margin-top:6px;line-height:1.55}',
      '.an-hint a{color:var(--accent)}',
      '.an-note{background:var(--bg3);color:var(--text2);border-left:2px solid var(--accent);padding:12px 14px;',
      '  border-radius:0 var(--radius-sm) var(--radius-sm) 0;font-size:13px;margin-bottom:16px;line-height:1.65}',
      '.an-note-err{border-left-color:var(--red);color:var(--red)}',
      '.an-note-warn{border-left-color:var(--amber)}',
      '.an-note b{font-variant-numeric:tabular-nums}',

      /* ── Ozet seridi ── Sayilar buyuk ve tabular; etiket kucuk ve sessiz.
         Kutu/golge yok, ayrim yine 1px hairline. */
      '.an-ozet{display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding:0 0 16px;margin-bottom:16px;',
      '  border-bottom:1px solid var(--border)}',
      '.an-ozet-say{display:flex;gap:26px;flex-wrap:wrap}',
      '.an-ozet-say div{display:flex;flex-direction:column;gap:1px}',
      '.an-ozet-say b{font-size:23px;font-weight:750;line-height:1.05;color:var(--text1);font-variant-numeric:tabular-nums}',
      '.an-ozet-say span{font-size:11px;color:var(--text3);letter-spacing:.02em}',
      '.an-ozet-say .ok b{color:var(--green)}',
      '.an-ozet-say .uyari b{color:var(--amber)}',
      '.an-ozet-tur{display:flex;gap:14px;flex-wrap:wrap;padding-left:22px;border-left:1px solid var(--border)}',
      '.an-tur{font-size:12px;color:var(--text3);display:inline-flex;gap:5px;align-items:baseline}',
      '.an-tur b{color:var(--text2);font-weight:650;font-variant-numeric:tabular-nums}',
      '.an-ozet-son{margin-left:auto;font-size:12px;color:var(--text3)}',
      '.an-ozet-son b{color:var(--text2);font-weight:650;font-variant-numeric:tabular-nums}',
      '@media (max-width:860px){.an-ozet-tur{padding-left:0;border-left:0}.an-ozet-son{margin-left:0}}',

      /* ── Yayin hazirlik listesi ── */
      '.an-chk h3{justify-content:flex-start}',
      '.an-chklist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}',
      '.an-chklist li{display:flex;gap:10px;align-items:flex-start;padding:9px 0;font-size:13px;line-height:1.55;',
      '  color:var(--text2);border-top:1px solid var(--border)}',
      '.an-chklist li:first-child{border-top:0;padding-top:0}',
      '.an-chklist i{font-style:normal;font-weight:800;font-size:11px;line-height:1.6;flex:0 0 14px;text-align:center}',
      '.an-chk-engel i{color:var(--red)}',
      '.an-chk-engel{color:var(--text1)}',
      '.an-chk-uyari i{color:var(--amber)}',
      '.an-chk-ok{margin:0;font-size:13.5px;color:var(--green);line-height:1.6}',
      '.an-urls{display:flex;gap:14px;flex-wrap:wrap}',
      '.an-urls code{font-size:11.5px;color:var(--text3)}',

      /* ── "Devam" seridi — buton + neden yanyana ── */
      '.an-go{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:4px}',
      '.an-go-note{font-size:12px;color:var(--text3);line-height:1.55;max-width:56ch}',
      '.an-go-note b{color:var(--text2);font-weight:650;font-variant-numeric:tabular-nums}',

      /* Editor basligi: eylemler SAGA yaslanir, bulunmasi icin aranmaz. */
      '.an-head{display:flex;gap:10px;align-items:center;margin-bottom:18px;flex-wrap:wrap}',
      '.an-head-slim{padding-bottom:14px;border-bottom:1px solid var(--border)}',
      '.an-head-slim strong{font-size:14px;color:var(--text2);font-weight:650}',
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
      '.an-steps{display:flex;gap:0;margin-bottom:22px}',
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

      '.an-prog{display:flex;flex-direction:column;gap:2px;max-width:660px;margin:18px auto}',
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
    // KUYRUK KOSARKEN SIFIRLAMA YOK. Bu iki satir kosulsuzdu ve kuyrugu
    // KILITLIYORDU: `analysesRunReport` TR -> EN gecisinde kendini yeniden
    // cagiriyor, `_run` bu arada silinmisse "if (!_run) return" ile cikiyor
    // ve kuyrugun bekledigi promise hic cozulmuyordu (bkz. analysesRunReport
    // basligi). Kosu artik parametreyle tasiniyor ama bu koruma da kalsin:
    // yarim kalmis bir uretime baska bir bolumden donunce ilerleme gorunsun.
    if (!_kuyrukAktif) { _run = null; _editing = null; }
    _slugHata = ''; _slugTaslak = '';
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
      // KUYRUK LISTE EKRANINDA DA GORUNUR. Onceden yalnizca "Yeni analiz"
      // ekranindaydi; kuyruk kosarken listeye donen kullanici hicbir iz
      // goremiyor ve isin durdugunu saniyordu.
      + '<div id="anKuyrukSerit">' + kuyrukSeridi() + '</div>'
      + ozetSerit()
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

  // ── OZET SERIDI ────────────────────────────────────────────
  //
  //  Yerine gectigi sey, ekrani her acilista okunan dort satirlik bir
  //  aciklama metniydi ("analiz artik burada uretilir…"). Ilk seferden sonra
  //  hicbir sey soylemiyordu. Ayni yer artik DEGISEN seyi gosteriyor: kac
  //  taslak var, kaci gercekten yayina hazir, kac kayit tek dilli. Sayilar
  //  daima tabular — alt alta hizalansinlar.
  function ozetSerit() {
    var yayin = _items.filter(function (a) { return a.status === 'published'; });
    var taslak = _items.filter(function (a) { return a.status !== 'published'; });
    var hazir = taslak.filter(function (a) { return yayinDenetim(a).hazir; }).length;
    var tekDil = _items.filter(function (a) { return langsOf(a).length < 2; }).length;
    var sonTarih = yayin.map(function (a) { return a.publishedAt || a.updated || ''; })
      .filter(Boolean).sort().pop();

    var hucre = function (etiket, deger, vurgu) {
      return '<div' + (vurgu ? ' class="' + vurgu + '"' : '') + '>'
        + '<b>' + esc(String(deger)) + '</b><span>' + esc(etiket) + '</span></div>';
    };
    var turler = Object.keys(KIND_LABEL).map(function (k) {
      var n = _items.filter(function (a) { return kindOf(a) === k; }).length;
      return n ? '<span class="an-tur"><b>' + n + '</b>' + esc(KIND_LABEL[k]) + '</span>' : '';
    }).filter(Boolean).join('');

    return '<div class="an-ozet">'
      + '<div class="an-ozet-say">'
      + hucre('toplam', _items.length)
      + hucre('yayında', yayin.length, 'ok')
      + hucre('taslak', taslak.length)
      + hucre('yayınlanabilir', hazir, hazir ? 'ok' : '')
      + (tekDil ? hucre('tek dilli', tekDil, 'uyari') : '')
      + '</div>'
      + (turler ? '<div class="an-ozet-tur">' + turler + '</div>' : '')
      + (sonTarih
        ? '<div class="an-ozet-son">son yayın <b>'
          + esc(new Date(sonTarih).toLocaleDateString('tr-TR')) + '</b></div>'
        : '')
      + '</div>'
      + (tekDil
        ? '<div class="an-note an-note-warn">Tek dilli <b>' + tekDil + '</b> kayıt var. '
          + 'Bir dilde raporu olmayan analiz o dilde <strong>ön-render edilmez</strong> ve '
          + 'hreflang listesine girmez — yani o dil için arama sonucunda yoktur.</div>'
        : '');
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
      // Taslakta "yayina hazir mi" sorusunun cevabi, kaydi ACMADAN gorunsun.
      // UC DURUM, iki degil: "engelsiz" ile "kusursuz" ayni sey DEGIL. Tek
      // dilli, SSS'siz bir kayit yayinlanabilir ama yarim cikar; ona "hazır"
      // demek soz vermek olurdu.
      + (a.status === 'published' ? '' : durumRozeti(a))
      + '<span class="an-pill kind">' + esc(KIND_LABEL[kind]) + '</span>'
      + (diller.length === 2 ? '<span>TR + EN</span>'
        : diller.length ? '<span class="an-pill warn">yalnız ' + diller[0].toUpperCase() + '</span>'
          : '<span class="an-pill warn">rapor yok</span>')
      + (a.productBrand ? '<span>' + esc(a.productBrand) + '</span>' : '')
      + (skor ? '<span>uyum <b>' + skor + '</b>/100</span>' : '')
      + (a.techScore ? '<span>Qor AI <b>' + num(a.techScore) + '</b>/100</span>' : '')
      + '</div></div>'
      + '<div class="an-acts">'
      + (a.status === 'published'
        ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + SITE + '/analiz/' + esc(a.slug) + '">Sitede aç</a>'
        // TASLAKTA TEK TIKLA YAYIN. Kuyruk on taslak urettiginde hepsini tek
        // tek acip yayinlamak gerekiyordu; buton ayni denetimlerden gecer
        // (bkz. analysesListedenYayinla), yalnizca ekran degistirmez.
        // Raporu olmayan kaydi yayinlatmaya calismak anlamsiz — buton o
        // durumda hic cizilmez, "Ac" ile eksigi gorulur.
        : (reportOf(a, 'tr')
          ? '<button class="btn btn-primary" onclick="analysesListedenYayinla(\'' + a.id + '\')">Yayınla</button>'
          : ''))
      // "Duzenle" DEGIL: ekran duzenlemiyor, gosteriyor ve yayinliyor.
      + '<button class="btn" onclick="analysesEdit(\'' + a.id + '\')">Aç</button>'
      + '<button class="btn btn-ghost" onclick="analysesDelete(\'' + a.id + '\')">Sil</button>'
      + '</div></div>';
  }

  // ══ YENI ANALIZ ════════════════════════════════════════════
  //
  // TEK YOL. Ust sekme cubugu (Yeni analiz uret / Sitede yapilmislardan al)
  // KALDIRILDI — gerekcesi dosya basliginda. Tek secenegin sekmesi olmaz.
  function analysesNew() {
    styles();
    // KUYRUK KOSARKEN SIFIRLAMA. Onceden bu satir kosulsuz `_run = null`
    // yapiyordu: baska bir bolume girip donunce uretim ekrani sifirlaniyor,
    // ilerleme kayboluyordu (is arka planda surse bile takip edilemiyordu).
    if (!_kuyrukAktif) _run = null;
    var root = $('analysesAdminRoot');
    root.innerHTML = ''
      + '<div class="an-head an-head-slim">'
      + '<button class="btn btn-ghost" onclick="loadAnalysesAdmin()">← Analizler</button>'
      + '<strong>Yeni analiz</strong>'
      + '</div>'
      + '<div id="anNewBody"></div>';
    analysesUretTur(_uretTur);
  }

  // ── 1) Yeni analiz: KAYNAK TUR SEC ────────────────────────
  //
  //  Uc turun de KAYNAGI farkli, gerisi AYNI: quiz -> TR rapor -> cevap
  //  cevirisi -> EN rapor -> meta -> taslak. O yuzden yalnizca bu adim
  //  ture gore degisiyor; quiz ve uretim ekrani ortak.
  var _uretTur = 'product';
  var URET_TUR = [
    ['product', 'Ürün', 'katalogdan ara'],
    ['compare', 'Karşılaştırma', '2+ ürün seç'],
    ['link', 'Link', 'ürün linki yapıştır'],
    ['subscription', 'Abonelik', 'servis seç'],
  ];

  function analysesUretTur(tur) {
    _uretTur = tur || 'product';
    if (!_kuyrukAktif) _run = null;
    var b = $('anNewBody');
    if (!b) return;
    b.innerHTML = ''
      + adimlar('kaynak', _uretTur)
      + '<div class="an-tabbar an-tabbar-sub">'
      + URET_TUR.map(function (x) {
        return '<button class="' + (x[0] === _uretTur ? 'on' : '') + '" onclick="analysesUretTur(\'' + x[0] + '\')">'
          + x[1] + ' <em>' + x[2] + '</em></button>';
      }).join('')
      + '</div>'
      + '<div id="anKaynak"></div>';
    if (_uretTur === 'product') renderUretAra('');
    else if (_uretTur === 'compare') { _cmpSecili = []; renderCmpAra(''); }
    else if (_uretTur === 'link') renderLinkGiris();
    else { _subSecili = []; _subKat = 'video'; renderAbonelikGiris(); }
  }

  // ── Kaynak: KARSILASTIRMA (2+ katalog urunu) ───────────────
  //
  // Motor bunu ZATEN destekliyordu (compareQuizGenerationPrompt +
  // buildCompareProductPrompt + buildCompareVerdictPrompt -> compare_full_report)
  // ve on-render de dogru ciziyordu (seo.mjs -> anKarsilastirmaGovde).
  // Eksik olan iki sey vardi: buradaki secim ekrani ve sitenin REACT
  // tarafindaki dogru bilesen (AnalysisPost link gorunumune dusuyordu —
  // orada duzeltildi).
  var _cmpSecili = [];
  // ESKIDEN 6 IDI ve gerekcesi suydu: tek bir AI cagrisi butun urunleri tek
  // JSON'a yaziyordu, yani cikti tavani (16k jeton) urun sayisiyla bolusuluyor
  // ve motor 4. urunden sonra istedigi paragraf sayisini kendisi dusuruyordu.
  // Motor artik sitedeki hatti kullaniyor (qor_ai_run.js -> runCompareReport):
  // HER URUN KENDI cagrisinda tam derinlikte yaziliyor, sonra tek hukum
  // cagrisi. Derinlik urun sayisindan bagimsiz; sinirlayan tek sey SURE.
  var CMP_MAX = 12;

  // Kac AI cagrisi olacagini ONCEDEN soyle. Iki dil bagimsiz kosuyor:
  // dil basina 1 arastirma + N urun raporu + 1 hukum, ustune 2 quiz ve 1 meta.
  function cmpCagriSayisi(n) { return 2 * (2 + n) + 1; }

  /* ── TEK KATEGORI KURALI ─────────────────────────────────────────────────
     Sitede bu kural VAR (web/src/lib/compare.js -> tryAdd, reason:'category'
     ve pages/Compare.jsx -> pick): havuzdaki ilk urun kategoriyi KILITLER,
     baska kategoriden urun eklenemez. Admin panelinde yoktu; yalnizca
     "farkli kategoriler karsilastirilabilir ama rapor zayiflar" diyen bir
     ipucu vardi. Bir tablet ile bir telefonu karsilastiran rapor anlamli
     degil: `buildCompareVerdictPrompt` iki urunu ayni faktor matrisinde
     puanliyor ve o matris kategoriye ozgu. */
  function cmpKilitliKategori() {
    for (var i = 0; i < _cmpSecili.length; i += 1) {
      var c = String(_cmpSecili[i].category || '').trim();
      if (c) return c;
    }
    return '';
  }
  function cmpKategoriUyar(cat) {
    var kilit = cmpKilitliKategori();
    toast('Karşılaştırma tek kategoriden yapılır. Havuz “' + (kilit || '—')
      + '” kategorisinde; “' + (cat || '—') + '” eklenemez.', 'w');
  }

  function cmpSeciliSerit() {
    if (!_cmpSecili.length) {
      return '<p class="an-hint">En az 2 ürün seç. <b>Tek kategori kuralı:</b> ilk seçtiğin '
        + 'ürün kategoriyi kilitler — tablet ile telefon karşılaştırılamaz (sitedeki kuralın aynısı).</p>';
    }
    var n = _cmpSecili.length;
    var kilit = cmpKilitliKategori();
    return '<div class="an-chips">'
      + _cmpSecili.map(function (p, i) {
        return '<span class="an-chip">'
          + (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="" onerror="this.remove()">' : '')
          + esc(p.name || '')
          + '<button onclick="analysesCmpCikar(' + i + ')" title="Çıkar">×</button></span>';
      }).join('')
      + '</div>'
      + (kilit
        ? '<p class="an-hint">Kategori kilitli: <b>' + esc(kilit) + '</b>. '
          + 'Başka kategoriden ürün eklenemez — hepsini çıkarınca kilit açılır.</p>'
        : '')
      + (n >= 2
        ? '<div class="an-go"><button class="btn btn-primary" onclick="analysesCmpBasla()">'
          + n + ' ürünü karşılaştır →</button>'
          + '<span class="an-go-note">Her ürün <b>kendi</b> raporunu alır — derinlik ürün sayısıyla '
          + 'azalmaz. Toplam <b>' + cmpCagriSayisi(n) + '</b> AI çağrısı (2 dil).</span></div>'
        : '<p class="an-hint">Bir ürün daha seç.</p>');
  }

  function renderCmpAra(q, hits, yukleniyor) {
    var b = $('anKaynak');
    if (!b) return;
    var secili = {};
    _cmpSecili.forEach(function (p) { secili[p.id] = true; });
    var kilitliKat = cmpKilitliKategori();
    b.innerHTML = ''
      + '<div class="an-card">'
      + '<h3>1 · Karşılaştırılacak ürünler <em>(' + _cmpSecili.length + '/' + CMP_MAX + ')</em></h3>'
      + cmpSeciliSerit()
      + '<div class="an-bar" style="margin-top:12px">'
      + '<input id="anCmpQ" placeholder="Ürün adı, marka ya da model…" style="min-width:340px" value="' + esc(q || '') + '">'
      + '<button class="btn btn-primary" onclick="analysesCmpSearch()">Ara</button>'
      + '</div>'
      + (yukleniyor ? '<p class="an-empty">Aranıyor…</p>' : '')
      + (hits && hits.length
        ? '<div class="an-grid">' + hits.map(function (p, i) {
          var var_ = secili[p.id];
          return ''
            + '<div class="an-row' + (p.imageUrl ? '' : ' noimg') + '">'
            + (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '')
            + '<div><h4>' + esc(p.name || '') + '</h4>'
            + '<div class="an-meta">'
            + (p.brand ? '<span>' + esc(p.brand) + '</span>' : '')
            + (p.category ? '<span>' + esc(p.category) + '</span>' : '')
            + (p.techScore ? '<span>Qor AI <b>' + num(p.techScore) + '</b>/100</span>' : '')
            + '</div></div>'
            + (var_
              ? '<button class="btn btn-ghost" disabled>Seçildi</button>'
              : (kilitliKat && String(p.category || '') !== kilitliKat
                ? '<button class="btn btn-ghost" disabled title="Havuz “' + esc(kilitliKat)
                  + '” kategorisinde">Farklı kategori</button>'
                : '<button class="btn btn-primary" onclick="analysesCmpEkle(' + i + ')"'
                  + (_cmpSecili.length >= CMP_MAX ? ' disabled title="En fazla ' + CMP_MAX + ' ürün"' : '')
                  + '>Ekle</button>'))
            + '</div>';
        }).join('') + '</div>'
        : (hits ? '<p class="an-empty">Sonuç yok.</p>' : ''))
      + '</div>';
    var el = $('anCmpQ');
    if (el) el.onkeydown = function (e) { if (e.key === 'Enter') analysesCmpSearch(); };
  }

  async function analysesCmpSearch() {
    var el = $('anCmpQ');
    var q = el ? String(el.value || '').trim() : '';
    if (!q) return;
    renderCmpAra(q, null, true);
    try {
      var hits = await QorAiRun.searchProducts(q, 12);
      window.__anCmpHits = hits;
      renderCmpAra(q, hits);
    } catch (e) {
      renderCmpAra(q, []);
      toast('Arama başarısız: ' + (e && e.message ? e.message : e), 'e');
    }
  }

  async function analysesCmpEkle(i) {
    var hit = (window.__anCmpHits || [])[i];
    if (!hit || _cmpSecili.length >= CMP_MAX) return;
    if (_cmpSecili.some(function (p) { return p.id === hit.id; })) return;
    // SON KAPI. Buton zaten kilitli kategoride devre disi ama arama sonucu
    // eskimis olabilir (havuz bu arada degistiyse); abonelik akisindaki
    // ayni desen.
    var kilit = cmpKilitliKategori();
    if (kilit && String(hit.category || '') !== kilit) {
      cmpKategoriUyar(hit.category);
      return;
    }
    try {
      // TAM PB kaydi: Typesense dokumaninda specSections yok ve prompt'un
      // tasidigi en degerli baglam o (urun akisiyla ayni gerekce).
      var tam = await QorAiRun.loadProduct(hit.id);
      _cmpSecili.push(tam);
    } catch (_) {
      _cmpSecili.push(hit);
    }
    var el = $('anCmpQ');
    renderCmpAra(el ? el.value : '', window.__anCmpHits);
  }

  function analysesCmpCikar(i) {
    _cmpSecili.splice(i, 1);
    var el = $('anCmpQ');
    renderCmpAra(el ? el.value : '', window.__anCmpHits);
  }

  async function analysesCmpBasla() {
    if (_cmpSecili.length < 2) return;
    // Karisik kategori buraya kadar gelemez, ama gelirse rapor anlamsiz
    // olurdu: faktor matrisi kategoriye ozgu.
    var kilit = cmpKilitliKategori();
    var karisik = _cmpSecili.filter(function (p) {
      return String(p.category || '') && String(p.category || '') !== kilit;
    });
    if (karisik.length) {
      toast('Karşılaştırma tek kategoriden yapılır: ' + karisik.map(function (p) {
        return p.name;
      }).join(', ') + ' farklı kategoride.', 'e');
      return;
    }
    var cmpEngel = uretimKapisi('compare', { products: _cmpSecili });
    if (cmpEngel) { toast(cmpEngel, 'e'); return; }
    var b = $('anKaynak');
    b.innerHTML = '<div class="an-card"><h3>1 · Hazırlanıyor</h3>'
      + '<p class="an-empty">Karşılaştırma quizi hazırlanıyor…</p></div>';
    try {
      var quiz = await QorAiRun.generateCompareQuiz(_cmpSecili, 'tr');
      if (!quiz.length) throw new Error('Quiz üretilemedi');
      _run = yeniRun('compare', { products: _cmpSecili.slice() }, quiz);
      renderQuiz();
    } catch (e) {
      b.innerHTML = '<div class="an-card"><h3>Quiz üretilemedi</h3>'
        + '<p class="an-err">' + esc(e.message || e) + '</p>'
        + '<button class="btn btn-primary" onclick="analysesCmpBasla()">Tekrar dene</button> '
        + '<button class="btn btn-ghost" onclick="analysesUretTur(\'compare\')">Ürünleri değiştir</button></div>';
    }
  }

  // ── Kaynak: KATALOG URUNU ──────────────────────────────────
  function renderUretAra(q, hits, yukleniyor) {
    var b = $('anKaynak');
    if (!b) return;
    b.innerHTML = ''
      // Serit KENDI dugumunde: saniyede bir tazeleniyor ve arama ekranini
      // bastan cizmek arama kutusunun odagini kaybettiriyordu.
      + '<div id="anKuyrukSerit">' + kuyrukSeridi() + '</div>'
      + '<div class="an-card">'
      + '<h3>1 · Analiz edilecek ürün</h3>'
      + '<div class="an-bar">'
      + '<input id="anProdQ" placeholder="Ürün adı, marka ya da model…" style="min-width:340px" value="' + esc(q || '') + '">'
      + '<button class="btn btn-primary" onclick="analysesProdSearch()">Ara</button>'
      + '</div>'
      + (yukleniyor ? '<p class="an-empty">Aranıyor…</p>' : '')
      + (hits && hits.length
        ? '<div class="an-grid">' + hits.map(function (p, i) {
          // ZATEN YAYINDA MI? Uretim kapisi (uretimKapisi) nasil olsa
          // reddedecek, ama bunu aramada gormek bir tikla ogrenmekten iyidir.
          var mevcut = konuCakismasi('product:' + p.id, null, true);
          return ''
            + '<div class="an-row' + (p.imageUrl ? '' : ' noimg') + '">'
            + (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '')
            + '<div><h4>' + esc(p.name || '') + '</h4>'
            + '<div class="an-meta">'
            + (p.brand ? '<span>' + esc(p.brand) + '</span>' : '')
            + (p.category ? '<span>' + esc(p.category) + '</span>' : '')
            + (p.techScore ? '<span>Qor AI <b>' + num(p.techScore) + '</b>/100</span>' : '')
            + (mevcut ? '<span class="an-var">Yayında analizi var</span>' : '')
            + '</div></div>'
            + (mevcut
              ? '<button class="btn btn-ghost" onclick="analysesEdit(&quot;' + mevcut.id + '&quot;)">Mevcudu aç</button>'
              : '<button class="btn btn-primary" onclick="analysesPickProduct(' + i + ')">Seç</button> '
                + '<button class="btn btn-ghost" onclick="analysesKuyrugaEkle(' + i + ')"'
                + (kuyruktaVar(p.id) ? ' disabled>Kuyrukta' : '>+ Kuyruk') + '</button>')
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

  // ── Kaynak: LINK ───────────────────────────────────────────
  function renderLinkGiris(hata) {
    var b = $('anKaynak');
    if (!b) return;
    b.innerHTML = ''
      + '<div class="an-card">'
      + '<h3>1 · Ürün linkleri</h3>'
      + '<div class="an-f"><label>Her satıra bir link (en fazla 4)</label>'
      + '<textarea id="anLinks" rows="4" placeholder="https://www.amazon.com.tr/dp/…&#10;https://www.trendyol.com/…"></textarea></div>'
      + (hata ? '<p class="an-err">' + esc(hata) + '</p>' : '')
      + '<button class="btn btn-primary" onclick="analysesLinkBasla()">Linkleri tanı</button>'
      + '<div class="an-hint">Tek link → tekil analiz. İki ve üzeri → karşılaştırma. '
      + 'Linki tanıma, quiz ve rapor <strong>sitedeki Link Analizi ile aynı motoru</strong> kullanır.</div>'
      + '</div>';
    var el = $('anLinks');
    if (el) el.focus();
  }

  async function analysesLinkBasla() {
    var ham = ($('anLinks') || {}).value || '';
    var urls = ham.split(/\s+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return /^https?:\/\//i.test(x); }).slice(0, 4);
    if (!urls.length) { renderLinkGiris('En az bir geçerli link gir (http/https).'); return; }
    var b = $('anKaynak');
    b.innerHTML = '<div class="an-card"><h3>1 · Linkler tanınıyor</h3>'
      + '<p class="an-empty">' + urls.length + ' link inceleniyor…</p></div>';
    try {
      var hepsi = await QorAiRun.analyzeLinks(urls, 'tr');
      // Urun OLMAYAN adresi analize sokma: motorun kendi kapisi bunu
      // `isProduct:false` ile bildiriyor (sitede de ayni kapi var). Icerde
      // birakmak, YouTube linkini urunmus gibi puanlamak demek.
      var bases = hepsi.filter(function (x) { return x.isProduct !== false; });
      if (!bases.length) {
        renderLinkGiris('Bu adres(ler) satın alınabilir bir ürüne benzemiyor.');
        return;
      }
      if (bases.length < hepsi.length) {
        toast((hepsi.length - bases.length) + ' adres ürün değil, atlandı', 'i');
      }
      var linkEngel = uretimKapisi('link', { bases: bases });
      if (linkEngel) { renderLinkGiris(linkEngel); return; }
      var q = await QorAiRun.linkQuiz(bases, 'tr');
      if (!q.length) throw new Error('Quiz üretilemedi');
      // KATALOG ESLESMESI burada aranir: kayit kurulurken (kayitKur) async
      // cagri yapilamiyor. Eslesirse analiz sayfasi urun sayfasina ic link
      // verir; eslesme zayifsa null doner ve link yazilmaz.
      var katalog = null;
      if (bases.length === 1 && bases[0] && bases[0].title) {
        try {
          katalog = await QorAiLink.findCatalogMatch(bases[0].title, {
            searchProducts: QorAiRun.searchProducts,
          });
        } catch (_) { katalog = null; }
      }
      _run = yeniRun('link', { bases: bases, katalog: katalog }, q);
      renderQuiz();
    } catch (e) {
      renderLinkGiris('Tanınamadı: ' + (e.message || e));
    }
  }

  // ── Kaynak: ABONELIK ───────────────────────────────────────
  //
  //  ESKI HALI tek satirlik "virgulle ayir (en fazla 4)" kutusuydu ve uc seyi
  //  birden kaybediyordu: logo yok, yazim hatasi yakalanmiyor, "ayni tur"
  //  kurali yalniz BILINEN servislerde calisiyordu (yanlis yazilan ad
  //  `subscriptionCategory` icin null doner, null'lar elenir, karsilastirma
  //  gecerli sayilirdi).
  //
  //  YENI HALI sitedeki secicinin (pages/Subscriptions.jsx) admin karsiligi —
  //  ama KATEGORI ONCE. Sitede duz bir izgara var ve karisik secim ancak
  //  analiz aninda hata mesajiyla reddediliyor; burada kategori sekmesi
  //  seciliyor, ilk servis secildigi anda oteki sekmeler KILITLENIYOR. Kural
  //  ayni kural, ama yapisal — reddedilecek bir secim hic kurulamiyor.
  //
  //  Servis listesi elle yazilmadi: QorAiLink.subscriptionCatalog() SUB_CATEGORY
  //  + SUB_DISPLAY tablolarindan turetiyor, logolar QorSubLogos'tan geliyor.
  //  SAYI SINIRI YOK — sitede de yok.
  var _subSecili = [];
  var _subKat = 'video';
  var _subKatalog = null;

  var SUB_KAT_LABEL = {
    video: 'Video', music: 'Müzik', ai: 'Yapay zekâ', cloud: 'Bulut',
    productivity: 'Üretkenlik', hosting: 'Hosting / Site', gaming: 'Oyun',
    vpn: 'VPN', news: 'Haber', fitness: 'Fitness', education: 'Eğitim',
    bundles: 'Paket', other: 'Diğer',
  };

  function subKatalog() {
    if (_subKatalog) return _subKatalog;
    var gruplar = {};
    var sira = [];
    // AYNI LOGO = AYNI SERVIS. `subscriptionCatalog()` takma adlari GORUNEN
    // ada gore eliyor, ama ayni servisin iki farkli gorunen adi olabiliyor:
    // "HBO Max" ve "Max" ayni sey ve tabloda ayri satirlar. Elenmezse
    // kutucuklarda iki kez cikar ve ikisi birden secilirse bir servis
    // KENDISIYLE karsilastirilir. Logo dosyasi bu esligin tek nesnel
    // gostergesi (sub_logos.js zaten iki adi da ayni dosyaya bagliyor).
    var logoGorulen = {};
    (QorAiLink.subscriptionCatalog() || []).forEach(function (x) {
      var dosya = (window.QorSubLogos && window.QorSubLogos.logoFile(x.name)) || '';
      if (dosya) {
        if (logoGorulen[dosya]) return;
        logoGorulen[dosya] = true;
      }
      if (!gruplar[x.category]) { gruplar[x.category] = []; sira.push(x.category); }
      gruplar[x.category].push(x.name);
    });
    _subKatalog = { gruplar: gruplar, sira: sira };
    return _subKatalog;
  }

  // Secimin KILITLEDIGI kategori — ilk bilinen kategori. AI ile dogrulanan
  // (katalogda olmayan) servisler de kendi kategorisini tasiyor.
  function subAktifKat() {
    for (var i = 0; i < _subSecili.length; i += 1) {
      if (_subSecili[i].category) return _subSecili[i].category;
    }
    return null;
  }

  function subLogo(ad, boyut) {
    var url = (window.QorSubLogos && window.QorSubLogos.logoUrl(ad)) || '';
    if (url) {
      return '<img class="an-sub-logo" style="width:' + boyut + 'px;height:' + boyut + 'px" '
        + 'src="' + esc(url) + '" alt="" loading="lazy" onerror="this.replaceWith(Object.assign('
        + 'document.createElement(\'span\'),{className:\'an-sub-logo an-sub-mono\',textContent:'
        + JSON.stringify(String(ad || '?').slice(0, 1).toUpperCase()) + '}))">';
    }
    return '<span class="an-sub-logo an-sub-mono" style="width:' + boyut + 'px;height:' + boyut + 'px">'
      + esc(String(ad || '?').slice(0, 1).toUpperCase()) + '</span>';
  }

  function renderAbonelikGiris(hata) {
    var b = $('anKaynak');
    if (!b) return;
    var kat = subKatalog();
    var kilit = subAktifKat();
    if (kilit && _subKat !== kilit) _subKat = kilit;
    if (!kat.gruplar[_subKat]) _subKat = kat.sira[0] || 'video';
    var secili = {};
    _subSecili.forEach(function (s) { secili[s.name.toLowerCase()] = true; });
    var kutucuklar = kat.gruplar[_subKat] || [];
    window.__anSubTiles = kutucuklar;
    var n = _subSecili.length;

    b.innerHTML = ''
      + '<div class="an-card">'
      + '<h3>1 · Abonelik servisleri <em>(' + n + ' seçili)</em></h3>'

      + '<div class="an-tabbar an-tabbar-sub an-sub-kat">'
      + kat.sira.map(function (k) {
        var kapali = kilit && k !== kilit;
        return '<button class="' + (k === _subKat ? 'on' : '') + '"'
          + (kapali ? ' disabled title="Seçim ' + esc(SUB_KAT_LABEL[kilit] || kilit) + ' türüne kilitlendi"' : '')
          + ' onclick="analysesSubKat(\'' + k + '\')">' + esc(SUB_KAT_LABEL[k] || k) + '</button>';
      }).join('')
      + '</div>'

      + '<div class="an-sub-grid">'
      + kutucuklar.map(function (ad, i) {
        var on = secili[ad.toLowerCase()];
        return '<button type="button" class="an-sub-tile' + (on ? ' on' : '') + '"'
          + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
          + ' onclick="analysesSubTogla(' + i + ')" title="' + esc(ad) + '">'
          + subLogo(ad, 34)
          + '<span class="an-sub-name">' + esc(ad) + '</span>'
          + (on ? '<span class="an-sub-tick" aria-hidden="true">✓</span>' : '')
          + '</button>';
      }).join('')
      + '</div>'

      + '<div class="an-sub-add">'
      + '<input id="anSubAdd" placeholder="Listede yok mu? Servis adını yaz (ör. Ubisoft+)">'
      + '<button class="btn" id="anSubAddBtn" onclick="analysesSubEkle()">Ekle</button>'
      + '</div>'
      + '<p class="an-hint">Listede olmayan bir ad AI ile doğrulanır — gerçekten bir abonelik '
      + 'servisi mi ve hangi türden, oradan gelir. Sitedeki “ekle” kutusunun aynısı.</p>'

      + (n
        ? '<div class="an-chips an-chips-lg">'
          + _subSecili.map(function (s, i) {
            return '<span class="an-chip">' + subLogo(s.name, 20) + esc(s.name)
              + '<button onclick="analysesSubCikar(' + i + ')" title="Çıkar">×</button></span>';
          }).join('')
          + '</div>'
        : '')

      + (hata ? '<p class="an-err">' + esc(hata) + '</p>' : '')

      + (n
        ? '<div class="an-go"><button class="btn btn-primary" onclick="analysesAbonelikBasla()">'
          + (n > 1 ? n + ' servisi karşılaştır →' : 'Uyum analizi →') + '</button>'
          + '<span class="an-go-note">' + (n > 1
            ? 'Karşılaştırma raporu — hepsi <b>' + esc(SUB_KAT_LABEL[kilit] || kilit) + '</b> türünde.'
            : 'Tek servis → uyum analizi. İkincisini eklersen karşılaştırmaya döner.')
          + '</span></div>'
        : '<p class="an-hint">Başlamak için en az bir servis seç.</p>')
      + '</div>';

    var el = $('anSubAdd');
    if (el) el.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); analysesSubEkle(); } };
  }

  function analysesSubKat(k) {
    if (subAktifKat() && k !== subAktifKat()) return;
    _subKat = k;
    renderAbonelikGiris();
  }

  function analysesSubTogla(i) {
    var ad = (window.__anSubTiles || [])[i];
    if (!ad) return;
    var yer = -1;
    for (var j = 0; j < _subSecili.length; j += 1) {
      if (_subSecili[j].name.toLowerCase() === ad.toLowerCase()) { yer = j; break; }
    }
    if (yer >= 0) _subSecili.splice(yer, 1);
    else _subSecili.push({ name: ad, category: QorAiLink.subscriptionCategory(ad) || _subKat });
    renderAbonelikGiris();
  }

  function analysesSubCikar(i) {
    _subSecili.splice(i, 1);
    renderAbonelikGiris();
  }

  // Katalogda olmayan servis — sitedeki "ekle" kutusuyla AYNI dogrulayici
  // (QorAiLink.validateSubscriptionInput): bilinen ad yerel cozulur, bilinmeyen
  // ad AI'ya sorulur ("bu bir abonelik servisi mi, hangi turden").
  async function analysesSubEkle() {
    var el = $('anSubAdd');
    var btn = $('anSubAddBtn');
    var ham = el ? String(el.value || '').trim() : '';
    if (!ham) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Kontrol ediliyor…'; }
    try {
      var res = await QorAiLink.validateSubscriptionInput(
        ham,
        _subSecili.map(function (s) { return s.name; }),
        'tr',
        subAktifKat() || ''
      );
      if (res.error) { renderAbonelikGiris(res.error); return; }
      var kilit = subAktifKat();
      if (kilit && res.category && res.category !== kilit) {
        renderAbonelikGiris('“' + res.displayName + '” ' + (SUB_KAT_LABEL[res.category] || res.category)
          + ' türünde; seçim ' + (SUB_KAT_LABEL[kilit] || kilit) + ' türüne kilitli.');
        return;
      }
      _subSecili.push({ name: res.displayName, category: res.category || null });
      renderAbonelikGiris();
    } catch (e) {
      renderAbonelikGiris('Doğrulanamadı: ' + (e && e.message ? e.message : e));
    }
  }

  async function analysesAbonelikBasla() {
    var names = _subSecili.map(function (s) { return s.name; }).filter(Boolean);
    if (!names.length) { renderAbonelikGiris('En az bir servis seç.'); return; }
    // SON KAPI. Ekleme aninda zaten engelleniyor; bu, kategorisi bilinmeyen
    // (AI'nin null dondurdugu) bir servisin araya karismasina karsi.
    if (names.length > 1 && QorAiLink.subscriptionsMixCategories(names)) {
      renderAbonelikGiris('Servisler aynı türden olmalı (ör. hepsi video ya da hepsi müzik).');
      return;
    }
    var subEngel = uretimKapisi('subscription', { names: names });
    if (subEngel) { renderAbonelikGiris(subEngel); return; }
    var b = $('anKaynak');
    b.innerHTML = '<div class="an-card"><h3>1 · Quiz hazırlanıyor</h3>'
      + '<p class="an-empty">' + esc(names.join(' · ')) + '</p></div>';
    try {
      var q = await QorAiRun.subscriptionQuiz(names, 'tr');
      if (!q.length) throw new Error('Quiz üretilemedi');
      _run = yeniRun('subscription', { names: names }, q);
      renderQuiz();
    } catch (e) {
      renderAbonelikGiris('Başlatılamadı: ' + (e.message || e));
    }
  }

  // ADIM SERIDI TURE GORE KURULUR — SABIT INDEKSLE DEGIL ANAHTARLA.
  //
  // Urun analizinde quiz 2026-09-01'de kaldirildi (bkz. quizGerekli) ama serit
  // hala "2. Quiz / sorulari yanitla" yaziyordu: ekran var olmayan bir adimi
  // vaat ediyor, "3. Rapor" da hicbir zaman ucuncu adim olmuyordu. Sabit
  // indeks (adimlar(2)) kaldirilan adimda kayar; anahtar kaymaz.
  var ADIM_AD = {
    kaynak: ['Kaynak', 'ürün · karşılaştırma · link · abonelik'],
    quiz: ['Quiz', 'soruları yanıtla'],
    rapor: ['Rapor', 'TR + EN üret'],
    yayin: ['Yayın', 'önizle ve yayınla'],
  };

  function adimSirasi(kind) {
    var tur = kind || (_run && _run.kind) || _uretTur;
    return tur === 'product'
      ? ['kaynak', 'rapor', 'yayin']
      : ['kaynak', 'quiz', 'rapor', 'yayin'];
  }

  function adimNo(anahtar, kind) { return adimSirasi(kind).indexOf(anahtar) + 1; }

  function adimlar(anahtar, kind) {
    var sira = adimSirasi(kind);
    var i = sira.indexOf(anahtar);
    return '<div class="an-steps">' + sira.map(function (k, n) {
      var cls = i >= 0 && n < i ? 'done' : (k === anahtar ? 'on' : '');
      return '<div class="an-step ' + cls + '">' + (n + 1) + '. ' + ADIM_AD[k][0]
        + '<em>' + ADIM_AD[k][1] + '</em></div>';
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
    var b = $('anKaynak');
    var engel = uretimKapisi('product', { product: hit });
    if (engel) { toast(engel, 'e'); return; }
    b.innerHTML = '<div class="an-card"><h3>1 · Hazırlanıyor</h3>'
      + '<p class="an-empty">Ürün yükleniyor…</p></div>';
    try {
      // Quiz ve rapor TAM PB kaydindan uretilir: Typesense dokumaninda
      // specSections yok, oysa prompt'un tasidigi en degerli baglam o.
      var product = await QorAiRun.loadProduct(hit.id);
      // Urun analizinde quiz adimi YOK: dogrudan rapora gecilir.
      _run = yeniRun('product', { product: product }, []);
      analysesRunReport();
    } catch (e) {
      b.innerHTML = '<div class="an-card"><h3>Başlatılamadı</h3>'
        + '<p class="an-err">' + esc(e.message || e) + '</p>'
        + '<button class="btn btn-primary" onclick="analysesPickProduct(' + i + ')">Tekrar dene</button> '
        + '<button class="btn btn-ghost" onclick="analysesUretTur(\'product\')">Başka ürün</button></div>';
    }
  }

  /**
   * URETIME BASLAMADAN ONCEKI MUKERRER KAPISI.
   *
   * Yayin aninda da bir kapi var (kaydet -> konuCakismasi) ama orada is
   * bitmis oluyor: iki dilde arastirma + rapor + meta, yani onlarca AI
   * cagrisi ve dakikalar. Ayni konunun ikinci analizini URETMEDEN once
   * soylemek hem kotayi hem zamani koruyor.
   *
   * Taslak da uyarir ama ENGELLEMEZ: yarim kalmis bir taslagi yeniden
   * uretmek mesru bir is. Engel yalnizca YAYINDA olan icin.
   */
  function uretimKapisi(kind, kaynak) {
    var anahtar = runKonuAnahtari(kind, kaynak);
    var yayinda = konuCakismasi(anahtar, null, true);
    if (yayinda) {
      return 'Bu konunun yayında analizi zaten var: “' + (subjectOf(yayinda) || yayinda.slug)
        + '”. Yeniden üretmek yerine mevcut kaydı düzenle ya da önce onu yayından kaldır.';
    }
    return '';
  }

  // Uretim durumu. `lang` HANGI DILDE oldugumuz; iki dil bagimsiz kosuyor,
  // o yuzden cevaplar ve raporlar dil basina ayri tutuluyor.
  function yeniRun(kind, kaynak, questions) {
    return Object.assign({
      kind: kind,
      lang: 'tr',
      questions: questions,
      answers: [],
      cevaplar: { tr: null, en: null },
      out: { tr: null, en: null },
      similar: null,
    }, kaynak);
  }

  // Uretim akisinin KONUSU — dort turde de tek satirlik ad.
  //
  // HATA (duzeltildi): `compare` hicbir dala girmiyordu ve son satira dusup
  // `r.bases`e bakiyordu — karsilastirmada oyle bir alan yok, yani DAIMA bos
  // dizge donuyordu. Gorunur sonucu quiz basliginin bos kalmasiydi; asil
  // zarar sessizdi: metaUret() KONUSUZ cagriliyor, yani yayin basligi ve
  // arama aciklamasi hangi urunler icin yazildigini bilmeden uretiliyordu.
  function runKonu(r) {
    if (!r) return '';
    if (r.kind === 'product') return (r.product && r.product.name) || '';
    if (r.kind === 'compare') {
      return (r.products || []).map(function (p) { return p.name; }).filter(Boolean).join(' vs ');
    }
    if (r.kind === 'subscription') return (r.names || []).join(' · ');
    return (r.bases || []).map(function (b) { return b.title; }).filter(Boolean).join(' · ');
  }

  function renderQuiz() {
    var b = $('anNewBody');
    var r = _run;
    var yanit = r.questions.filter(function (q, i) { return r.answers[i] != null; }).length;
    b.innerHTML = ''
      + adimlar('quiz', r.kind)
      + '<div class="an-note">'
      + (r.lang === 'tr'
        ? '<strong>1/2 · Türkçe quiz.</strong> Sitedeki analizin ürettiği quiz\'in aynısı. '
          + 'Bunu yanıtla, Türkçe rapor çıksın; ardından <strong>ayrı bir İngilizce quiz</strong> gelecek.'
        : '<strong>2/2 · İngilizce quiz.</strong> Türkçe rapor hazır. Bu sorular '
          + '<strong>çeviri değil</strong>, İngilizce okuyucu için baştan üretildi — iki dil iki ayrı varyant.')
      + ' Verdiğin cevaplar uyum puanını belirler ve yayınlanan sayfada <strong>en üstte</strong> görünür.</div>'
      + '<div class="an-card">'
      + '<h3 id="anQuizHead">2 · ' + (r.lang === 'tr' ? 'TR' : 'EN') + ' · ' + esc(runKonu(r)) + ' · ' + yanit + '/' + r.questions.length + ' yanıtlandı</h3>'
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
      + (yanit < r.questions.length
        ? 'Tüm soruları yanıtla'
        : (r.lang === 'tr' ? 'Türkçe raporu üret' : 'İngilizce raporu üret ve bitir')) + '</button>'
      + '<button class="btn btn-ghost" onclick="analysesUretTur(\'' + r.kind + '\')">Vazgeç</button>'
      + (r.lang === 'en'
        ? '<span class="an-hint" style="align-self:center;margin:0">Türkçe rapor hazır — vazgeçersen o da gider.</span>'
        : '')
      + '</div>'
      + '<p class="an-hint">Her dil kendi araştırmasını ve raporunu üretir; '
      + 'toplam 2 quiz + 4 rapor çağrısı + yayın metası. Bu sekmeyi kapatma.</p>'
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
    if (baslik) {
      baslik.textContent = '2 · ' + (_run.lang === 'tr' ? 'TR' : 'EN') + ' · ' + runKonu(_run)
        + ' · ' + yanit + '/' + _run.questions.length + ' yanıtlandı';
    }
    var btn = $('anQuizGo');
    if (btn) {
      var tam = yanit === _run.questions.length;
      btn.disabled = !tam;
      btn.textContent = tam
        ? (_run.lang === 'tr' ? 'Türkçe raporu üret' : 'İngilizce raporu üret ve bitir')
        : 'Tüm soruları yanıtla';
    }
  }

  // ── 3) Rapor üret — HER DIL KENDI QUIZI ILE ────────────────
  //
  //  ONCEKI SURUM: quiz BIR KEZ Turkce yanitlaniyor, ayni cevaplar cevrilip
  //  Ingilizce rapora veriliyordu. Iki sorunu vardi:
  //   1. Cevap dizesi Ingilizce rapora OLDUGU GIBI kopyalaniyordu (olculdu:
  //      6/6). Ceviri adimi bunu kapatti ama ustune bir AI cagrisi ekledi.
  //   2. Daha onemlisi: Turkce quizin sorulari Turkce kullanicinin
  //      onceliklerine gore kuruluyor. Ayni sorulari cevirip Ingilizce rapora
  //      vermek, Ingilizce sayfaya BASKA BIRININ oncelikleriyle yazilmis bir
  //      analiz koymak demekti.
  //
  //  SIMDI: iki dil BAGIMSIZ. Once Turkce quiz + Turkce rapor, sonra
  //  Ingilizce quiz (bastan uretilir) + Ingilizce rapor. Iki ayri varyant.
  // Karsilastirmada her urun KENDI AI cagrisini aliyor (bkz. qor_ai_run.js ->
  // runCompareReport) ve ustune bir hukum cagrisi geliyor. Tek satirlik
  // "rapor" cubugu 12 urunluk bir kosuda on dakika kimildamadan duruyordu;
  // sayac isin nerede oldugunu gosteriyor.
  var _cmpIlerleme = null;

  function dilAdimlari(lang, kind) {
    var ad = lang === 'tr' ? 'Türkçe' : 'İngilizce';
    var raporAd = ad + ' · rapor';
    if (kind === 'compare') {
      raporAd = ad + ' · ürün raporları'
        + (_cmpIlerleme ? ' (' + _cmpIlerleme.done + '/' + _cmpIlerleme.total + ')' : '');
      return [
        [lang + '-research', ad + ' · web araştırması'],
        [lang + '-report', raporAd],
        [lang + '-verdict', ad + ' · karşılaştırma hükmü'],
        [lang + '-sentiment', ad + ' · paragraf değerlendirmesi'],
      ];
    }
    return [
      [lang + '-research', ad + ' · web araştırması'],
      [lang + '-report', raporAd],
      // Paragraf renkleri ayrı bir adım: rapor modeli değil adanmış
      // sınıflandırıcı üretiyor (bkz. attachParagraphSentiment).
      [lang + '-sentiment', ad + ' · paragraf değerlendirmesi'],
    ];
  }

  /**
   * ILERLEME LISTESI — QUIZLI VE QUIZSIZ TUR AYNI SEY DEGIL.
   *
   * QUIZLI turlerde (karsilastirma / link / abonelik) akis kullanicinin
   * cevabinda DURUYOR, dolayisiyla liste yalnizca icinde bulunulan dili
   * gosterir; ikinci dil ayri bir quiz ekranindan sonra baslar.
   *
   * URUNDE quiz yok: TR ve EN pes pese, ELSIZ kosuyor. Tek dilin listesini
   * gostermek ilerlemeyi iki kez sifirdan basliyor gibi gosteriyordu (TR
   * %100'e varinca cubuk aniden %0'a doner ve is asilmis gibi durur) ve
   * kaldirilmis quiz adimini "Ingilizce quiz hazirlaniyor" diye ekrana geri
   * getiriyordu. Quizsiz turde iki dil + meta + kayit TEK listede.
   */
  function progAdimlari(lang, kind) {
    if (!quizKind(kind)) {
      return dilAdimlari('tr', kind).concat(dilAdimlari('en', kind)).concat(PROG_SON);
    }
    return dilAdimlari(lang, kind)
      .concat(lang === 'en' ? PROG_SON : [['next-quiz', 'İngilizce quiz hazırlanıyor']]);
  }
  var PROG_SON = [
    ['meta', 'Yayın metası ve SSS (TR + EN)'],
    ['save', 'Taslak olarak kaydediliyor'],
  ];

  // Gecen sure sayaci. Tek bir interval; her renderProgress cagrisinda
  // yeniden baglanir cunku DOM bastan yaziliyor.
  var _sureTimer = null;
  var _sureBas = 0;

  function sureBaslat() {
    sureDurdur();
    _sureBas = Date.now();
    _sureTimer = setInterval(function () {
      var el = $('anSure');
      if (!el) return;
      var sn = Math.floor((Date.now() - _sureBas) / 1000);
      el.textContent = sn < 60 ? sn + ' sn' : Math.floor(sn / 60) + ' dk ' + (sn % 60) + ' sn';
    }, 1000);
  }

  function sureDurdur() {
    if (_sureTimer) { clearInterval(_sureTimer); _sureTimer = null; }
  }

  // AI KOTASI DOLUNCA BEKLIYORUZ, ASILMIYORUZ. Proxy kullanici basina
  // 60 istek / 5 dk veriyor (pb_hooks/gemini.pb.js) ve 12 urunluk bir
  // karsilastirma iki dilde bu tavani zorluyor. Motor artik bekleyip tekrar
  // deniyor; kullanici ekranda bunu GORMEZSE "sistem cokmus" saniyor.
  var _kotaBeklemeSn = 0;
  var _kotaTimer = null;
  function kotaBildir(saniye) {
    _kotaBeklemeSn = Math.max(1, Number(saniye) || 0);
    var el = $('anKota');
    if (el) el.textContent = 'AI kotası doldu — ' + _kotaBeklemeSn + ' sn bekleniyor…';
    if (_kotaTimer) clearInterval(_kotaTimer);
    _kotaTimer = setInterval(function () {
      _kotaBeklemeSn -= 1;
      var e2 = $('anKota');
      if (_kotaBeklemeSn <= 0) {
        clearInterval(_kotaTimer); _kotaTimer = null;
        if (e2) e2.textContent = '';
        return;
      }
      if (e2) e2.textContent = 'AI kotası doldu — ' + _kotaBeklemeSn + ' sn bekleniyor…';
    }, 1000);
  }

  // `run` ACIKCA GECILIR, global `_run`a guvenilmez: baska bir bolume girip
  // cikmak `_run`u sifirliyor (loadAnalysesAdmin) ve kuyruk kosarken ilerleme
  // ekrani bos bir kosuyu cizmeye calisiyordu.
  function renderProgress(durum, hata, run) {
    // Serit renderProgress'ten SONRA yeniden basilir (bkz. fonksiyon sonu).
    var b = $('anNewBody');
    if (!b) return;
    var r = run || _run;
    var lang = r ? r.lang : 'tr';
    var kind = r ? r.kind : '';
    var liste = progAdimlari(lang, kind);
    var biten = liste.filter(function (p) { return durum[p[0]] === 'done'; }).length;
    var yuzde = Math.round((biten / Math.max(1, liste.length)) * 100);
    b.innerHTML = adimlar('rapor', kind)
      + '<div class="an-card"><h3>' + adimNo('rapor', kind) + ' · '
      // Quizsiz turde liste iki dili birden gosteriyor; basliga tek bir dil
      // yazmak o listeyle celisirdi.
      + (quizKind(kind) ? (lang === 'tr' ? 'Türkçe' : 'İngilizce') + ' rapor üretiliyor' : 'Rapor üretiliyor')
      + ' · ' + esc(runKonu(r)) + '</h3>'
      // Rapor 1-3 dakika surebiliyor. Sabit bir liste "asildi mi" sorusunu
      // yanitlamiyor; cubuk + donen gosterge + sayan sure isin YASADIGINI
      // gosteriyor.
      + '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + yuzde + '%"></div></div>'
      + '<div class="an-prog">'
      + liste.map(function (p) {
        var st = durum[p[0]] || '';
        var ic = st === 'done' ? '<i>✓</i>'
          : st === 'run' ? '<i class="an-spin" aria-hidden="true"></i>'
            : st === 'fail' ? '<i>✕</i>' : '<i>·</i>';
        return '<div class="' + (st === 'run' ? 'on' : st === 'done' ? 'done' : st === 'fail' ? 'fail' : '') + '">'
          + ic + esc(p[1])
          + (st === 'run' ? '<b id="anSure" class="an-sure"></b>' : '')
          + '</div>';
      }).join('')
      + '</div>'
      + (hata
        ? '<p class="an-err">' + esc(hata) + '</p>'
          + '<button class="btn btn-primary" onclick="analysesRunReport()">Tekrar dene</button> '
          // "Quiz'e don" YALNIZ quizli turde. Urunde quiz ekrani yok; buton
          // bos bir quiz cizip akisi orada tikiyordu.
          + (quizKind(kind)
            ? '<button class="btn btn-ghost" onclick="analysesBackToQuiz()">Quiz\'e dön</button>'
            : '<button class="btn btn-ghost" onclick="analysesUretTur(\'product\')">Vazgeç</button>')
        : '<p class="an-hint">Araştırma adımı başarısız olursa rapor yine üretilir — sadece "kanıt zayıf" olarak işaretlenir.</p>')
      + '<p id="anKota" class="an-kota"></p>'
      + '</div>';
    if (hata) sureDurdur();
    else if ($('anSure')) { if (!_sureTimer) sureBaslat(); }
    else sureDurdur();
    // KUYRUK SERIDI GERI KONUR. Bu fonksiyon `anNewBody`yi bastan yaziyor,
    // yani serit her ilerleme adiminda siliniyordu; kuyruk kosarken hangi
    // urunde oldugumuz hicbir yerde gorunmuyordu.
    kuyrukSeritYaz();
  }

  function analysesBackToQuiz() { if (_run) renderQuiz(); }

  /* Tek dilde rapor — TUR fark eder, gerisi ayni.
     `arastirma` ve `taban` IKINCI DILDE dolu gelir:
       arastirma  ilk dilin grounded arama ciktisi — TEKRAR ARANMAZ
       taban      ilk dilin raporu — ikinci dil olgu uretmez, cevirir
     Ikisinin de gerekcesi qor_ai_prompts.js -> mirrorFactsBlock basliginda. */
  function raporUret(r, lang, answers, similar, onStage) {
    var arastirma = lang !== 'tr' ? (r.research || '') : '';
    var taban = lang !== 'tr' ? (r.out.tr || null) : null;
    if (r.kind === 'product') {
      return QorAiRun.runProductReport({
        product: r.product, lang: lang, answers: answers, similar: similar, onStage: onStage,
        research: arastirma, baseReport: taban,
      });
    }
    if (r.kind === 'compare') {
      return QorAiRun.runCompareReport({
        products: r.products, lang: lang, answers: answers, onStage: onStage,
        research: arastirma,
      });
    }
    if (r.kind === 'subscription') {
      return QorAiRun.runSubscriptionReport({ names: r.names, lang: lang, answers: answers, onStage: onStage });
    }
    return QorAiRun.runLinkReport({ bases: r.bases, lang: lang, answers: answers, onStage: onStage });
  }

  // URUN ANALIZINDE QUIZ YOK (2026-09-01).
  //
  // Quizi adminde BIZ cozuyorduk ve yayinlanan sayfa "bu analiz su cevaplara
  // gore yapildi" + tek bir uyum hukmu gosteriyordu. O cevaplari okuyucu
  // vermedi: 1440p isteyene de istemeyene de ayni "orta uyum" cikiyordu.
  // Artik urun raporu kategoriden DETERMINISTIK turemis degerlendirme
  // eksenine gore yaziliyor (qor_ai_prompts.js -> evaluationAxisBlock) ve
  // hukum kullanim profili basina veriliyor.
  //
  // Yan kazanc: dil basina bir quiz uretimi cagrisi ortadan kalkti.
  //
  // Link / abonelik / karsilastirma akislarina DOKUNULMADI — onlarin quizi
  // konuyu daraltmak icin gerekli (hangi abonelik, hangi kullanim).
  // Ture gore soru: `quizKind` kayit olmadan da cevaplanabilir (ilerleme
  // listesi ve adim seridi kosunun kendisinden ONCE ciziliyor).
  function quizKind(kind) { return kind !== 'product'; }
  function quizGerekli(r) { return quizKind(r && r.kind); }

  // -- URUN KUYRUGU -----------------------------------------------------
  //
  // Faz 1'de quiz kalkinca urun analizi bastan sona ELSIZ bir akis oldu:
  // arastirma -> TR rapor -> EN rapor -> meta -> taslak. Geriye kalan tek
  // el emegi her urun icin tek tek "Sec"e basmakti. Kuyruk bunu kaldirir:
  // 10 urun sec, sirayla kendi kendine uretsin.
  //
  // PARALEL DEGIL, SIRAYLA. Gerekcesi qor_ai_run.js'te yazili: karsilastirma
  // eszamanliligi 5'ten 2'ye dusuruldu cunku "bes paralel istek kota
  // penceresini bir anda tuketip 429 dalgasi uretiyordu". Her biri kendi
  // icinde arastirma + rapor cagrisi yapan 4 paralel ANALIZ ayni duvara daha
  // sert carpardi. Sirali kuyruk ayni kazanci (elsiz uretim) risksiz verir.
  //
  // BIR URUN PATLARSA KUYRUK DURMAZ: hata kaydedilir, sonrakine gecilir.
  // Yarim kalan on dakikalik kosuyu tek bir 429 yuzunden komple kaybetmek
  // kuyrugun butun amacini bosa cikarirdi.
  var _kuyruk = [];
  var _kuyrukAktif = false;
  var _kuyrukLog = [];
  var _kuyrukSuren = '';   // su an uretilen urunun adi
  var _kuyrukToplam = 0;   // kuyruk baslarkenki adet
  var _kuyrukAdim = '';    // suren urunun O ANKI adimi (arastirma / rapor / kayit)
  var _kuyrukBas = 0;      // suren urunun baslama zamani — gecen sure icin
  var _kuyrukTik = null;   // saniyede bir seridi tazeleyen sayac
  var _kuyrukDur = false;  // "sirasi gelince dur" istegi

  // GECEN SURE, saniye cinsinden okunur bicimde.
  function sureMetni(ms) {
    var sn = Math.max(0, Math.floor(ms / 1000));
    return sn < 60 ? sn + ' sn' : Math.floor(sn / 60) + ' dk ' + (sn % 60) + ' sn';
  }

  function kuyruktaVar(id) {
    return _kuyruk.some(function (x) { return x.id === id; });
  }

  function analysesKuyrugaEkle(i) {
    var hit = (window.__anHits || [])[i];
    if (!hit || kuyruktaVar(hit.id)) return;
    var engel = uretimKapisi('product', { product: hit });
    if (engel) { toast(engel, 'e'); return; }
    _kuyruk.push({ id: hit.id, name: hit.name || '' });
    renderUretAra(($('anProdQ') || {}).value || '', window.__anHits);
  }

  function analysesKuyruktanCikar(id) {
    _kuyruk = _kuyruk.filter(function (x) { return x.id !== id; });
    renderUretAra(($('anProdQ') || {}).value || '', window.__anHits);
  }

  function analysesKuyrukTemizle() {
    _kuyruk = [];
    _kuyrukLog = [];
    renderUretAra(($('anProdQ') || {}).value || '', window.__anHits);
  }

  /**
   * KUYRUK SERIDI — CANLI DURUM, TEK BAKISTA.
   *
   * Onceki surumde uc ayri sey eksikti ve ucu de "sistem calisiyor mu"
   * sorusunu cevapsiz birakiyordu:
   *
   *  1. SUREN URUN LISTEDE DE DURUYORDU. `_kuyruk.shift()` ancak urun BITINCE
   *     kosuyor, dolayisiyla su an uretilen urun hem "Uretiliyor:" satirinda
   *     hem bekleyenler seridinde 1. sirada yesil duruyordu — ekranda ayni
   *     urun iki kez, ikisi de "bekliyor" gibi.
   *  2. HANGI ADIMDA OLDUGU GORUNMUYORDU. Yalnizca ad yaziyordu; bir urun
   *     3-5 dakika suruyor ve o sure boyunca ekran hic degismiyordu.
   *  3. BITEN URUN ACILAMIYORDU. Log satiri duz metindi; taslak kaydedilmis
   *     olmasina ragmen gormek icin kuyrugun bitmesini beklemek gerekiyordu.
   */
  function kuyrukSeridi() {
    if (!_kuyruk.length && !_kuyrukLog.length && !_kuyrukSuren) return '';
    var biten = _kuyrukLog.length;
    var toplam = _kuyrukToplam || (_kuyruk.length + biten);
    // Suren urun de "tamamlandi" sayilmaz ama cubukta yarim adim yer tutar;
    // yoksa tek urunluk kuyrukta cubuk bastan sona %0 kaliyordu.
    var ilerleme = _kuyrukAktif ? biten + 0.5 : biten;
    var yuzde = toplam ? Math.round((ilerleme / toplam) * 100) : 0;

    // BEKLEYENLER: kosarken ilk siradaki ZATEN uretiliyor, listeden dusulur.
    var bekleyen = _kuyrukAktif ? _kuyruk.slice(1) : _kuyruk;
    var sira = bekleyen.map(function (x, i) {
      return '<span class="an-var">' + (biten + (_kuyrukAktif ? 2 : 1) + i) + '. ' + esc(x.name || x.id)
        + (_kuyrukAktif ? '' : ' <a href="#" onclick="analysesKuyruktanCikar(&quot;' + x.id
          + '&quot;);return false" style="text-decoration:none">&times;</a>')
        + '</span>';
    }).join(' ');

    // BITENLER: basarili olan ANINDA acilabilir — taslak zaten kayitli.
    var log = _kuyrukLog.map(function (l, i) {
      return '<div class="an-meta" style="justify-content:flex-start">'
        + '<span>' + (i + 1) + '. ' + (l.ok ? '&#10003;' : '&#10007;') + ' ' + esc(l.name) + '</span>'
        + (l.sure ? '<span>' + esc(sureMetni(l.sure)) + '</span>' : '')
        + (l.err ? '<span class="an-pill warn">' + esc(l.err) + '</span>' : '')
        + (l.ok && l.id
          ? '<button class="btn btn-ghost btn-xs" onclick="analysesEdit(&quot;' + l.id + '&quot;)">Aç</button>'
            + '<a class="btn btn-ghost btn-xs" target="_blank" rel="noopener" href="'
            + esc(SITE + '/tr/analiz/' + encodeURIComponent(l.slug || '') + '?id=' + encodeURIComponent(l.id))
            + '">Önizle</a>'
          : '')
        + '</div>';
    }).join('');

    return '<div class="an-card">'
      + '<h3>Kuyruk &middot; ' + biten + '/' + toplam + ' tamamlandı</h3>'
      + (_kuyrukAktif
        ? '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + yuzde + '%"></div></div>'
          + '<div class="an-meta" style="justify-content:flex-start;margin-bottom:6px">'
          + '<span><i class="an-spin" aria-hidden="true"></i> <strong>' + (biten + 1) + '. '
          + esc(_kuyrukSuren || '-') + '</strong></span>'
          + '<span>' + esc(_kuyrukAdim || 'hazırlanıyor') + '</span>'
          + '<span>' + esc(_kuyrukBas ? sureMetni(Date.now() - _kuyrukBas) : '') + '</span>'
          + '</div>'
          + '<p class="an-hint">Bu sekmeyi açık bırak — <strong>başka bölüme geçsen de iş sürer</strong>'
          + (_kuyrukDur ? '. <strong>Bu ürün bitince duracak.</strong>' : '.') + '</p>'
        : '')
      + (sira ? '<div class="an-meta" style="flex-wrap:wrap;gap:6px">' + sira + '</div>' : '')
      + (log ? '<div style="margin-top:10px">' + log + '</div>' : '')
      + '<div class="an-bar" style="margin-top:10px">'
      + (_kuyrukAktif
        ? (_kuyrukDur
          ? '<button class="btn btn-ghost" onclick="analysesKuyrukDurdurIptal()">Durdurmaktan vazgeç</button>'
          : '<button class="btn btn-ghost" onclick="analysesKuyrukDurdur()">Bu ürün bitince dur</button>')
        : (_kuyruk.length
          ? '<button class="btn btn-primary" onclick="analysesKuyrukBasla()">Kuyruğu başlat (' + _kuyruk.length + ')</button> '
          : '')
          + '<button class="btn btn-ghost" onclick="analysesKuyrukTemizle()">Temizle</button>')
      + '</div></div>';
  }

  // Serit YALNIZCA kendi dugumunu tazeler. Onceden `renderUretAra` cagriliyordu:
  // butun arama ekrani yeniden ciziliyor, arama kutusu odagi ve imleci basa
  // doneyordu — saniyede bir tazelenen bir seritte kullanilamaz.
  function kuyrukSeritYaz() {
    var mevcut = $('anKuyrukSerit');
    if (mevcut) { mevcut.innerHTML = kuyrukSeridi(); return; }
    var b = $('anNewBody') || $('analysesAdminRoot');
    if (!b) return;
    b.insertAdjacentHTML('afterbegin', '<div id="anKuyrukSerit">' + kuyrukSeridi() + '</div>');
  }

  function kuyrukTikBasla() {
    if (_kuyrukTik) return;
    _kuyrukTik = setInterval(kuyrukSeritYaz, 1000);
  }

  function kuyrukTikDurdur() {
    if (_kuyrukTik) { clearInterval(_kuyrukTik); _kuyrukTik = null; }
  }

  // Adim adi seride yazilir; renderProgress'teki `mark` bunu besler.
  function kuyrukAdim(ad) {
    if (!_kuyrukAktif) return;
    _kuyrukAdim = ad || '';
    kuyrukSeritYaz();
  }

  function analysesKuyrukDurdur() { _kuyrukDur = true; kuyrukSeritYaz(); }
  function analysesKuyrukDurdurIptal() { _kuyrukDur = false; kuyrukSeritYaz(); }

  async function analysesKuyrukBasla() {
    if (_kuyrukAktif || !_kuyruk.length) return;
    _kuyrukAktif = true;
    _kuyrukDur = false;
    _kuyrukLog = [];
    _kuyrukToplam = _kuyruk.length;
    kuyrukTikBasla();
    while (_kuyruk.length) {
      var isim = _kuyruk[0].name || _kuyruk[0].id;
      _kuyrukSuren = isim;
      _kuyrukAdim = 'hazırlanıyor';
      _kuyrukBas = Date.now();
      kuyrukSeritYaz();
      var bas = Date.now();
      try {
        // COZUM DEGERI KAYITTIR: biten urun ANINDA acilabilsin diye id/slug
        // seride yaziliyor (bkz. kuyrukSeridi -> "Aç" / "Önizle").
        var kayit = await kuyrukTekUrun(_kuyruk[0]);
        _kuyrukLog.push({
          ok: true, name: isim, sure: Date.now() - bas,
          id: kayit && kayit.id, slug: kayit && kayit.slug,
        });
      } catch (e) {
        // TEK URUN PATLARSA KUYRUK SURER.
        _kuyrukLog.push({ ok: false, name: isim, sure: Date.now() - bas, err: e.message || String(e) });
      }
      _kuyruk.shift();
      _kuyrukAdim = '';
      kuyrukSeritYaz();
      // "Bu urun bitince dur": yarim kalan bir kosuyu KESMEZ, siradakine
      // gecmez. Kalanlar kuyrukta durur, tekrar baslatilabilir.
      if (_kuyrukDur) break;
    }
    _kuyrukAktif = false;
    _kuyrukSuren = '';
    _kuyrukAdim = '';
    _kuyrukBas = 0;
    kuyrukTikDurdur();
    _run = null;
    var basarili = _kuyrukLog.filter(function (l) { return l.ok; }).length;
    var hatali = _kuyrukLog.length - basarili;
    toast((_kuyrukDur ? 'Kuyruk durduruldu: ' : 'Kuyruk bitti: ')
      + basarili + ' üretildi, ' + hatali + ' hata', 'i');
    _kuyrukDur = false;
    // Ekran baska bir bolume gecmis olabilir.
    if ($('anNewBody')) {
      analysesUretTur('product');
    } else if ($('analysesAdminRoot')) {
      // LISTEDEYIZ: yeni taslaklar listeye girsin (kaydet() `_items`e zaten
      // yazdi) ve serit "kosuyor" halinden ciksin. Bu satir olmadan serit
      // sayac durdugu icin DONMUS kaliyordu: "2/2 tamamlandi" yazarken
      // altinda hala "3. Urun B - hazirlaniyor" duruyordu.
      renderList();
    } else {
      kuyrukSeritYaz();
    }
  }

  // Tek urunu bastan sona kosar ve TASLAK KAYDEDILINCE kayitla cozulur.
  // `analysesRunReport` TR -> EN gecisini kendi icinde yapiyor; bitisini
  // beklemek icin taslak kaydinin sinyali kullaniliyor (bkz. r.kuyruk).
  function kuyrukTekUrun(girdi) {
    return new Promise(function (coz, red) {
      (async function () {
        try {
          var product = await QorAiRun.loadProduct(girdi.id);
          var r = yeniRun('product', { product: product }, []);
          r.kuyruk = { coz: coz, red: red };
          _run = r;
          // KOSU ACIKCA GECILIR. `analysesRunReport()` parametresiz
          // cagrilinca global `_run`a bakiyordu ve baska bolume gecince
          // (loadAnalysesAdmin -> `_run = null`) kosu YARIDA SESSIZCE
          // OLUYORDU: TR raporu bitiyor, ikinci dile gecerken fonksiyon
          // `if (!_run) return;` ile cikiyor, promise HIC cozulmuyor ve
          // kuyruk sonsuza kadar o urunde bekliyordu. Kullanicinin
          // "ekrandan cikinca duruyor" dedigi sey buydu.
          await analysesRunReport(r);
        } catch (e) { red(e); }
      }());
    });
  }

  // Kaynak turune gore quiz — ilk adimda da, ikinci dilde de ayni yol.
  function quizUret(r, lang) {
    if (r.kind === 'product') return Promise.resolve([]);
    if (r.kind === 'compare') return QorAiRun.generateCompareQuiz(r.products, lang);
    if (r.kind === 'subscription') return QorAiRun.subscriptionQuiz(r.names, lang);
    return QorAiRun.linkQuiz(r.bases, lang);
  }

  // COK KONULU kaydin adresi. Karsilastirma ve abonelik artik SAYICA SINIRSIZ
  // (12 urun, 8 servis mumkun) ve butun adlari birlestirmek 300 karakterlik bir
  // slug uretiyordu. Iki somut zarari vardi: ön-render `website/analiz/<slug>/`
  // dizinini aciyor (Windows'ta yol uzunlugu sinirina carpiyor) ve arama
  // sonucunda adres kirpiliyor. Ilk uc ad okunur, gerisi sayiya duser.
  function cokKonuSlug(names, ayirac) {
    var liste = (names || []).filter(Boolean);
    if (!liste.length) return '';
    if (liste.length <= 3) return slugify(liste.join(' ' + ayirac + ' '));
    return slugify(liste.slice(0, 3).join(' ' + ayirac + ' ') + ' ve ' + (liste.length - 3) + ' daha');
  }

  // Uretilen rapordan YAYIN KAYDI. Urun analizinde katalog kaydi var, digerlerinde
  // yok — konu adlari `subjectNames`e yaziliyor (site oradan okuyor).
  function kayitKur(r) {
    var ortak = {
      kind: r.kind,
      report_tr: r.out.tr,
      report_en: r.out.en,
      // Iki dilin quizi AYRI; kayit ikisini de tutar.
      quiz: { tr: r.cevaplar.tr || [], en: r.cevaplar.en || [] },
      sourceRef: '',
      status: 'draft',
      author: 'Qor AI',
      views: 0,
      likes: 0,
      productId: '', productSlug: '', productName: '', productImage: '', productBrand: '',
      category: '', techScore: 0, subjectNames: [],
    };
    if (r.kind === 'product') {
      var p = r.product;
      ortak.productId = p.id;
      ortak.productSlug = p.slug || slugify(p.name);
      ortak.productName = p.name || '';
      ortak.productImage = p.imageUrl || (Array.isArray(p.images) ? p.images[0] : '') || '';
      ortak.productBrand = p.brand || '';
      ortak.category = p.category || '';
      ortak.techScore = num(p.techScore);
      ortak.slug = slugify(p.slug || p.name);
      return ortak;
    }
    if (r.kind === 'compare') {
      var urunler = r.products || [];
      // ADLAR RAPORDAN OKUNUR, secim listesinden degil: motor iki denemede de
      // yazamadigi bir urunu dusurebiliyor (runCompareReport -> dropped) ve o
      // zaman secim listesi rapordan FAZLA urun icerir. Kunyede olmayan bir
      // urunun adini yazmak, sayfanin basligini yalan yapar.
      var raporUrun = (r.out.tr && Array.isArray(r.out.tr.products)) ? r.out.tr.products : null;
      ortak.subjectNames = raporUrun
        ? raporUrun.map(function (p) { return p.name || ''; }).filter(Boolean)
        : urunler.map(function (p) { return p.name || ''; }).filter(Boolean);
      // Karsilastirmada TEK bir urun kaydi yok; ilki temsil eder (gorsel ve
      // kategori ondan gelir), digerleri `subjectNames`te durur.
      var ilk = urunler[0] || {};
      ortak.productName = ortak.subjectNames.join(' vs ');
      ortak.productImage = ilk.imageUrl || (Array.isArray(ilk.images) ? ilk.images[0] : '') || '';
      ortak.productBrand = ilk.brand || '';
      ortak.category = ilk.category || '';
      ortak.slug = cokKonuSlug(ortak.subjectNames, 'vs');
      return ortak;
    }
    if (r.kind === 'subscription') {
      ortak.subjectNames = r.names.slice();
      ortak.category = QorAiLink.subscriptionCategory(r.names[0]) || '';
      ortak.slug = cokKonuSlug(r.names, 'vs');
      // LOGO. Abonelik kaydinda gorsel BOS kaliyordu ve analiz listesinde
      // Netflix satiri gorselsiz duruyordu. Tablo sitenin kendi abonelik
      // logolariyla AYNI (admin/js/sub_logos.js — tek kaynak).
      ortak.productName = r.names[0] || '';
      ortak.productImage = gorselCoz('subscription', r.names[0], '');
      return ortak;
    }
    ortak.subjectNames = r.bases.map(function (b) { return b.title; }).filter(Boolean);
    ortak.category = r.bases[0] ? (r.bases[0].category || '') : '';
    ortak.slug = cokKonuSlug(ortak.subjectNames, 'vs');
    // LINK analizi: baglantidan cikarilan urun gorseli varsa onu kullan.
    ortak.productName = ortak.subjectNames[0] || '';
    ortak.productImage = gorselCoz('link', ortak.subjectNames[0], linkGorseli(r.bases));
    // KATALOG ESLESMESI. Yapistirilan urun BIZDE de varsa kaydin
    // `productSlug`'ini yaz: analiz sayfasi o zaman urun sayfasina IC LINK
    // verir. Onceden bu yalnizca `kind === 'product'` icin vardi, yani link
    // analizleri katalog urunune baglansa bile hicbir yere link vermiyordu.
    // Eslesme ZAYIFSA yazilmaz — yanlis urune baglamak, hic baglamamaktan
    // kotudur (findCatalogMatch minScore=0.55 ile ayni gerekce).
    if (r.katalog && r.katalog.slug) {
      ortak.productSlug = r.katalog.slug;
      ortak.productId = r.katalog.id || '';
      if (!ortak.productImage) ortak.productImage = r.katalog.imageUrl || '';
      if (!ortak.productBrand) ortak.productBrand = r.katalog.brand || '';
      if (!ortak.category) ortak.category = r.katalog.category || '';
    }
    return ortak;
  }

  // Kaydin gorselini cozer. Sirasi: ELLE girilen adres > kaynagin kendi
  // gorseli (link analizinde og:image) > abonelik logo tablosu. Bulunamazsa
  // bos doner ve liste gorselsiz satiri zaten dogru ciziyor.
  function gorselCoz(tur, ad, kaynakGorsel) {
    if (kaynakGorsel && /^https?:\/\//i.test(kaynakGorsel)) return kaynakGorsel;
    // DIKKAT: `root` bu dosyada YEREL bir degisken ($('analysesAdminRoot')).
    // Global icin window kullanilir — QorAiLink de boyle cagriliyor.
    if (tur === 'subscription' && window.QorSubLogos) {
      return window.QorSubLogos.logoUrl(ad) || '';
    }
    return '';
  }

  // Link analizinde AI, sayfadan bir gorsel cikarmis olabilir; alan adi
  // kaynaga gore degisiyor, o yuzden hepsine bakilir.
  function linkGorseli(bases) {
    var liste = Array.isArray(bases) ? bases : [];
    for (var i = 0; i < liste.length; i += 1) {
      var b = liste[i] || {};
      var aday = b.imageUrl || b.image || b.ogImage || b.thumbnail || '';
      if (aday && /^https?:\/\//i.test(aday)) return aday;
    }
    return '';
  }

  /**
   * KOSU ARTIK PARAMETREYLE TASINIR, GLOBALLE DEGIL.
   *
   * `analysesRunReport()` parametresizken `_run`a bakiyordu ve TR -> EN
   * gecisini de kendini `_run` uzerinden yeniden cagirarak yapiyordu.
   * `loadAnalysesAdmin()` ise her ziyarette KOSULSUZ `_run = null` yaziyor.
   * Sonuc: kuyruk kosarken baska bir bolume girip Analizler'e donmek
   *   1. `_run`u siliyor,
   *   2. Turkce rapor bitince ikinci dil icin yapilan ozyineli cagri
   *      `if (!_run) return;` ile SESSIZCE cikiyor,
   *   3. `r.kuyruk.coz()` hic cagrilmiyor, promise hic cozulmuyor,
   *   4. `analysesKuyrukBasla` o urunde SONSUZA KADAR bekliyor.
   * Kullanicinin "ekrandan cikinca duruyor, devam etmiyor" dedigi hata
   * buydu — is arka planda olmuyordu, kuyruk kilitleniyordu.
   *
   * ILERLEME DURUMU DA KOSUNUN USTUNDE (`r.durum`): quizsiz turde iki dil
   * TEK listede gosteriliyor ve her cagrida yeni bir `durum = {}` acmak
   * Turkce adimlarin isaretini siliyordu.
   */
  async function analysesRunReport(run) {
    var r = run || _run;
    if (!r) return;
    var lang = r.lang;
    r.durum = r.durum || {};
    var durum = r.durum;
    _cmpIlerleme = null;
    renderProgress(durum, '', r);
    var answers = r.questions.map(function (q, i) {
      return { question: q.text, answer: r.answers[i] };
    }).filter(function (a) { return a.answer != null; });
    r.cevaplar[lang] = answers;

    function mark(key, st) {
      durum[key] = st;
      // Kuyruk seridi de ayni adimi gosterir: liste ekranindayken ilerleme
      // ekrani yok, tek gorunur yer serit.
      if (st === 'run' && r.kuyruk) {
        var etiket = progAdimlari(lang, r.kind).filter(function (p) { return p[0] === key; })[0];
        kuyrukAdim(etiket ? etiket[1] : key);
      }
      renderProgress(durum, '', r);
    }

    try {
      if (r.kind === 'product' && !r.similar) r.similar = await QorAiRun.similarProducts(r.product, 8);
      // BU DILIN RAPORU ZATEN VARSA YENIDEN URETME. Ornek: Turkce rapor
      // basariyla ciktiktan sonra Ingilizce QUIZ uretimi patlarsa "Tekrar dene"
      // ayni yere donuyor; korumasiz kalirsa iki pahali cagriyi (arastirma +
      // rapor) bosuna yeniden harcardi.
      if (!r.out[lang]) {
        var res = await raporUret(r, lang, answers, r.similar || [], function (stage, _lg, bilgi) {
          if (stage === 'research') mark(lang + '-research', 'run');
          if (stage === 'report') { mark(lang + '-research', 'done'); mark(lang + '-report', 'run'); }
          // Yalniz karsilastirmada: urun basina ilerleme sayaci.
          if (stage === 'progress') { _cmpIlerleme = bilgi; renderProgress(durum, '', r); }
          if (stage === 'verdict') { mark(lang + '-report', 'done'); mark(lang + '-verdict', 'run'); }
        });
        // `researched` BAYRAGI KAYDA GIRMELI. Motor bunu her turde donduruyor
        // ama eskiden yalnizca `res.data` saklaniyordu; yayinlanan kayitta iz
        // kalmiyor, sayfa da "canli arama yapildi mi" sorusunu yanitlayamiyordu.
        // Kronik sorun listesi BOS dondugunde bu bayrak tek ayirt edici:
        // "arandi, bulunamadi" ile "hic aranmadi" ayni goruntu degil.
        // URUN KODU RAPOR METNINDEN DUSER. Baslik temizligi yetmiyor: model
        // urun adini cumlelerin icine de yaziyor (olculdu: tek analizde yedi
        // paragrafta "(SM-S918B)"). Okuma tarafinda da bir kapi var
        // (analysisRecord.analysisReport) ama kayda temiz girmesi daha iyi.
        r.out[lang] = (res.data && typeof res.data === 'object')
          ? QorAiPrompts.cleanProductCodes(Object.assign({}, res.data, { researched: Boolean(res.researched) }))
          : res.data;
        // ARASTIRMA METNI KOSUDA SAKLANIR: ikinci dil ayni kaniti kullanir ve
        // grounded aramayi TEKRARLAMAZ. Arama token'dan ayri, ISTEK BASINA
        // faturalaniyor — bu satir analiz basina bir aramanin parasidir.
        if (!r.research && typeof res.research === 'string' && res.research.trim()) {
          r.research = res.research;
        }
        // PARAGRAF ETİKETLERİ ADANMIŞ SINIFLANDIRICIYLA YENİDEN KURULUR.
        //
        // Rapor modelinin yazdığı `paragraphSentiment` güvenilir değil:
        // ölçüldü (2026-09-03, altı dil-kaydı) "Zamanlama ve değer" bölümü
        // 4 kayıtta, "Kime uygun/değil" 5 kayıtta KOMPLE etiketsizdi ve
        // olumlu bir cümle kırmızı çıkmıştı. Adanmış sınıflandırıcı tek iş
        // yapıyor ve fixture testinden 42/42 geçiyor. Gerekçe ve maliyet
        // hesabı qor_ai_run.js -> labelParagraphs başlığında.
        //
        // Başarısız olursa rapor YİNE yayınlanır — renk kaybı, veri kaybı
        // değil. Bu adım için akışı durdurmak orantısız olurdu.
        if (r.out[lang] && typeof r.out[lang] === 'object') {
          try {
            mark(lang + '-sentiment', 'run');
            var etiketSayisi = await QorAiRun.attachParagraphSentiment(r.out[lang]);
            mark(lang + '-sentiment', 'done');
            if (!etiketSayisi) toast('Paragraf etiketi üretilemedi (' + lang + ') — metin renksiz kalacak', 'w');
          } catch (e) {
            mark(lang + '-sentiment', 'fail');
            toast('Paragraf etiketleme atlandı: ' + (e.message || e), 'w');
          }
        }
        // İKİNCİ DİLİN ÖLÇÜLERİ BİRİNCİDEN DEVRALINIR.
        //
        // Analiz iki AYRI çağrıyla üretiliyor ve model her çağrıda kendi
        // puanını veriyordu; aynı ürün iki dilde farklı sayılar taşıyordu.
        // Ölçüldü (canlı iPhone 17 Pro): memnuniyet 82/87, fiyat güveni
        // 85/80 ve en kötüsü `buyOrWait` TR "buy" / EN "watch" — yani aynı
        // ürün bir okuyucuya "al", ötekine "bekle" diyordu.
        //
        // METİN AYRI KALIR: iki dil iki ayrı okuyucu kitlesi ve birebir
        // çeviri istemiyoruz. Devralınan tek şey ÖLÇÜ. Hangi alanların
        // kilitlendiği ve NEDEN bazılarının kilitlenmediği
        // qor_ai_prompts.js -> lockScoresToBase başlığında yazılı.
        if (lang !== 'tr' && r.out.tr && r.out[lang]) {
          var esitlenen = QorAiPrompts.lockScoresToBase(r.out[lang], r.out.tr);
          if (esitlenen) toast(esitlenen + ' puan Türkçe raporla eşitlendi', 'i');
        }
        // Karsilastirmada bir urunun raporu iki denemede de gelmediyse motor
        // onu DUSURUYOR. Sessiz kalmak, 6 urun sectigim halde 5 urunlu bir
        // sayfa yayinlamak demek — kayit da rapordan okundugu icin (kayitKur)
        // ad listesi tutarli kalir, ama bunu BILEREK yayinlamak gerekir.
        if (res.dropped && res.dropped.length) {
          toast('Rapor üretilemeyen ürün çıkarıldı: ' + res.dropped.join(', '), 'w');
        }
      }
      mark(lang + '-research', 'done');
      mark(lang + '-report', 'done');
      if (r.kind === 'compare') mark(lang + '-verdict', 'done');
      _cmpIlerleme = null;

      // TURKCE BITTI -> INGILIZCE QUIZ. Sorular BASTAN uretilir; ceviri degil.
      if (lang === 'tr') {
        // Quiz gerektirmeyen turde (urun) ikinci dile DOGRUDAN gecilir;
        // aksi halde bos bir quiz ekrani cizilir ve akis orada tikanirdi.
        if (!quizGerekli(r)) {
          r.lang = 'en';
          r.questions = [];
          r.answers = [];
          // KOSU ACIKCA GECILIR — global `_run` bu arada silinmis olabilir.
          return analysesRunReport(r);
        }
        mark('next-quiz', 'run');
        var q = await quizUret(r, 'en');
        if (!q.length) throw new Error('İngilizce quiz üretilemedi');
        mark('next-quiz', 'done');
        r.lang = 'en';
        r.questions = q;
        r.answers = [];
        renderQuiz();
        return;
      }

      mark('meta', 'run');
      var meta = await metaUret(runKonu(r), r.kind, r.out.tr);
      mark('meta', 'done');

      var kayit = kayitKur(r);
      metaYaz(kayit, meta);
      // TASLAK OLARAK HEMEN KAYDET. Onizleme sitedeki sayfanin kendisi ve o
      // sayfa kaydi `?id=` ile cekiyor — kayit yoksa onizleyecek bir sey de
      // yok. Ayrica bu kadar cagrinin sonucu sekme kazara kapanirsa kaybolmasin.
      mark('save', 'run');
      // DONUS DEGERI KONTROL EDILIR. Yoksa slug/meta catismasi ya da PB
      // hatasi "basarili" sayilip kuyruga ✓ yaziliyordu.
      //
      // KUYRUKTA `_editing`E DOKUNULMAZ. Global editor kaydini kuyrugun
      // altindan degistirmek iki sekilde zarar veriyordu: baska bir bolume
      // girip cikmak (loadAnalysesAdmin -> `_editing = null`) kaydi
      // dusuruyor, kullanicinin actigi bir taslak da kuyruk tarafindan
      // ezilebiliyordu.
      var kayitOk = r.kuyruk ? await kaydet('draft', kayit) : (_editing = kayit, await kaydet('draft'));
      if (!kayitOk) throw new Error(_kaydetHata || 'Taslak kaydedilemedi');
      mark('save', 'done');
      // KUYRUKTAYSA EDITORU ACMA: sonraki urune gecilecek, araya taslak
      // duzenleyicisini sokmak akisi keser. Taslaklar Analizler listesinden
      // ya da kuyruk seridindeki "Aç" ile tek tek incelenir.
      if (r.kuyruk) { r.kuyruk.coz(kayitOk); return; }
      renderEditor();
    } catch (e) {
      var acik = Object.keys(durum).filter(function (k) { return durum[k] === 'run'; });
      acik.forEach(function (k) { durum[k] = 'fail'; });
      renderProgress(durum, e.message || String(e), r);
      if (r.kuyruk) r.kuyruk.red(e);
    }
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

  async function analysesEdit(id) {
    styles();
    _slugHata = ''; _slugTaslak = '';
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
      + adimlar('yayin', kind)
      + (rapor ? '' : '<div class="an-note an-note-err">Rapor verisi yok — bu kayıt yayınlanamaz.</div>')
      + '<div class="an-tabbar">'
      + LANGS.map(function (x) {
        var v = a['report_' + x[0]] ? '' : ' <em>rapor yok</em>';
        return '<button class="' + (x[0] === L ? 'on' : '') + '" onclick="analysesLang(\'' + x[0] + '\')">'
          + x[1] + v + '</button>';
      }).join('')
      + '</div>'
      + denetimKart(a)
      + onizlemeKart(a, L, diller)
      + kunyeKart(a, L, kind, rapor);
  }

  function eylemler(a, yayinda) {
    var kayitli = Boolean(a.id);
    return '<div class="an-acts">'
      + (yayinda && kayitli
        ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + SITE + '/analiz/' + esc(a.slug) + '">Sitede aç</a>'
        : '')
      + '<button class="btn btn-ghost" onclick="analysesMetaYenile()"'
      + ' title="Raporu DEGISTIRMEZ. Yalniz yayin metnini (H1 baslik, ozet, arama basligi, arama aciklamasi ve SSS) rapordan yeniden yazar.">Meta\'yı yeniden üret</button>'
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
    // DIL BASINA DURUST OL. `reportOf()` bilerek toleransli (oteki dile duser),
    // ama o dilde KENDI raporu yoksa: site o adreste oteki dilin metnini
    // gosterir ve on-render o sayfayi HIC URETMEZ. Onizlemede oteki dilin
    // raporunu gostermek "bu dil hazir" izlenimi verirdi.
    if (langsOf(a).indexOf(L) < 0) {
      return '<div class="an-card"><h3>Önizleme · ' + esc(L.toUpperCase()) + '</h3>'
        + '<p class="an-hint">Bu kaydın <strong>' + esc(L.toUpperCase()) + ' raporu yok</strong>. '
        + 'Site bu adreste diğer dilin metnini gösterir ve ön-render bu dilde '
        + '<strong>sayfa üretmez</strong>; hreflang listesine de girmez. '
        + 'Tek dilli kayıtlar “Sitede yapılmışlardan al” yolundan kalmadır; '
        + 'iki dilli bir yayın için analizi <strong>+ Yeni analiz</strong> ile baştan üret.</p></div>';
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
  // GORSEL — kunyedeki TEK duzenlenebilir alan.
  //
  // Neden elle: urun analizinde gorsel katalogdan gelir, ama ABONELIK ve LINK
  // analizinde kaynakta gorsel olmayabilir (Netflix kaydi gorselsiz yayina
  // cikmisti ve analiz listesinde bos satir olarak duruyordu). Abonelikte
  // otomatik doldurma sitenin kendi logo tablosundan yapilir
  // (admin/js/sub_logos.js), bulunamazsa buradan elle verilir.
  //
  // URL alani, dosya YUKLEME degil: katalogdaki butun gorseller zaten
  // URL-only tutuluyor (bkz. reference_product_images) ve PB'ye ikinci bir
  // dosya deposu acmak bu kaydin app tarafindan okunmasini da degistirirdi.
  function gorselKart(a) {
    var url = String(a.productImage || '');
    return '<div class="an-ro an-ro-edit"><span>Görsel</span>'
      + '<div class="an-img-row">'
      + (url
        ? '<img class="an-img-prev" src="' + esc(url) + '" alt=""'
          + ' onerror="this.classList.add(\'bad\')">'
        : '<div class="an-img-prev empty">yok</div>')
      + '<input class="ba-input" id="anImgUrl" value="' + esc(url) + '"'
      + ' placeholder="https://… (logo ya da ürün görseli)">'
      + '<button class="btn btn-sm" onclick="analysesSaveImage()">Kaydet</button>'
      + '</div>'
      + '<p class="an-img-hint">Abonelik analizlerinde site logosu otomatik gelir; '
      + 'gelmezse ya da başka bir görsel istiyorsan adresi buraya yapıştır.</p>'
      + '</div>';
  }

  // ADRES — kunyedeki IKINCI duzenlenebilir alan.
  //
  // Neden elle: slug konu adindan otomatik uretiliyor ve iki analizin ayni
  // adrese dusmesi mumkun (ayni urunun ikinci analizi, ayni kisaltmaya inen
  // iki karsilastirma). Boyle bir durumda kaydet() kaydi REDDEDIYORDU ve
  // duzeltmenin yolu yoktu: adres salt okunurdu, yani uretilmis bir analiz
  // (2 quiz + 4+ rapor cagrisi) kurtarilamadan cope gidiyordu. OLU UCTU.
  // Reddedilen adres SATIRDA yazili kalir, yalniz toast'la degil. Toast birkac
  // saniyede kayboluyor ve geride tutarsiz bir ekran birakiyordu: kutuda
  // reddedilen deger, iki satir asagidaki adreste ise eski deger. Ikinci kez
  // "Kaydet" demek hicbir sey yapmamis gibi goruunuyordu.
  var _slugHata = '';
  var _slugTaslak = '';

  function slugKart(a) {
    // KUTUDAKI deger ile ADRES ayni sey degil: kutu reddedilen taslagi
    // gosterebilir, adres DAIMA kayitta duran gercek slug'i gosterir. Ikisini
    // ayni degiskene baglamak, "kaydedilmedi" yazarken altinda kaydedilmemis
    // adresi yayindaymis gibi listeliyordu.
    var kutu = _slugTaslak || String(a.slug || '');
    var kayitli = String(a.slug || '');
    return '<div class="an-ro an-ro-edit"><span>Adres (slug)</span>'
      + '<div class="an-img-row">'
      + '<input class="ba-input" id="anSlug" value="' + esc(kutu) + '" placeholder="ornek-urun-analizi">'
      + '<button class="btn btn-sm" onclick="analysesSaveSlug()">Kaydet</button>'
      + '</div>'
      + (_slugHata ? '<p class="an-err" style="margin:8px 0 0">' + esc(_slugHata) + '</p>' : '')
      + (kayitli
        ? '<p class="an-img-hint an-urls"><code>' + esc(SITE + '/analiz/' + kayitli) + '</code>'
          + '<code>' + esc(SITE + '/tr/analiz/' + kayitli) + '</code></p>'
        : '')
      + '<p class="an-img-hint">Yazdığın değer adres biçimine çevrilir. '
      + '<strong>Yayındaki bir kaydın adresini değiştirmek eski adresi kırar</strong> — '
      + 'yalnızca çakışmayı çözmek için değiştir.</p>'
      + '</div>';
  }

  async function analysesSaveSlug() {
    if (!_editing) return;
    var el = $('anSlug');
    var ham = el ? String(el.value || '') : '';
    var yeni = slugify(ham);

    function reddet(mesaj) { _slugHata = mesaj; _slugTaslak = ham; renderEditor(); }

    if (!yeni) { reddet('Adres boş olamaz.'); return; }
    if (yeni === _editing.slug) { _slugHata = ''; _slugTaslak = ''; renderEditor(); toast('Adres zaten bu', 'i'); return; }
    var eski = _editing.slug;
    _editing.slug = yeni;
    var carp = slugCakismasi(_editing);
    if (carp) {
      _editing.slug = eski;
      reddet('Bu adres “' + (subjectOf(carp) || carp.id) + '” kaydında kullanılıyor — kaydedilmedi.');
      return;
    }
    if (!_editing.id) { _slugHata = ''; _slugTaslak = ''; renderEditor(); toast('Adres ayarlandı', 's'); return; }
    if (await kaydet(_editing.status || 'draft')) {
      _slugHata = ''; _slugTaslak = '';
      renderEditor();
      toast('Adres kaydedildi', 's');
    } else {
      _editing.slug = eski;
      reddet('Kaydedilemedi — yukarıdaki engellere bak.');
    }
  }

  async function analysesSaveImage() {
    if (!_editing) return;
    var el = $('anImgUrl');
    var url = el ? String(el.value || '').trim() : '';
    if (url && !/^https?:\/\//i.test(url)) { toast('Adres http(s) ile başlamalı', 'w'); return; }
    try {
      await getPb().collection('analyses').update(_editing.id, { productImage: url });
      _editing.productImage = url;
      toast('Görsel kaydedildi', 's');
      renderEditor();
    } catch (e) {
      toast('Görsel kaydedilemedi: ' + (e && e.message ? e.message : e), 'e');
    }
  }

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
      + slugKart(a)
      + gorselKart(a)
      + raporOzeti(kind, rapor)
      + '<div class="an-hint"><strong>Meta\'yı yeniden üret</strong>: raporu değiştirmeden yalnız '
      + 'yukarıdaki yayın metnini (başlık, özet, arama başlığı/açıklaması, SSS) yeniden yazar. '
      + 'Bu alanlar <strong>elle düzenlenmez</strong>. Rapor da, başlık/özet/meta/SSS de '
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

  /* ── AYNI KONU IKINCI KEZ YAYINLANMAZ ────────────────────────────────────
     Slug catismasi kontrolu VARDI ama yalnizca ADRESE bakiyordu. Ayni urun
     iki farkli baslikla ("iPhone 16 Analizi" / "iPhone 16 İncelemesi") iki
     ayri slug uretir, catisma denetimine takilmaz ve sitede AYNI URUN icin
     iki analiz sayfasi yayina girer. Google icin bu iki ince, birbirinin
     kopyasi sayfa demek; okuyucu icin hangisinin guncel oldugu belirsiz.

     Kimlik ADRESTEN degil KONUDAN turetilir:
       urun         -> katalog kaydinin id'si (en guvenilir)
       digerleri    -> normalize edilmis, siralanmis konu adlari
     Karsilastirmada sira onemsiz: "A vs B" ile "B vs A" AYNI analizdir. */
  function konuNormal(x) {
    return String(x || '')
      .toLocaleLowerCase('tr')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  function adlarAnahtari(kind, names) {
    var liste = (names || []).map(konuNormal).filter(Boolean).sort();
    return liste.length ? kind + ':' + liste.join('|') : '';
  }
  /** Yayin kaydindan konu anahtari. */
  function kayitKonuAnahtari(rec) {
    if (!rec) return '';
    var kind = String(rec.kind || 'product');
    if (kind === 'product') {
      if (rec.productId) return 'product:' + rec.productId;
      return adlarAnahtari('product', [rec.productName]);
    }
    var adlar = Array.isArray(rec.subjectNames) && rec.subjectNames.length
      ? rec.subjectNames
      : [rec.productName];
    return adlarAnahtari(kind, adlar);
  }
  /** Uretim akisindan (henuz kayit yokken) konu anahtari. */
  function runKonuAnahtari(kind, kaynak) {
    if (kind === 'product') {
      var p = kaynak.product || {};
      return p.id ? 'product:' + p.id : adlarAnahtari('product', [p.name]);
    }
    if (kind === 'compare') {
      return adlarAnahtari('compare', (kaynak.products || []).map(function (x) { return x.name; }));
    }
    if (kind === 'subscription') return adlarAnahtari('subscription', kaynak.names || []);
    return adlarAnahtari('link', (kaynak.bases || []).map(function (b) { return b.title; }));
  }
  /**
   * Ayni konuya ait BASKA kayit. `yalnizYayinda` true ise taslaklar sayilmaz.
   * `_items` tum kayitlari tasiyor (loadAnalysesAdmin -> getFullList), yani
   * ek bir PB istegi gerekmiyor.
   */
  function konuCakismasi(anahtar, haricId, yalnizYayinda) {
    if (!anahtar) return null;
    for (var i = 0; i < _items.length; i += 1) {
      var o = _items[i];
      if (haricId && o.id === haricId) continue;
      if (yalnizYayinda && o.status !== 'published') continue;
      if (kayitKonuAnahtari(o) === anahtar) return o;
    }
    return null;
  }

  function slugCakismasi(a) {
    // Ayni slug ikinci bir kayitta olursa /analiz/<slug> hangisini cizecegi
    // BELIRSIZ olur ve on-render iki kaydi ayni dosyaya yazip birini ezer.
    return _items.filter(function (o) {
      return o.id !== a.id && String(o.slug || '') === a.slug;
    })[0];
  }

  // ── YAYIN HAZIRLIK DENETIMI ────────────────────────────────
  //
  //  "Yayinla" butonu neden reddettigini ancak TIKLANDIKTAN sonra bir toast
  //  ile soyluyordu ve bazi sebepler (slug catismasi) o ana kadar gorunmuyordu.
  //  Ayni kurallar burada ONCEDEN kosturuluyor:
  //    engel  — kaydet() zaten reddeder ya da seo-audit.mjs build'i kirar
  //    uyari  — yayinlanir ama sayfa eksik/zayif cikar
  //
  //  Uzunluk esikleri sabit degil, OLCUME dayali: metaTitle 60 (Google'in
  //  kirpma siniri, prompt da bunu istiyor), metaDescription 140-155 (155 ust
  //  sinir; 140 alt sinir cunku denetim (scripts/audit_analyses.mjs)
  //  aciklamalarin surekli 126-132'de kaldigini, yani bedava alanin bos
  //  birakildigini gosterdi).
  function yayinDenetim(a) {
    var engel = [];
    var uyari = [];
    var diller = langsOf(a);

    if (!String(a.slug || '').trim()) engel.push('Adres (slug) boş');
    else {
      var carpanSlug = slugCakismasi(a);
      if (carpanSlug) engel.push('Adres başka bir kayıtta kullanılıyor: ' + (subjectOf(carpanSlug) || carpanSlug.id));
    }
    if (!diller.length) engel.push('Rapor verisi yok — bu kayıt yayınlanamaz');
    metaCakismasi(a).forEach(function (c) { engel.push('Yinelenen meta: ' + c.replace(/<[^>]*>/g, '')); });

    if (diller.length === 1) {
      uyari.push('Yalnız ' + diller[0].toUpperCase() + ' raporu var — diğer dilde sayfa ön-render EDİLMEZ ve hreflang’e girmez');
    }
    LANGS.forEach(function (x) {
      var l = x[0];
      if (diller.indexOf(l) < 0) return;
      var mt = String(a['metaTitle_' + l] || '').trim();
      var md = String(a['metaDescription_' + l] || '').trim();
      if (!mt) uyari.push(l.toUpperCase() + ' arama başlığı boş');
      else if (mt.length > 60) uyari.push(l.toUpperCase() + ' arama başlığı ' + mt.length + '/60 — arama sonucunda kırpılır');
      if (!md) uyari.push(l.toUpperCase() + ' arama açıklaması boş');
      else if (md.length > 155) uyari.push(l.toUpperCase() + ' arama açıklaması ' + md.length + '/155 — kırpılır');
      else if (md.length < 140) uyari.push(l.toUpperCase() + ' arama açıklaması ' + md.length + '/155 — kısa, boş alan harcanıyor');
      if (!String(a['title_' + l] || '').trim()) uyari.push(l.toUpperCase() + ' H1 başlığı boş');
      if (!(Array.isArray(a['faq_' + l]) && a['faq_' + l].length)) uyari.push(l.toUpperCase() + ' SSS boş — FAQPage şeması üretilmez');
    });
    if (!String(a.productImage || '').trim()) uyari.push('Görsel yok — liste ve künye satırı boş görünür');

    return { engel: engel, uyari: uyari, hazir: engel.length === 0 };
  }

  // Denetimin TEK CUMLELIK karsiligi — listede rozet, editorde baslik.
  function durumRozeti(a) {
    var d = yayinDenetim(a);
    if (d.engel.length) return '<span class="an-pill err">' + d.engel.length + ' engel</span>';
    if (d.uyari.length) return '<span class="an-pill warn">' + d.uyari.length + ' eksik</span>';
    return '<span class="an-pill ready">hazır</span>';
  }

  function denetimKart(a) {
    var d = yayinDenetim(a);
    var satir = function (metin, tur) {
      return '<li class="an-chk-' + tur + '"><i>' + (tur === 'engel' ? '✕' : '!') + '</i>' + esc(metin) + '</li>';
    };
    return '<div class="an-card an-chk">'
      + '<h3>Yayın hazırlığı ' + durumRozeti(a) + '</h3>'
      + ((d.engel.length || d.uyari.length)
        ? '<ul class="an-chklist">'
          + d.engel.map(function (x) { return satir(x, 'engel'); }).join('')
          + d.uyari.map(function (x) { return satir(x, 'uyari'); }).join('')
          + '</ul>'
        : '<p class="an-chk-ok">✓ Her iki dilde rapor, meta ve SSS yerinde; adres benzersiz. Yayınlanabilir.</p>')
      + (d.engel.length
        ? '<p class="an-hint"><strong>Engeller</strong> yayını durdurur — kaydet() zaten reddeder ya da '
          + '<code>seo-audit</code> build’i kırar. <strong>Uyarılar</strong> durdurmaz; sayfa yayınlanır ama eksik çıkar.</p>'
        : (d.uyari.length
          ? '<p class="an-hint">Uyarılar yayını durdurmaz. Meta ile ilgili olanlar için '
            + '<strong>Meta’yı yeniden üret</strong> genelde yeterli.</p>'
          : ''))
      + '</div>';
  }

  // kaydet() basarisizlikta THROW ETMEZ, `false` doner ve sebebi yalnizca
  // toast'ta gosterir. Kuyruk bunu "bitti" sayip ✓ yazdi: uc iPhone 14
  // varyanti icin sirayla kosuldu, ekranda 3/3 TAMAMLANDI gorundu ve PB'de
  // TEK KAYIT OLUSMADI (olculdu 2026-09-01). Toast da kaybolduğu icin sebep
  // hic ogrenilemedi. Sebep artik burada saklaniyor; kuyruk okuyup loga
  // yaziyor.
  var _kaydetHata = '';
  function kaydetRed(msg) { _kaydetHata = msg; toast(msg, 'e'); return false; }

  /**
   * `hedef` VERILIRSE global `_editing`e DOKUNULMAZ.
   *
   * Kuyruk kendi kaydini yazarken editorun acik kaydini degistirmemeli:
   * baska bir bolume girip cikmak `_editing`i sifirliyor ve kayit
   * kuyrugun altindan kayboluyordu. Donus degeri de artik `true` degil
   * KAYDIN KENDISI — biten urun seride "Aç" / "Önizle" ile cikabilsin diye
   * id ve slug gerekiyor. (`false` yine basarisizlik; ikisi de dogru
   * degerlendirilir.)
   */
  async function kaydet(durum, hedef) {
    _kaydetHata = '';
    var a = hedef || _editing;
    if (!a.slug) return kaydetRed('Slug boş olamaz');
    var carpanSlug = slugCakismasi(a);
    if (carpanSlug) {
      return kaydetRed('Bu slug zaten kullanılıyor: ' + (subjectOf(carpanSlug) || carpanSlug.id));
    }
    if (durum === 'published') {
      if (!reportOf(a, 'tr')) return kaydetRed('Rapor verisi olmayan analiz yayınlanamaz');
      // MUKERRER YAYIN KAPISI. Slug catismasi yalnizca adrese bakiyor; ayni
      // urun farkli bir baslikla farkli bir slug uretip bu denetimi
      // gecebiliyordu. Kimlik KONUDAN turetiliyor (bkz. konuCakismasi).
      var ayniKonu = konuCakismasi(kayitKonuAnahtari(a), a.id, true);
      if (ayniKonu) {
        return kaydetRed('Bu konunun yayında analizi zaten var: “' + (subjectOf(ayniKonu) || ayniKonu.slug)
          + '”. Önce onu yayından kaldır ya da bunu taslak bırak.');
      }
      var carp = metaCakismasi(a);
      if (carp.length) {
        return kaydetRed('Yinelenen meta: ' + carp[0] + ' — düzeltmeden yayınlanamaz');
      }
      if (!a.publishedAt) a.publishedAt = new Date().toISOString();
    }
    a.status = durum;
    try {
      var rec = a.id
        ? await getPb().collection('analyses').update(a.id, a, { $autoCancel: false })
        : await getPb().collection('analyses').create(a, { $autoCancel: false });
      if (!hedef) _editing = rec;
      // Liste onbellegi de tazelensin: slug/meta catisma denetimi _items'a bakiyor.
      var i = _items.findIndex(function (o) { return o.id === rec.id; });
      if (i >= 0) _items[i] = rec; else _items.unshift(rec);
      return rec;
    } catch (e) { return kaydetRed('Kaydedilemedi: ' + (e.message || e)); }
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

  /**
   * LISTEDEN TEK TIKLA YAYINLA — editoru acmadan.
   *
   * Kuyruk on taslagi arka arkaya uretiyor ve hepsini yayinlamak icin tek tek
   * "Ac" -> "Yayinla" -> "Geri" gerekiyordu. Bu buton ayni kapilardan gecer
   * (`kaydet('published')` slug/meta/mukerrer denetimlerini kosturur), sadece
   * ekran degistirmez. Reddedilirse sebep toast olarak cikar ve kayit taslak
   * kalir — sessiz basarisizlik YOK.
   */
  async function analysesListedenYayinla(id) {
    var a = _items.filter(function (x) { return x.id === id; })[0];
    if (!a) { toast('Kayıt bulunamadı', 'e'); return; }
    var onceki = _editing;
    // `kaydet` global `_editing` uzerinden calisir; hedefi gecici olarak
    // bu kayit yapip isimiz bitince ESKI HALINE dondururuz, yoksa acik bir
    // taslak duzenlemesi listeden yayinlama yuzunden kaybolurdu.
    _editing = Object.assign({}, a);
    try {
      var rec = await kaydet('published');
      if (rec) { toast('Yayınlandı: ' + (subjectOf(rec) || rec.slug), 's'); }
    } finally {
      _editing = onceki;
    }
    renderList($('anSearch') ? $('anSearch').value : '', $('anStatus') ? $('anStatus').value : '', $('anKind') ? $('anKind').value : '');
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
  // Motor kota beklemesine girdiginde ilerleme panelinde goster.
  if (window.QorAiRun && QorAiRun.setThrottleNotice) QorAiRun.setThrottleNotice(kotaBildir);

  window.analysesNew = analysesNew;
  window.analysesUretTur = analysesUretTur;
  window.analysesProdSearch = analysesProdSearch;
  window.analysesLinkBasla = analysesLinkBasla;
  window.analysesAbonelikBasla = analysesAbonelikBasla;
  window.analysesSubKat = analysesSubKat;
  window.analysesSubTogla = analysesSubTogla;
  window.analysesSubCikar = analysesSubCikar;
  window.analysesSubEkle = analysesSubEkle;
  window.analysesPickProduct = analysesPickProduct;
  window.analysesKuyrugaEkle = analysesKuyrugaEkle;
  window.analysesKuyruktanCikar = analysesKuyruktanCikar;
  window.analysesKuyrukTemizle = analysesKuyrukTemizle;
  window.analysesKuyrukBasla = analysesKuyrukBasla;
  window.analysesKuyrukDurdur = analysesKuyrukDurdur;
  window.analysesKuyrukDurdurIptal = analysesKuyrukDurdurIptal;
  window.analysesCmpSearch = analysesCmpSearch;
  window.analysesCmpEkle = analysesCmpEkle;
  window.analysesCmpCikar = analysesCmpCikar;
  window.analysesCmpBasla = analysesCmpBasla;
  window.analysesAnswer = analysesAnswer;
  window.analysesRunReport = analysesRunReport;
  window.analysesBackToQuiz = analysesBackToQuiz;
  window.analysesEdit = analysesEdit;
  window.analysesDelete = analysesDelete;
  window.analysesSaveImage = analysesSaveImage;
  window.analysesSaveSlug = analysesSaveSlug;
  window.analysesLang = analysesLang;
  window.analysesTaslakKaydet = analysesTaslakKaydet;
  window.analysesYayinla = analysesYayinla;
  window.analysesListedenYayinla = analysesListedenYayinla;
  window.analysesYayindanKaldir = analysesYayindanKaldir;
  window.analysesMetaYenile = analysesMetaYenile;
})();
