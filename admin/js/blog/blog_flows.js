// ══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — BLOG AI AKIŞLARI + MODALLAR
//
//  AI KONSOLU KALICI. "ai hangi işlemleri yapıyor ekranda gözükmüyor" diye
//  şikâyet edildi: konu bulma ve yazma 1-4 dakika sürüyor ve ekranda hiçbir
//  şey olmuyordu. Artık sağ rayda her adım, geçen süre ve biten işlerin
//  geçmişi duruyor.
//
//  AKIŞLAR:
//    konu bul   → 1 grounded  (sonuç localStorage'a yazılır; sihirbazı tekrar
//                              açmak 0 çağrı — grounded İSTEK BAŞINA ücretli)
//    yaz        → 1 grounded (araştırma, iki dil paylaşır) + 2 json (EN → TR)
//    öğe        → 0 (Typesense) + ≤1 json (marka alan adı) + 0 (görsel probe)
//    düzen/QA   → 1 json + ≤1 json (kaynak-adı sınıflandırma)
//    komut      → 1 json      · çeviri → hedef dil başına 1 json
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  var C = root.BlogCore;
  var AI = root.BlogAi;
  var U = root.BlogUI;
  var P2 = root.BlogUI2;
  if (!U || !P2) throw new Error('blog_flows.js: blog_ui2.js ÖNCE yüklenmeli');

  var S = U.S;
  var esc = C.esc;
  var el = U.el;
  var ACT = U.ACT;
  var KONU_ANAHTAR = 'qor.blogTopics';

  // ── AI KONSOLU ──────────────────────────────────────────────────────────
  var K = { baslik: '', adimlar: null, durum: {}, bas: 0, tik: null, hata: '', log: [] };

  function konsolBaslat(baslik, adimlar) {
    K.baslik = baslik; K.adimlar = adimlar; K.durum = {}; K.bas = Date.now(); K.hata = '';
    if (!K.tik) K.tik = setInterval(konsolYaz, 1000);
    konsolYaz();
  }
  function adim(anahtar, durum, not) {
    if (!K.adimlar) return;
    K.durum[anahtar] = { d: durum || 'run', not: not || '' };
    konsolYaz();
  }
  function konsolBitir(hata) {
    if (K.tik) { clearInterval(K.tik); K.tik = null; }
    if (hata) {
      Object.keys(K.durum).forEach(function (k) { if (K.durum[k].d === 'run') K.durum[k].d = 'fail'; });
      K.hata = hata; konsolYaz(); return;
    }
    var sn = Math.round((Date.now() - K.bas) / 1000);
    K.log.unshift('✓ ' + K.baslik.replace(/^[^\wÇĞİÖŞÜçğıöşü]+/, '') + ' · ' + sn + ' sn');
    K.log = K.log.slice(0, 12);
    K.adimlar = null; K.hata = '';
    konsolYaz();
  }
  function konsolNot(s) { K.log.unshift('· ' + s); K.log = K.log.slice(0, 12); konsolYaz(); }

  function konsolYaz() {
    var box = el('bl_ai'); if (!box) return;
    if (!K.adimlar) {
      box.innerHTML = '<div style="color:var(--text3);font-size:12.5px">Hazır. Konu bulma, yazma, düzen ve çeviri adımları burada görünür.</div>'
        + (K.log.length ? '<div class="bl-ai-log">' + K.log.map(function (s) { return '<div>' + esc(s) + '</div>'; }).join('') + '</div>' : '');
      return;
    }
    var biten = K.adimlar.filter(function (x) { return (K.durum[x[0]] || {}).d === 'done'; }).length;
    var yuzde = Math.round((biten / Math.max(1, K.adimlar.length)) * 100);
    var sn = Math.floor((Date.now() - K.bas) / 1000);
    var sure = sn < 60 ? (sn + ' sn') : (Math.floor(sn / 60) + ' dk ' + (sn % 60) + ' sn');
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<b style="font-size:12.5px">' + esc(K.baslik) + '</b>'
      + '<span class="bl-num" style="color:var(--text3);font-size:11px">' + biten + '/' + K.adimlar.length + ' · ' + sure + '</span></div>'
      + '<div class="bl-ai-bar"><i style="width:' + yuzde + '%"></i></div>'
      + K.adimlar.map(function (x) {
        var d = (K.durum[x[0]] || {});
        var ik = d.d === 'done' ? '✓' : d.d === 'run' ? '⏳' : d.d === 'fail' ? '✕' : '·';
        return '<div class="bl-ai-s ' + (d.d || 'idle') + '"><span class="ic">' + ik + '</span>'
          + '<span>' + esc(x[1]) + (d.not ? ' <span style="opacity:.7">— ' + esc(d.not) + '</span>' : '') + '</span></div>';
      }).join('')
      + (K.hata ? '<div class="bl-ai-e">' + esc(K.hata) + '</div>' : '')
      + (K.log.length ? '<div class="bl-ai-log">' + K.log.map(function (s) { return '<div>' + esc(s) + '</div>'; }).join('') + '</div>' : '');
  }

  // ── MODAL YARDIMCISI ────────────────────────────────────────────────────
  function modal(id, baslik, govde, genislik) {
    kapat(id);
    var m = document.createElement('div');
    m.className = 'bl-modal'; m.id = id;
    m.onclick = function (ev) { if (ev.target === m) m.remove(); };
    m.innerHTML = '<div class="bl-modal-b"' + (genislik ? ' style="max-width:' + genislik + 'px"' : '') + '>'
      + '<div class="bl-modal-h"><strong>' + baslik + '</strong>'
      + '<button class="bl-btn sm" data-bl="modalKapat" data-v="' + id + '">✕ Kapat</button></div>'
      + '<div id="' + id + '_b">' + govde + '</div></div>';
    document.body.appendChild(m);
    return m;
  }
  function kapat(id) { var m = document.getElementById(id); if (m) m.remove(); }
  ACT.modalKapat = function (e, i, j, v) { kapat(v); };

  // ── 1) KONU SİHİRBAZI ───────────────────────────────────────────────────
  var _konular = null;
  var _konuYuk = false;

  function konulariOku() {
    if (_konular) return _konular;
    try {
      var b = JSON.parse(localStorage.getItem(KONU_ANAHTAR) || 'null');
      // 14 günden eski liste bayattır — "neden şimdi" gerekçeleri çürür.
      if (b && Array.isArray(b.list) && (Date.now() - b.at) < 14 * 864e5) { _konular = b.list; return _konular; }
    } catch (_) { /* */ }
    return null;
  }
  function konulariYaz(list) {
    _konular = list;
    try { localStorage.setItem(KONU_ANAHTAR, JSON.stringify({ at: Date.now(), list: list })); } catch (_) { /* */ }
  }

  ACT.topicOpen = function () {
    _konular = konulariOku();
    modal('bl_topic', '🧭 Konu bulma sihirbazı', '<div id="bl_topic_body"></div>', 860);
    topicBody();
  };
  ACT.topicReset = function () { _konular = null; try { localStorage.removeItem(KONU_ANAHTAR); } catch (_) { /* */ } topicBody(); };

  function mevcutBasliklar() {
    return S.items.map(function (a) { return (a.title_tr || a.title_en || a.slug || '').trim(); }).filter(Boolean);
  }

  function topicBody() {
    var b = el('bl_topic_body'); if (!b) return;
    if (_konuYuk) {
      b.innerHTML = '<div class="bl-note">Bu adım canlı Google aramasını kullanır ve <b>istek başına</b> ücretlidir — '
        + 'bir kez koşturup 15-20 konuyu biriktir, her yazı için tekrar çalıştırma.</div>'
        + '<div id="bl_topic_prog" class="bl-ai"></div>';
      topicProg();
      return;
    }
    if (!_konular) {
      b.innerHTML = '<p style="line-height:1.7;color:var(--text2)">Güncel arama trendlerine ve <b>sitenin kendi kataloğuna</b> göre konu önerir. '
        + 'Zaten yazılmış <b class="bl-num">' + mevcutBasliklar().length + '</b> başlık modele veriliyor, aynı konu ikinci kez önerilmez.</p>'
        + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0">'
        + '<label class="bl-lbl" style="margin:0">Kaç konu</label>'
        + '<select class="bl-in" id="bl_topic_n" style="width:88px"><option>10</option><option selected>15</option><option>20</option></select>'
        + '<input class="bl-in" id="bl_topic_hint" style="flex:1;min-width:240px" placeholder="İstersen yön ver: “laptop”, “bütçe telefon”, “kulaklık” (boş bırakabilirsin)" />'
        + '<button class="bl-btn pri" data-bl="topicFetch">Konuları getir</button></div>';
      return;
    }
    b.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '<span style="color:var(--text2);font-size:12.5px"><b class="bl-num">' + _konular.length + '</b> konu · en yüksek fırsat üstte · liste yerel olarak saklandı</span>'
      + '<button class="bl-btn sm" data-bl="topicReset">↺ Yeniden ara</button></div>'
      + _konular.map(function (k, i) {
        // Panel Türkçe: başlık her zaman TR gösterilir (kullanıcının kuralı).
        var trBaslik = k.title_tr || k.title || '';
        return '<div class="bl-topic"><div style="display:flex;gap:14px;align-items:flex-start">'
          + '<div style="flex:1;min-width:0">'
          + '<div class="h">' + esc(trBaslik) + '</div>'
          + (k.title && k.title_tr ? '<div style="color:var(--text3);font-size:11.5px;margin-bottom:4px">EN: ' + esc(k.title) + '</div>' : '')
          + '<div class="a">' + esc(k.angle || '') + '</div>'
          + '<div class="w"><b>Neden şimdi:</b> ' + esc(k.why || '—') + '<br>'
          + '<b>Arama niyeti:</b> ' + esc(k.intent || '—') + ' · <b>Hedef kelime:</b> ' + esc(k.keyword || '—')
          + (k.products && k.products.length ? '<br><b>Katalogdan:</b> ' + esc(k.products.join(' · ')) : '') + '</div>'
          + '</div>'
          + '<button class="bl-btn pri" style="flex-shrink:0" data-bl="topicPick" data-i="' + i + '">Bu konuyu yaz</button>'
          + '</div></div>';
      }).join('');
  }
  function topicProg() {
    var t = el('bl_topic_prog'); if (!t) return;
    var kaynak = el('bl_ai');
    t.innerHTML = kaynak ? kaynak.innerHTML : '';
  }

  ACT.topicFetch = async function () {
    var n = Number((el('bl_topic_n') || {}).value) || 15;
    var hint = ((el('bl_topic_hint') || {}).value || '').trim();
    _konuYuk = true; topicBody();
    konsolBaslat('🧭 Konu aranıyor', [
      ['ara', 'Google’da güncel küresel trendler taranıyor'],
      ['sirala', 'Fırsata göre sıralanıyor, yazılmışlar eleniyor'],
    ]);
    var tik = setInterval(topicProg, 500);
    try {
      adim('ara', 'run');
      var r = await AI.grounded(AI.konuPrompt(n, hint, mevcutBasliklar()), 8192);
      adim('ara', 'done');
      adim('sirala', 'run');
      var list = (r.json && Array.isArray(r.json.topics)) ? r.json.topics : null;
      if (!list || !list.length) {
        throw new Error('Konu listesi çözülemedi (' + (r.text || '').length.toLocaleString('tr-TR') + ' karakterlik yanıt)');
      }
      konulariYaz(list.filter(function (k) { return k && (k.title || k.title_tr); }));
      adim('sirala', 'done');
      konsolBitir();
      root.toast(_konular.length + ' konu bulundu — liste saklandı, tekrar arama gerekmez', 's');
    } catch (e) {
      konsolBitir(e.message || String(e));
      root.toast('Konu araması başarısız: ' + (e.message || e), 'e');
    } finally { clearInterval(tik); _konuYuk = false; topicBody(); }
  };

  /* Seçilen konu → BOŞ taslak aç ve yazdır.
     `blogNew()` şablon galerisi açıyordu; yapıyı MODELİN kurması gerekiyor
     (kullanıcının açık isteği), o yüzden doğrudan boş taslak. */
  ACT.topicPick = async function (e, i) {
    var k = (_konular || [])[i]; if (!k) return;
    kapat('bl_topic');
    await root.blogNew();
    await yaz(k);
  };

  // ── 2) YAZAR ────────────────────────────────────────────────────────────
  async function yaz(konu) {
    if (!S.editing) { root.toast('Önce bir makale aç', 'w'); return; }
    var k = typeof konu === 'string' ? { title: konu } : (konu || {});
    var baslik = k.title || k.title_tr || '';
    if (!baslik) { root.toast('Konu boş', 'w'); return; }
    konsolBaslat('✍️ Yazılıyor · ' + baslik.slice(0, 46), [
      ['ara', 'Güncel bilgi aranıyor (Google, küresel kaynaklar)'],
      ['en', 'İngilizce makale yazılıyor'],
      ['tr', 'Türkçe sürüm yazılıyor (aynı yapı, aynı ürünler)'],
      ['urun', 'Öğeler katalogda eşleştiriliyor'],
      ['gorsel', 'Görselsiz öğeler işaretleniyor (AI görsel ARAMAZ)'],
      ['qa', 'Düzen ve kalite kontrolü'],
    ]);
    try {
      // 1) ARAŞTIRMA — grounded, BİR KEZ. İki dil de aynı notları kullanır.
      adim('ara', 'run');
      var notlar = '';
      try {
        var r = await AI.grounded(AI.arastirmaPrompt(baslik), 4096);
        notlar = r.text;
        adim('ara', 'done', notlar.length.toLocaleString('tr-TR') + ' karakter not');
      } catch (err) { adim('ara', 'fail', err.message); root.toast('Araştırma atlandı: ' + (err.message || err), 'w'); }

      /* 2) YAZIM — DİL BAŞINA AYRI ÇAĞRI. Önce İNGİLİZCE (sitenin kök dili ve
         araştırmanın dili), sonra Türkçe sürüm onun AYNASI. Tek çağrıda iki
         dil istemek çıktının jeton sınırını aşmasına ve JSON'un yarıda
         kesilmesine yol açıyordu. */
      var yazDil = async function (lang, taban) {
        var d = await AI.callGeminiJson(AI.yazarPrompt(k, notlar, lang, taban), 32768);
        var L = d && (d.lang || (d.langs && d.langs[lang]));
        if (!L || !String(L.title || '').trim()) throw new Error(lang.toUpperCase() + ' başlığı üretilemedi');
        return { meta: d, L: L };
      };
      adim('en', 'run');
      var enS = await yazDil('en', null);
      adim('en', 'done');
      adim('tr', 'run');
      var trS = null;
      try { trS = await yazDil('tr', enS.meta); adim('tr', 'done'); } catch (err) {
        // Türkçe patlarsa İngilizce yazı KAYBOLMAZ.
        adim('tr', 'fail', err.message);
        root.toast('Türkçe sürüm üretilemedi: ' + (err.message || err) + ' — “TR→EN” ile sonra tamamlayabilirsin', 'w');
      }

      U.editorleriBosalt(); U.paneliOku();
      var yerlestir = function (c, L) {
        if (!L) return;
        var set = function (f, v) { if (v != null && String(v).trim()) S.editing[f] = String(v); };
        set('title_' + c, L.title);
        set('lead_' + c, L.lead);
        set('slug_' + c, C.slugify(L.slug || L.title || ''));
        set('metaTitle_' + c, L.metaTitle);
        set('metaDescription_' + c, L.metaDescription);
        set('tags_' + c, Array.isArray(L.tags) ? L.tags.join(', ') : L.tags);
        var body = L.body_html || L.body_md || L.body || '';
        if (body) S.editing['body_' + c] = C.toHtml(body);
        var concl = L.conclusion_html || L.conclusion_md || L.conclusion || '';
        if (concl) S.editing['conclusion_' + c] = C.toHtml(concl);
      };
      yerlestir('en', enS.L);
      if (trS) yerlestir('tr', trS.L);
      if (enS.meta.category) S.editing.category = enS.meta.category;
      S.editing.template = String(enS.meta.template || '').trim() || S.editing.template || '';

      /* ÖĞELER AYNI HATTAN GEÇER: katalog eşleştirme, görsel bulma ve sınır
         temizliği içe aktarmayla TEK kod yolunda kalsın. Blok metinleri dil
         başına geliyor; iki dilin öğeleri İNDEKSLE eşleşiyor çünkü Türkçe
         çağrı "aynı adet, aynı sıra" şartıyla yazılıyor. Uzunluk tutmazsa TR
         metni boş kalır, öğe KAYBOLMAZ ve durum kullanıcıya söylenir. */
      var items = Array.isArray(enS.meta.items) ? enS.meta.items : [];
      var trItems = (trS && Array.isArray(trS.meta.items)) ? trS.meta.items : [];
      var uyumlu = trItems.length === items.length;
      if (!uyumlu && trItems.length) {
        root.toast('Türkçe öğe sayısı tutmadı (' + trItems.length + ' ≠ ' + items.length + ') — TR metinleri boş bırakıldı', 'w');
      }
      adim('urun', 'run', items.length + ' öğe');
      if (items.length) {
        var norm = items.map(function (it, i) {
          var trIt = uyumlu ? (trItems[i] || {}) : {};
          var trB = Array.isArray(trIt.blocks) ? trIt.blocks : [];
          var kaynak = (Array.isArray(it.blocks) && it.blocks.length) ? it.blocks : [{ type: 'text', text: '' }];
          return {
            kind: it.kind || 'product', search: it.search || it.name || '',
            name: it.name || it.search || '', name_tr: trIt.name || '', name_en: it.name || '',
            brand: it.brand || '', site: it.site || '', link: it.link || '',
            blocks: kaynak.map(function (b, j) {
              var t = trB[j] || {};
              if ((b.type || b.t) === 'image') {
                return C.normalizeBlock({
                  t: 'image', url: '', pos: b.pos, size: b.size, w: b.w,
                  cap_tr: t.cap || t.cap_tr || '', cap_en: b.cap || b.cap_en || '',
                });
              }
              return C.normalizeBlock({ t: 'text', style: b.style, en: b.text || b.en || '', tr: t.text || t.tr || '' });
            }),
          };
        });
        var res = await AI.ogeleriIceAktar(norm);
        S.products = res.products;
        S.importReport = res.report;
        var bulunamadi = res.report.filter(function (x) { return !x.ok; }).length;
        adim('urun', 'done', bulunamadi ? (bulunamadi + ' öğe katalogda yok, özel öğe oldu') : 'hepsi eşleşti');
      } else adim('urun', 'done', 'öğe yok (konu henüz çıkmamış bir ürün olabilir)');

      C.sanitizeArticle(S.editing, S.products);
      S.srcMode = { body: false, concl: false };
      U.renderEditor(); P2.kirlet();

      adim('gorsel', 'run');
      if (items.length) {
        try {
          var g = await AI.resolveItemImages(S.products, S.lang, konsolNot);
          C.sanitizeArticle(S.editing, S.products);
          AI.autoPickCover(S.editing, S.products);
          var gorselsiz = S.products.filter(function (p) { return !C.itemHasImage(p); }).length;
          adim('gorsel', 'done', gorselsiz ? (gorselsiz + ' öğede görsel YOK — elle koyman gerekiyor') : 'tamam');
          U.renderEditor();
        } catch (err) { adim('gorsel', 'fail', err.message); }
      } else adim('gorsel', 'done');

      adim('qa', 'run');
      await qaCalistir(true);
      adim('qa', 'done');
      konsolBitir();
      root.toast('Taslak hazır — incele, gerekirse “✏️ Değiştir” ile komut ver', 's');
    } catch (e) {
      konsolBitir(e.message || String(e));
      root.toast('Yazı üretilemedi: ' + (e.message || e), 'e');
    }
  }

  // ── 3) KOMUTLA DEĞİŞİKLİK ───────────────────────────────────────────────
  ACT.cmdOpen = function () {
    modal('bl_cmd', '✏️ Yazıyı değiştir',
      '<p style="line-height:1.7;color:var(--text2);margin-top:0">Ne istediğini gündelik dille yaz. Model yazının tamamını görür ve '
      + '<b>yalnızca dokunduğu alanları</b> döndürür — beğendiğin bölümler yerinde kalır. Öğelere de dokunabilir '
      + '(“3. ürünü çıkar”), eklediği ürün katalog kapısından geçer.</p>'
      + '<textarea class="bl-in" id="bl_cmd_t" rows="4" placeholder="Örnek: Girişi iki paragrafa indir. SSS’ye iki soru daha ekle. 3. ürünü çıkar. Sonuca “kimin almaması gerekir” paragrafı koy."></textarea>'
      + '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">'
      + '<button class="bl-btn pri" data-bl="cmdRun">Uygula</button>'
      + '<span style="color:var(--text3);font-size:12px" id="bl_cmd_s"></span></div>', 720);
    var t = el('bl_cmd_t'); if (t) t.focus();
  };

  /* KONTROL LISTESINDEN KOMUTA. Denetim yalnizca metinsel sorunlari AI'a
     verir: eksik slug / kapak / kategori gibi ALAN sorunlarini model zaten
     duzeltemez (onlar sag raydaki kutulardan doldurulur) ve prompt'a
     konuldugunda modelin dikkatini dagitiyor. */
  ACT.hatalariDuzelt = function () {
    var liste = C.articleHealth(S.editing || {}, S.products)
      .filter(function (x) { return x.level !== 'info'; });
    // Alan sorunlari: modelin isi degil, kod/kullanici isi.
    var ALAN = /(slug|Kapak görseli|Kategori|Yayın tarihi|adresi|link)/i;
    var metinsel = liste.filter(function (x) { return !ALAN.test(x.text); });
    var alansal = liste.filter(function (x) { return ALAN.test(x.text); });
    ACT.cmdOpen();
    var ta = el('bl_cmd_t');
    if (!ta) return;
    ta.value = metinsel.length
      ? 'Aşağıdaki sorunları düzelt. Yalnızca sorunlu bölümlere dokun, gerisini olduğu gibi bırak:\n\n'
        + metinsel.map(function (x, k) { return (k + 1) + '. ' + x.text; }).join('\n')
      : '';
    var st = el('bl_cmd_s');
    if (st) {
      st.textContent = metinsel.length
        ? (metinsel.length + ' metin sorunu dolduruldu' + (alansal.length ? ' · ' + alansal.length + ' alan sorunu sağ raydan elle doldurulur' : ''))
        : (liste.length ? 'Kalan sorunlar metin değil alan sorunu — sağ raydaki kutulardan doldur.' : 'Denetimde sorun yok; yine de serbest komut yazabilirsin.');
    }
    ta.focus();
  };

  ACT.cmdRun = async function () {
    var ta = el('bl_cmd_t');
    var komut = ta ? ta.value.trim() : '';
    if (!komut) { root.toast('Önce ne istediğini yaz', 'w'); return; }
    var st = el('bl_cmd_s'); if (st) st.textContent = 'Uygulanıyor…';
    U.editorleriBosalt(); U.paneliOku();
    var a = S.editing;
    var mevcut = {
      tr: { title: a.title_tr || '', lead: a.lead_tr || '', body_html: a.body_tr || '', conclusion_html: a.conclusion_tr || '', metaTitle: a.metaTitle_tr || '', metaDescription: a.metaDescription_tr || '' },
      en: { title: a.title_en || '', lead: a.lead_en || '', body_html: a.body_en || '', conclusion_html: a.conclusion_en || '', metaTitle: a.metaTitle_en || '', metaDescription: a.metaDescription_en || '' },
      items: S.products.map(function (p, i) {
        return {
          i: i, name: C.itemName(p, 'tr') || p.name, kind: p.kind || 'product',
          text_tr: (p.blocks || []).filter(function (b) { return b.t === 'text'; }).map(function (b) { return b.tr; }).join('\n'),
        };
      }),
    };
    konsolBaslat('✏️ Komut uygulanıyor', [['ai', 'Model yazıyı okuyor ve değişikliği hazırlıyor'], ['uygula', 'Değişiklik uygulanıyor']]);
    try {
      adim('ai', 'run');
      var out = await AI.callGeminiJson(AI.komutPrompt(komut, mevcut), 32768);
      adim('ai', 'done');
      adim('uygula', 'run');
      var n = 0;
      var langs = (out && out.langs) || {};
      C.LANG_CODES.forEach(function (c) {
        var L = langs[c]; if (!L) return;
        var put = function (alan, v) { if (v == null || !String(v).trim()) return; S.editing[alan] = String(v); n += 1; };
        put('title_' + c, L.title); put('lead_' + c, L.lead);
        put('metaTitle_' + c, L.metaTitle); put('metaDescription_' + c, L.metaDescription);
        if (L.body_html) { S.editing['body_' + c] = L.body_html; n += 1; }
        if (L.conclusion_html) { S.editing['conclusion_' + c] = L.conclusion_html; n += 1; }
      });
      // ÖĞE İŞLEMLERİ — deterministik uygulanır, model yalnız işlemi söyler.
      var ops = Array.isArray(out && out.items) ? out.items : [];
      if (ops.length) {
        var r = AI.ogeIslemleriniUygula(S.products, ops, S.lang);
        S.products = r.products;
        n += r.log.length;
        r.log.forEach(konsolNot);
        if (r.eklenecek.length) {
          var eklendi = await AI.ogeleriIceAktar(r.eklenecek);
          S.products = S.products.concat(eklendi.products);
          S.importReport = eklendi.report;
          eklendi.report.forEach(function (x) { konsolNot(x.label); });
          n += eklendi.products.length;
        }
      }
      adim('uygula', 'done', n + ' değişiklik');
      konsolBitir();
      if (!n) { root.toast('Model hiçbir alanı değiştirmedi' + (out && out.note ? ' — ' + out.note : ''), 'w'); if (st) st.textContent = ''; return; }
      kapat('bl_cmd');
      C.sanitizeArticle(S.editing, S.products);
      S.srcMode = { body: false, concl: false };
      U.renderEditor(); P2.kirlet();
      root.toast((out.note ? out.note + ' · ' : '') + n + ' değişiklik uygulandı', 's');
    } catch (e) {
      konsolBitir(e.message || String(e));
      if (st) st.textContent = '';
      root.toast('Uygulanamadı: ' + (e.message || e), 'e');
    }
  };

  // ── 4) DÜZEN & KALİTE ───────────────────────────────────────────────────
  ACT.qaRun = function () { qaCalistir(false); };

  async function qaCalistir(auto) {
    U.editorleriBosalt(); U.paneliOku();
    if (!S.products.length && !(S.editing['body_' + S.lang] || '').trim()) {
      if (!auto) root.toast('Önce içerik ekle', 'w');
      return;
    }
    var btn = el('bl_qa_btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ İnceleniyor…'; }
    if (!auto) konsolBaslat('🤖 Düzen & kontrol', [
      ['gorsel', 'Görselsiz öğeler işaretleniyor'],
      ['duzen', 'Görsellerin yeri ve boyutu metne göre ayarlanıyor'],
      ['cop', 'Başıboş kaynak adı satırları temizleniyor'],
    ]);
    var gorselBulundu = 0;
    var kapak = '';
    try {
      if (!auto) adim('gorsel', 'run');
      var res = await AI.resolveItemImages(S.products, S.lang, konsolNot);
      gorselBulundu = res.filled || 0;
      if (gorselBulundu) C.sanitizeArticle(S.editing, S.products);
      kapak = AI.autoPickCover(S.editing, S.products);
      if (!auto) adim('gorsel', 'done', res.pending ? (res.pending + ' öğeye elle görsel gerekiyor') : 'hepsinde görsel var');
    } catch (_) { if (!auto) adim('gorsel', 'fail'); }

    try {
      if (!auto) adim('duzen', 'run');
      var out = await AI.callGeminiJson(AI.qaPrompt(C.articleOutline(S.editing, S.products, S.lang)), 8000);
      if (out.template) S.editing.template = String(out.template).trim();
      var uygulanan = 0;
      (out.layout || []).forEach(function (L) {
        var p = S.products[Number(L.i)]; if (!p) return;
        C.ensureBlocks(p);
        var img = p.blocks.find(function (b) { return b.t === 'image' && b.url; });
        if (!img) return;
        if (C.IMG_POS.indexOf(L.pos) >= 0) img.pos = L.pos;
        if (C.IMG_SIZES.indexOf(L.size) >= 0) img.size = L.size;
        uygulanan += 1;
      });
      if (!auto) adim('duzen', 'done', uygulanan + ' görsel yerleştirildi');

      /* KAYNAK ADI TEMİZLİĞİ: adayları KOD çıkarır, AI yalnız sınıflandırır.
         Listede olmayan bir metin asla silinemez → gerçek içerik kaybolmaz. */
      if (!auto) adim('cop', 'run');
      var silinen = 0;
      var adaylar = C.junkCandidates(S.editing, S.products);
      var junk = [];
      if (adaylar.length) {
        try {
          var jo = await AI.callGeminiJson(AI.junkPrompt(adaylar), 4000);
          var izin = new Set(adaylar.map(function (s) { return s.toLowerCase(); }));
          junk = (Array.isArray(jo.junk) ? jo.junk : []).map(function (s) { return String(s || '').trim(); })
            .filter(function (s) { return izin.has(s.toLowerCase()); });
        } catch (_) { junk = []; }
      }
      if (junk.length) {
        var jset = new Set(junk.map(function (s) { return s.toLowerCase(); }));
        var temiz = function (txt) {
          return String(txt || '').split(/\r?\n/).filter(function (line) {
            if (!jset.has(line.trim().toLowerCase())) return true;
            silinen += 1; return false;
          }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
        };
        S.products.forEach(function (p) {
          C.ensureBlocks(p);
          p.blocks.forEach(function (b) {
            if (b.t !== 'text') return;
            C.LANG_CODES.forEach(function (c) { if (b[c]) b[c] = temiz(b[c]); });
          });
        });
        var temizHtml = function (html) {
          return String(html || '').replace(/<p>([\s\S]*?)<\/p>/gi, function (m0, inner) {
            if (jset.has(C.duzMetin(inner).toLowerCase())) { silinen += 1; return ''; }
            return m0;
          });
        };
        C.LANG_CODES.forEach(function (c) {
          if (S.editing['body_' + c]) S.editing['body_' + c] = temizHtml(S.editing['body_' + c]);
          if (S.editing['conclusion_' + c]) S.editing['conclusion_' + c] = temizHtml(S.editing['conclusion_' + c]);
        });
      }
      if (!auto) adim('cop', 'done', silinen ? (silinen + ' satır silindi') : 'temiz');

      S.qaReport = {
        verdict: out.verdict || '',
        aiIssues: (Array.isArray(out.issues) ? out.issues : []).map(function (x) {
          return { level: ['error', 'warn', 'info'].indexOf(x.level) >= 0 ? x.level : 'info', text: String(x.text || '') };
        }),
        applied: uygulanan, removed: silinen, imagesFilled: gorselBulundu, coverPicked: kapak,
      };
      U.renderEditor(); P2.kirlet();
      if (!auto) konsolBitir();
      var kritik = C.articleHealth(S.editing, S.products).filter(function (x) { return x.level === 'error'; }).length;
      root.toast('Düzen kuruldu (' + uygulanan + ' görsel)'
        + (gorselBulundu ? ' · ' + gorselBulundu + ' görsel bulundu' : '')
        + (silinen ? ' · ' + silinen + ' kaynak artığı silindi' : '')
        + (kritik ? ' · ' + kritik + ' kritik sorun' : ''), kritik ? 'w' : 's');
    } catch (e) {
      // AI erişilemese bile YAPISAL denetim çalışır — sorunlar gizli kalmaz.
      S.qaReport = { verdict: 'Yapay zekâya ulaşılamadı; yapısal denetim yine de yapıldı.', aiIssues: [], applied: 0, removed: 0, imagesFilled: gorselBulundu, coverPicked: kapak };
      if (!auto) konsolBitir(e.message || String(e));
      if (gorselBulundu || kapak) U.renderEditor(); else P2.ctxYenile();
      root.toast('AI kontrolü başarısız (' + e.message + ') — yapısal denetim yapıldı', 'w');
    } finally {
      var b2 = el('bl_qa_btn');
      if (b2) { b2.disabled = false; b2.textContent = '🤖 Düzen & kontrol'; }
    }
  }

  // ── 5) ÇEVİRİ ───────────────────────────────────────────────────────────
  ACT.ceviri = async function () {
    if (!confirm('TR içerik EN diline çevrilecek.\n\nHedef dildeki MEVCUT metinlerin üzerine yazılır. Devam edilsin mi?')) return;
    U.editorleriBosalt(); U.paneliOku();
    var a = S.editing;
    if (!(a.title_tr || '').trim()) { root.toast('TR başlık boşken çeviri yapılamaz', 'w'); return; }
    var payload = { title: a.title_tr || '', lead: a.lead_tr || '', body_html: a.body_tr || '', conclusion_html: a.conclusion_tr || '', metaTitle: a.metaTitle_tr || '', metaDescription: a.metaDescription_tr || '', tags: a.tags_tr || '', items: [] };
    S.products.forEach(function (p, i) {
      var item = { i: i, blocks: [] };
      if ((p.kind || 'product') === 'custom') item.name = p.name_tr || p.name || '';
      (p.blocks || []).forEach(function (b, j) {
        if (b.t === 'text' && String(b.tr || '').trim()) item.blocks.push({ j: j, kind: 'text', text: b.tr });
        if (b.t === 'image' && String(b.cap_tr || '').trim()) item.blocks.push({ j: j, kind: 'cap', text: b.cap_tr });
      });
      if (item.name || item.blocks.length) payload.items.push(item);
    });
    konsolBaslat('🌍 TR → EN çeviriliyor', [['ai', 'Metinler çevriliyor'], ['uygula', 'Yerine yazılıyor']]);
    try {
      adim('ai', 'run');
      var out = await AI.callGeminiJson(AI.ceviriPrompt(payload, 'en'), 32768);
      adim('ai', 'done');
      adim('uygula', 'run');
      var set = function (f, v) { if (v != null && String(v).trim()) a[f + '_en'] = String(v); };
      set('title', out.title); set('lead', out.lead);
      set('body', out.body_html); set('conclusion', out.conclusion_html);
      set('metaTitle', out.metaTitle); set('metaDescription', out.metaDescription);
      set('tags', Array.isArray(out.tags) ? out.tags.join(', ') : out.tags);
      (out.items || []).forEach(function (it) {
        var p = S.products[it.i]; if (!p) return;
        if (it.name && (p.kind || 'product') === 'custom') p.name_en = String(it.name);
        (it.blocks || []).forEach(function (b) {
          var blk = (p.blocks || [])[b.j]; if (!blk) return;
          if (b.kind === 'cap') blk.cap_en = String(b.text || '');
          else if (blk.t === 'text') blk.en = String(b.text || '');
        });
      });
      adim('uygula', 'done');
      konsolBitir();
      C.sanitizeArticle(a, S.products);
      S.srcMode = { body: false, concl: false };
      U.renderEditor(); P2.kirlet();
      root.toast('Çeviri bitti — EN sekmesinden kontrol et ve kaydet', 's');
    } catch (e) {
      konsolBitir(e.message || String(e));
      root.toast('Çeviri başarısız: ' + (e.message || e), 'e');
    }
  };

  // ── 6) İÇE AKTARMA ──────────────────────────────────────────────────────
  ACT.importOpen = function () {
    modal('bl_imp', '📥 Makale içe aktar',
      '<div class="bl-tabs">'
      + '<button class="bl-btn on" data-bl="impTab" data-v="auto">🪄 Akıllı — ne yapıştırırsan</button>'
      + '<button class="bl-btn" data-bl="impTab" data-v="md">📝 Markdown (' + S.lang.toUpperCase() + ')</button>'
      + '<button class="bl-btn" data-bl="impTab" data-v="json">🧩 JSON şeması</button>'
      + '<button class="bl-btn" data-bl="impTab" data-v="prompt">✨ Claude prompt’u</button>'
      + '</div><div id="bl_imp_govde"></div>');
    impTab('auto');
  };
  ACT.impTab = function (e, i, j, v) {
    document.querySelectorAll('#bl_imp .bl-tabs .bl-btn').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
    impTab(v);
  };
  function impTab(t) {
    var box = el('bl_imp_govde'); if (!box) return;
    if (t === 'auto') {
      box.innerHTML = '<div class="bl-note">Metni <b>olduğu gibi</b> yapıştır — biçimi hiç önemli değil. Başlıklı bölümler, '
        + '“TITLE:/SLUG:” etiketleri, iki dil arka arkaya, düz markdown, dağınık not… yapay zekâ okuyup doğru alanlara yerleştirir '
        + 've <b>ürün bölümlerini katalogla eşleştirir</b>.</div>'
        + '<textarea id="bl_imp_auto" class="bl-ta" placeholder="Metni buraya yapıştır…"></textarea>'
        + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:10px 0;font-size:12.5px">'
        + '<label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="bl_imp_replace" checked> Mevcut içeriğin üzerine yaz</label>'
        + '<label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="bl_imp_nolinks" checked> Kaynak/atıf linklerini temizle</label>'
        + '<span style="color:var(--text3)">Uzun metinlerde 20-60 saniye sürebilir.</span></div>'
        + '<button class="bl-btn pri" data-bl="impAuto">🪄 Oku ve makaleye dönüştür</button>';
    } else if (t === 'md') {
      box.innerHTML = '<div class="bl-note"><b># Başlık</b> → başlık, ilk paragraf → özet, <b>## 1. Ürün Adı</b> bölümleri → öğe '
        + '(katalogdan otomatik eşleştirilir), <b>## Sonuç</b> → bitiş yazısı olur. Tablolar desteklenir.</div>'
        + '<textarea id="bl_imp_md" class="bl-ta" placeholder="# 2026’nın En İyi 5 Telefonu&#10;&#10;Kısa özet…&#10;&#10;## 1. iPhone 17&#10;Açıklama…&#10;&#10;## Sonuç&#10;…"></textarea>'
        + '<div style="margin:10px 0;font-size:12.5px"><label style="display:inline-flex;gap:6px;align-items:center">'
        + '<input type="checkbox" id="bl_imp_mdreplace" checked> Mevcut ' + S.lang.toUpperCase() + ' içeriğin üzerine yaz</label></div>'
        + '<button class="bl-btn pri" data-bl="impMd">İçe aktar → ' + S.lang.toUpperCase() + '</button>';
    } else if (t === 'json') {
      box.innerHTML = '<div class="bl-note">“Claude prompt’u” sekmesindeki şablonla üretilen JSON’u yapıştır — <b>iki dil + öğeler</b> '
        + 'tek seferde dolar. Ürünler katalogdan eşleştirilir; bulunamayanlar özel öğe olur.</div>'
        + '<textarea id="bl_imp_json" class="bl-ta" placeholder=\'{"category":"smartphones","langs":{"tr":{…},"en":{…}},"items":[…]}\'></textarea>'
        + '<div style="margin:10px 0;font-size:12.5px"><label style="display:inline-flex;gap:6px;align-items:center">'
        + '<input type="checkbox" id="bl_imp_jreplace" checked> Mevcut içeriğin üzerine yaz</label></div>'
        + '<button class="bl-btn pri" data-bl="impJson">İçe aktar (2 dil)</button>';
    } else {
      box.innerHTML = '<div class="bl-note">Bu prompt’u kopyala → Claude’a yapıştır → <b>[KONU]</b> kısmına makale konusunu yaz. '
        + 'Dönen JSON’u “JSON şeması” sekmesinden içe aktar.</div>'
        + '<textarea id="bl_imp_prompt" class="bl-ta" readonly style="min-height:360px">' + esc(AI.claudePrompt(S.cats)) + '</textarea>'
        + '<div style="margin-top:10px"><button class="bl-btn pri" data-bl="impCopy">📋 Prompt’u kopyala</button></div>';
    }
  }
  ACT.impCopy = function () {
    var ta = el('bl_imp_prompt'); if (!ta) return;
    ta.select();
    try { navigator.clipboard.writeText(ta.value); } catch (_) { document.execCommand('copy'); }
    root.toast('Prompt kopyalandı — Claude’a yapıştır', 's');
  };

  // Ortak yerleştirme: dört içe aktarma yolu da bu kapıdan geçer.
  function dilYerlestir(c, L, replace, temizle) {
    var set = function (f, v) { if (v != null && String(v).trim() && (replace || !S.editing[f])) S.editing[f] = String(v); };
    set('title_' + c, L.title);
    set('lead_' + c, L.lead);
    set('slug_' + c, C.slugify(L.slug || L.title || ''));
    set('metaTitle_' + c, L.metaTitle);
    set('metaDescription_' + c, L.metaDescription);
    set('tags_' + c, Array.isArray(L.tags) ? L.tags.join(', ') : L.tags);
    var body = L.body_html || L.body_md || L.body || '';
    if (body && (replace || !S.editing['body_' + c])) S.editing['body_' + c] = temizle(C.toHtml(body));
    var concl = L.conclusion_html || L.conclusion_md || L.conclusion || '';
    if (concl && (replace || !S.editing['conclusion_' + c])) S.editing['conclusion_' + c] = temizle(C.toHtml(concl));
  }

  function hamOgeleriNormalize(items) {
    return items.map(function (it) {
      return {
        kind: it.kind || 'product', search: it.search || it.name || '', name: it.name || it.search || '',
        name_tr: it.name_tr, name_en: it.name_en, brand: it.brand || '', site: it.site || '',
        link: it.link || '', image: it.image || '',
        blocks: (Array.isArray(it.blocks) && it.blocks.length ? it.blocks : [{ type: 'text', tr: '', en: '' }])
          .map(function (b) { return C.normalizeBlock(b); }),
      };
    });
  }

  async function ogeleriYerlestir(items, replace) {
    if (!items.length) return;
    var res = await AI.ogeleriIceAktar(hamOgeleriNormalize(items));
    S.products = replace ? res.products : S.products.concat(res.products);
    S.importReport = res.report;
    res.report.forEach(function (x) { konsolNot(x.label); });
  }

  ACT.impAuto = async function () {
    var ta = el('bl_imp_auto');
    var raw = ta ? ta.value.trim() : '';
    if (!raw) { root.toast('Önce metni yapıştır', 'w'); return; }
    var replace = (el('bl_imp_replace') || {}).checked !== false;
    var noLinks = (el('bl_imp_nolinks') || {}).checked !== false;
    konsolBaslat('🪄 Akıllı içe aktarma', [
      ['coz', 'Metin şemaya çevriliyor'], ['oge', 'Öğeler katalogda eşleştiriliyor'],
      ['gorsel', 'Görselsiz öğeler işaretleniyor'],
    ]);
    try {
      adim('coz', 'run', raw.length.toLocaleString('tr-TR') + ' karakter');
      // Kaynak atıfları modele HİÇ gitmesin.
      var feed = noLinks ? C.stripSourcesFromRaw(raw) : raw;
      var data = await AI.callGeminiJson(AI.autoSchemaPrompt(feed), 60000);
      var langs = data.langs || {};
      var dolu = C.LANG_CODES.filter(function (c) { return langs[c] && String(langs[c].title || '').trim(); });
      if (!dolu.length) throw new Error('Metinden başlık çıkarılamadı — metni kontrol et');
      adim('coz', 'done', dolu.map(function (c) { return c.toUpperCase(); }).join(' + '));
      U.editorleriBosalt(); U.paneliOku();
      var temizle = function (h) { return noLinks ? C.stripCitationLinks(h) : h; };
      dolu.forEach(function (c) { dilYerlestir(c, langs[c], replace, temizle); });
      if (data.category && (replace || !S.editing.category)) S.editing.category = data.category;
      S.editing.template = String(data.template || '').trim() || S.editing.template || '';

      var items = Array.isArray(data.items) ? data.items : [];
      adim('oge', 'run', items.length + ' öğe');
      await ogeleriYerlestir(items, replace);
      adim('oge', 'done');
      kapat('bl_imp');
      C.sanitizeArticle(S.editing, S.products);
      S.srcMode = { body: false, concl: false };
      U.renderEditor(); P2.kirlet();

      adim('gorsel', 'run');
      if (items.length) {
        try {
          await AI.resolveItemImages(S.products, S.lang, konsolNot);
          C.sanitizeArticle(S.editing, S.products);
          AI.autoPickCover(S.editing, S.products);
          U.renderEditor();
        } catch (_) { /* görselsiz devam */ }
      }
      adim('gorsel', 'done');
      konsolBitir();
      root.toast('İçe aktarıldı — ' + dolu.map(function (c) { return c.toUpperCase(); }).join('/') + ' · ' + items.length + ' öğe', 's');
      if (items.length) await qaCalistir(true);
    } catch (e) {
      konsolBitir(e.message || String(e));
      root.toast('İçe aktarma başarısız: ' + (e.message || e), 'e');
    }
  };

  ACT.impMd = async function () {
    var ta = el('bl_imp_md');
    if (!ta || !ta.value.trim()) { root.toast('Önce markdown yapıştır', 'w'); return; }
    var replace = (el('bl_imp_mdreplace') || {}).checked !== false;
    var c = S.lang;
    var parsed = C.parseMdArticle(ta.value, {});
    U.editorleriBosalt(); U.paneliOku();
    if (parsed.title && (replace || !S.editing['title_' + c])) S.editing['title_' + c] = parsed.title;
    if (parsed.lead && (replace || !S.editing['lead_' + c])) S.editing['lead_' + c] = parsed.lead;
    if (parsed.bodyMd && (replace || !S.editing['body_' + c])) S.editing['body_' + c] = C.mdToHtml(parsed.bodyMd);
    if (parsed.conclusionMd && (replace || !S.editing['conclusion_' + c])) S.editing['conclusion_' + c] = C.mdToHtml(parsed.conclusionMd);
    if (!S.editing['slug_' + c] && parsed.title) S.editing['slug_' + c] = C.slugify(parsed.title);
    kapat('bl_imp');
    if (parsed.items.length) {
      konsolBaslat('📝 Markdown içe aktarma', [['oge', 'Öğeler katalogda eşleştiriliyor']]);
      adim('oge', 'run', parsed.items.length + ' öğe');
      await ogeleriYerlestir(parsed.items.map(function (it) {
        return { kind: 'product', search: it.name, name: it.name, blocks: C.mdSectionToBlocks(it.md, c) };
      }), replace);
      adim('oge', 'done');
      konsolBitir();
    }
    C.sanitizeArticle(S.editing, S.products);
    S.srcMode = { body: false, concl: false };
    U.renderEditor(); P2.kirlet();
    root.toast('İçe aktarma tamam — kontrol et ve kaydet', 's');
  };

  ACT.impJson = async function () {
    var ta = el('bl_imp_json');
    if (!ta || !ta.value.trim()) { root.toast('Önce JSON yapıştır', 'w'); return; }
    var raw = ta.value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    var data;
    try { data = JSON.parse(raw); } catch (e) { root.toast('JSON çözülemedi: ' + e.message, 'e'); return; }
    var replace = (el('bl_imp_jreplace') || {}).checked !== false;
    U.editorleriBosalt(); U.paneliOku();
    var langs = data.langs || data;
    var dolu = C.LANG_CODES.filter(function (c) { return langs[c] && typeof langs[c] === 'object'; });
    if (!dolu.length) { root.toast('JSON içinde tr/en bulunamadı — şemayı kontrol et', 'e'); return; }
    dolu.forEach(function (c) { dilYerlestir(c, langs[c], replace, function (h) { return h; }); });
    if (data.category) S.editing.category = data.category;
    if (data.cover) S.editing.cover = data.cover;
    kapat('bl_imp');
    var items = Array.isArray(data.items) ? data.items : [];
    if (items.length) {
      konsolBaslat('🧩 JSON içe aktarma', [['oge', 'Öğeler eşleştiriliyor'], ['gorsel', 'Eksik görseller aranıyor']]);
      adim('oge', 'run', items.length + ' öğe');
      await ogeleriYerlestir(items, replace);
      adim('oge', 'done');
      C.sanitizeArticle(S.editing, S.products);
      U.renderEditor();
      adim('gorsel', 'run');
      try {
        await AI.resolveItemImages(S.products, S.lang, konsolNot);
        C.sanitizeArticle(S.editing, S.products);
        AI.autoPickCover(S.editing, S.products);
      } catch (_) { /* görselsiz devam */ }
      adim('gorsel', 'done');
      konsolBitir();
    }
    C.sanitizeArticle(S.editing, S.products);
    S.srcMode = { body: false, concl: false };
    U.renderEditor(); P2.kirlet();
    root.toast('JSON içe aktarma tamam — iki dili de kontrol et', 's');
  };

  root.BlogFlows = {
    konsolYaz: konsolYaz, konsolNot: konsolNot, yaz: yaz, qaCalistir: qaCalistir,
    konulariOku: konulariOku,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
