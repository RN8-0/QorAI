// ══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — BLOG ARAYÜZÜ, İKİNCİ PARÇA
//    · sol ray  : ANAHAT (yapı haritası + sürükleme hedefi)
//    · sağ ray  : AI konsolu · yayın+SEO · kontrol · yorumlar
//    · sürükle-bırak bağlama
//    · otokayıt + çökme yedeği
//    · kaydetme (SLUG KOPMA UYARISI dahil) · önizleme · yorumlar
//
//  blog_ui.js ile AYNI `S` durumunu paylaşır (root.BlogUI.S).
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  var C = root.BlogCore;
  var AI = root.BlogAi;
  var D = root.BlogDnd;
  var U = root.BlogUI;
  if (!U) throw new Error('blog_ui2.js: blog_ui.js ÖNCE yüklenmeli');

  var S = U.S;
  var esc = C.esc;
  var el = U.el;
  var P2 = root.BlogUI2;
  var SITE = 'https://qorai.net';

  // ── SOL RAY: ANAHAT ─────────────────────────────────────────────────────
  /* Yalnızca bir içindekiler DEĞİL, birinci sınıf BIRAKMA HEDEFİ.
     Altı öğeli bir yazıyı hiç kaydırmadan yeniden diziyorsun — bu ekranın
     imza öğesi bu. Aynı `data-drop="item"` niteliği tuvalde de var, yani
     sürükleme kodu iki yüzeyi ayırt etmek zorunda değil. */
  P2.renderOutline = function () {
    var box = el('bl_out'); if (!box || !S.editing) return;
    var a = S.editing; var c = S.lang;
    var bas = function (html, tur) {
      return C.basliklar(html).map(function (h) {
        return '<div class="bl-out-i sub" data-bl="git" data-v="' + tur + '"><span class="lbl' + (h.soru ? ' bl-out-q' : '') + '">'
          + (h.soru ? '? ' : '') + esc(h.text) + '</span></div>';
      }).join('');
    };
    var faq = C.faqDurumu(a, c);
    box.innerHTML = '<div class="bl-out">'
      + '<div class="bl-out-g"><h5>Yazı</h5>'
      + '<div class="bl-out-i" data-bl="git" data-v="cover"><span class="lbl">Kapak</span>'
      + (a.cover || a.coverFile ? '' : '<span class="bdg warn">yok</span>') + '</div>'
      + '<div class="bl-out-i" data-bl="git" data-v="title"><span class="lbl">Başlık + özet</span></div>'
      + '<div class="bl-out-i" data-bl="git" data-v="body"><span class="lbl">Giriş</span>'
      + '<span class="bdg bl-num">' + C.wordCount(C.duzMetin(a['body_' + c])) + ' kl</span></div>'
      + bas(a['body_' + c], 'body')
      + '</div>'
      + '<div class="bl-out-g"><h5>Öğeler · ' + S.products.length + '</h5>'
      + (S.products.length ? S.products.map(function (p, i) {
        var metin = (p.blocks || []).filter(function (b) { return b.t === 'text'; })
          .map(function (b) { return b[c] || ''; }).join(' ');
        var gorsel = (p.blocks || []).some(function (b) { return b.t === 'image' && b.url; });
        var oteki = c === 'tr' ? 'en' : 'tr';
        var otekiBos = !(p.blocks || []).some(function (b) { return b.t === 'text' && (b[oteki] || '').trim(); });
        return '<div class="bl-out-i" data-drop="item" data-i="' + i + '" data-bl="git" data-v="item:' + i + '">'
          + '<button class="bl-grip" data-grip="item" data-i="' + i + '" data-label="' + esc(U.gorunenAd(p, c)) + '" title="Sürükle" aria-label="Öğeyi taşı">⠿</button>'
          + '<span class="n bl-num">' + (i + 1) + '</span>'
          + '<span class="lbl">' + esc(U.gorunenAd(p, c) || 'Adsız öğe') + '</span>'
          + '<span class="bdg' + (gorsel ? '' : ' warn') + '">' + (gorsel ? '🖼' : '○') + '</span>'
          + '<span class="bdg' + (otekiBos ? ' warn' : '') + '">' + oteki.toUpperCase() + '</span>'
          + '<span class="bdg bl-num">' + C.wordCount(metin) + '</span></div>';
      }).join('') : '<div class="bl-out-i" style="opacity:.6"><span class="lbl">Öğe yok</span></div>')
      + '</div>'
      + '<div class="bl-out-g"><h5>Sonuç</h5>'
      + '<div class="bl-out-i" data-bl="git" data-v="concl"><span class="lbl">Bitiş yazısı</span>'
      + '<span class="bdg bl-num">' + C.wordCount(C.duzMetin(a['conclusion_' + c])) + ' kl</span></div>'
      + bas(a['conclusion_' + c], 'concl')
      + '<div class="bl-out-i" title="FAQPage yapısal verisi bu sorulardan üretiliyor">'
      + '<span class="lbl">SSS</span><span class="bdg' + (faq.count ? '' : ' warn') + ' bl-num">'
      + faq.count + ' soru</span></div>'
      + '</div></div>';
  };

  root.BlogUI.ACT.git = function (e, i, j, v) {
    var hedef;
    if (v && v.indexOf('item:') === 0) hedef = document.querySelectorAll('.bl-item')[Number(v.slice(5))];
    else hedef = { cover: '.bl-cover', title: '#bl_title', body: '#bl_body_wrap', concl: '#bl_concl_wrap' }[v];
    var n = typeof hedef === 'string' ? document.querySelector(hedef) : hedef;
    if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── SAĞ RAY: BAĞLAM ─────────────────────────────────────────────────────
  P2.renderCtx = function () {
    var box = el('bl_ctx'); if (!box || !S.editing) return;
    var a = S.editing; var c = S.lang;
    box.innerHTML =
      '<div class="bl-card"><h4>AI konsolu</h4><div id="bl_ai" class="bl-ai"></div></div>'
      + '<div class="bl-card"><h4>Yayın</h4>'
      + '<div class="bl-f"><label class="bl-lbl">Durum</label><select class="bl-in" id="bl_status" data-blc="durum">'
      + '<option value="draft"' + (a.status !== 'published' ? ' selected' : '') + '>Taslak</option>'
      + '<option value="published"' + (a.status === 'published' ? ' selected' : '') + '>Yayında</option></select></div>'
      + '<div class="bl-f"><label class="bl-lbl">Yayın tarihi</label><input class="bl-in bl-num" id="bl_pub" type="datetime-local" value="' + esc(a.publishedAt || '') + '" data-bli="alan" /></div>'
      + '<div class="bl-f"><label class="bl-lbl">Kategori</label><input class="bl-in" id="bl_cat" list="bl_cats" value="' + esc(a.category || '') + '" placeholder="kategori seç ya da yaz" data-bli="alan" />'
      + '<datalist id="bl_cats">' + S.cats.map(function (x) { return '<option value="' + esc(x) + '"></option>'; }).join('') + '</datalist></div>'
      + '<div class="bl-f"><label class="bl-lbl">Yazar <span style="opacity:.6;text-transform:none">(opsiyonel)</span></label><input class="bl-in" id="bl_author" value="' + esc(a.author || '') + '" data-bli="alan" /></div>'
      + '</div>'
      + '<div class="bl-card"><h4>SEO · ' + c.toUpperCase() + '</h4>'
      + '<div class="bl-serp"><div class="u" id="bl_serp_u"></div><span class="t" id="bl_serp_t"></span><div class="d" id="bl_serp_d"></div></div>'
      + '<div class="bl-f"><label class="bl-lbl">Slug · ' + c.toUpperCase() + '<span class="bl-cnt" id="bl_slugw"></span></label>'
      + '<input class="bl-in" id="bl_slug" value="' + esc(a['slug_' + c] || '') + '" placeholder="' + (c === 'en' ? 'best-phones-2026' : 'en-iyi-telefonlar-2026') + '" data-bli="slug" /></div>'
      + '<div class="bl-f"><label class="bl-lbl">Meta title<span class="bl-cnt" id="bl_cnt_mt"></span></label>'
      + '<input class="bl-in" id="bl_metaTitle" value="' + esc(a['metaTitle_' + c] || '') + '" data-bli="seo" /></div>'
      + '<div class="bl-f"><label class="bl-lbl">Meta description<span class="bl-cnt" id="bl_cnt_md"></span></label>'
      + '<textarea class="bl-in" id="bl_metaDescription" rows="3" data-bli="seo">' + esc(a['metaDescription_' + c] || '') + '</textarea></div>'
      + '<div class="bl-f"><label class="bl-lbl">Etiketler <span style="opacity:.6;text-transform:none">(virgülle)</span></label>'
      + '<input class="bl-in" id="bl_tags" value="' + esc(a['tags_' + c] || '') + '" data-bli="seo" /></div>'
      + '</div>'
      + '<div class="bl-card"><h4>Kontrol</h4><div id="bl_health"></div>'
      /* SORUNU GORUP DUZELTEMEMEK ISE YARAMAZ. Denetim listesi tek basina bir
         is listesi degil; bu dugme sorunlari komut kutusuna DOLDURUP aciyor,
         yani "gordum -> duzelt" tek tikla. */
      + '<div style="margin-top:10px;display:flex;gap:7px;flex-wrap:wrap">'
      + '<button class="bl-btn sm" data-bl="hatalariDuzelt" title="Listelenen sorunları yapay zekâya düzelttir">🤖 Sorunları AI ile düzelt</button>'
      + '<button class="bl-btn sm" data-bl="cmdOpen" title="Serbest komut yaz">✏️ Serbest komut</button>'
      + '</div></div>'
      + '<div class="bl-card"><h4>Yorumlar</h4><div id="bl_comments" style="font-size:12.5px;color:var(--text3)">'
      + (a.id ? 'Yükleniyor…' : 'Önce makaleyi kaydet.') + '</div></div>';
    P2.serpYaz(); P2.ctxYenile();
  };

  // Sayaçlar + sağlık listesi — her tuşta yeniden çizilir, tam liste değil.
  P2.ctxYenile = function () {
    var a = S.editing; if (!a) return;
    var c = S.lang;
    var g = function (id, f) { var e = el(id); return e ? e.value : (a[f + '_' + c] || ''); };
    var say = function (id, len, max) {
      var e = el(id); if (!e) return;
      e.textContent = len + '/' + max;
      e.classList.toggle('bad', len > max);
    };
    say('bl_cnt_mt', (g('bl_metaTitle', 'metaTitle') || g('bl_title', 'title')).length, C.META_TITLE_MAX);
    say('bl_cnt_md', (g('bl_metaDescription', 'metaDescription') || g('bl_lead', 'lead')).length, C.META_DESC_MAX);
    var sw = el('bl_slugw');
    if (sw) {
      // SLUG DEĞİŞİKLİĞİ = SESSİZ VERİ KAYBI (875 olay + yorumlar slug'a bağlı).
      var eski = a._slugKayitli || '';
      var yeni = C.slugify(g('bl_slug', 'slug') || a['title_' + c] || '');
      var kopar = c === 'tr' && eski && yeni && eski !== yeni;
      sw.textContent = kopar ? '⚠ adres değişiyor' : '';
      sw.classList.toggle('bad', kopar);
    }
    var h = el('bl_health');
    if (h) {
      var liste = C.articleHealth(a, S.products);
      var ic = { error: '⛔', warn: '⚠', info: 'ℹ' };
      h.innerHTML = liste.length
        ? liste.map(function (x) { return '<div class="bl-issue ' + x.level + '"><span class="ic">' + ic[x.level] + '</span><span>' + esc(x.text) + '</span></div>'; }).join('')
        : '<div class="bl-issue ok"><span class="ic">✓</span><span>Yayına engel bir sorun yok.</span></div>';
      if (S.qaReport && S.qaReport.verdict) {
        h.innerHTML = '<div style="font-size:12.5px;color:var(--text2);line-height:1.6;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">🤖 '
          + esc(S.qaReport.verdict) + '</div>'
          + (S.qaReport.aiIssues || []).map(function (x) { return '<div class="bl-issue ' + x.level + '"><span class="ic">🤖</span><span>' + esc(x.text) + '</span></div>'; }).join('')
          + h.innerHTML;
      }
    }
  };

  P2.serpYaz = function () {
    var a = S.editing; if (!a) return;
    var c = S.lang;
    var g = function (id) { var e = el(id); return e ? e.value : ''; };
    var t = (g('bl_metaTitle') || g('bl_title') || a['metaTitle_' + c] || a['title_' + c] || 'Makale başlığı').slice(0, 65);
    var d = (g('bl_metaDescription') || g('bl_lead') || a['metaDescription_' + c] || a['lead_' + c] || 'Meta açıklama ya da kısa özet burada görünür.').slice(0, 170);
    var s = C.slugify(g('bl_slug') || a['slug_' + c] || g('bl_title') || a['title_' + c] || 'makale-slug');
    var u = el('bl_serp_u'); if (u) u.textContent = 'qorai.net › blog › ' + s;
    var tt = el('bl_serp_t'); if (tt) tt.textContent = t;
    var dd = el('bl_serp_d'); if (dd) dd.textContent = d;
  };

  root.BlogUI.INP.alan = function () { P2.kirlet(); };
  root.BlogUI.INP.seo = function (e) {
    var f = e.id.replace('bl_', '');
    S.editing[(f === 'tags' ? 'tags_' : f + '_') + S.lang] = e.value;
    P2.kirlet(); P2.serpYaz(); P2.ctxYenile();
  };
  root.BlogUI.INP.slug = function (e) {
    S.editing['slug_' + S.lang] = e.value;
    P2.kirlet(); P2.serpYaz(); P2.ctxYenile();
  };
  root.BlogUI.CHG.durum = function (e) {
    S.editing.status = e.value; P2.kirlet();
    var b = el('bl_badge');
    if (b) { b.textContent = e.value === 'published' ? 'YAYIN' : 'TASLAK'; b.classList.toggle('pub', e.value === 'published'); }
  };

  // ── KAPAK ───────────────────────────────────────────────────────────────
  root.BlogUI.ACT.kapakUrl = function () {
    var u = prompt('Kapak görseli URL’si:', S.editing.cover || '');
    if (u == null) return;
    S.editing.cover = u.trim(); if (u.trim()) S.editing.coverFile = '';
    U.renderDoc(); P2.kirlet(); P2.ctxYenile();
  };
  root.BlogUI.ACT.kapakSil = function () {
    S.editing.cover = ''; S.editing.coverFile = '';
    U.renderDoc(); P2.kirlet(); P2.ctxYenile();
  };
  root.BlogUI.CHG.kapakYukle = async function (e) {
    var f = e.files && e.files[0]; if (!f) return;
    try {
      if (!S.editing.id) { U.editorleriBosalt(); U.paneliOku(); await P2.blogSave('draft', true); }
      if (!S.editing.id) { root.toast('Önce TR başlık yaz', 'w'); return; }
      var fd = new FormData(); fd.append('coverFile', f);
      var rec = await root.getPb().collection('articles').update(S.editing.id, fd, { $autoCancel: false });
      S.editing.coverFile = rec.coverFile; S.editing.cover = '';
      U.renderDoc(); P2.ctxYenile(); root.toast('Kapak yüklendi', 's');
    } catch (err) { root.toast('Yükleme başarısız: ' + err.message, 'e'); }
  };
  root.BlogUI.CHG.blokYukle = async function (e, i, j) {
    var f = e.files && e.files[0]; if (!f) return;
    try {
      if (!S.editing.id) { U.editorleriBosalt(); U.paneliOku(); await P2.blogSave('draft', true); }
      if (!S.editing.id) { root.toast('Önce makaleyi kaydet', 'w'); return; }
      var fd = new FormData(); fd.append('media+', f);
      var rec = await root.getPb().collection('articles').update(S.editing.id, fd, { $autoCancel: false });
      var fname = Array.isArray(rec.media) ? rec.media[rec.media.length - 1] : rec.media;
      var url = U.pbFileUrl(rec, fname);
      var p = S.products[i];
      if (p && p.blocks && p.blocks[j]) { p.blocks[j].url = url; U.renderItems(); P2.kirlet(); }
      root.toast('Görsel yüklendi', 's');
    } catch (err) { root.toast('Yükleme başarısız: ' + err.message, 'e'); }
  };

  // ── SÜRÜKLE-BIRAK BAĞLAMA ───────────────────────────────────────────────
  function tasi(dizi, from, to) {
    if (from === to || from < 0 || from >= dizi.length) return false;
    var x = dizi.splice(from, 1)[0];
    dizi.splice(to > from ? to - 1 : to, 0, x);
    return true;
  }

  D.kur({
    tasi: function (tur, ki, kj, hi, hj, once) {
      var degisti = false;
      if (tur === 'item') {
        degisti = tasi(S.products, ki, hi + (once ? 0 : 1));
      } else {
        var kaynak = S.products[ki];
        var hedef = S.products[hi];
        if (kaynak && hedef && Array.isArray(kaynak.blocks) && Array.isArray(hedef.blocks)) {
          if (ki === hi) {
            degisti = tasi(kaynak.blocks, kj, hj + (once ? 0 : 1));
          } else {
            // ÖĞELER ARASI TAŞIMA — yazı kurgusunu değiştirmenin en sık yolu.
            var b = kaynak.blocks.splice(kj, 1)[0];
            if (b) {
              hedef.blocks.splice((hj == null ? hedef.blocks.length : hj + (once ? 0 : 1)), 0, b);
              // Kaynak bloksuz kalmasın: her öğede en az bir blok bekleyen
              // yerler var (bkz. ensureBlocks).
              if (!kaynak.blocks.length) C.ensureBlocks(kaynak);
              degisti = true;
            }
          }
        }
      }
      if (degisti) { U.renderItems(); P2.renderOutline(); P2.ctxYenile(); P2.kirlet(); }
    },
    kaydir: function (tur, i, j, yon) {
      if (tur === 'item') {
        var hedef = i + yon;
        if (hedef < 0 || hedef >= S.products.length) return null;
        var t = S.products[i]; S.products[i] = S.products[hedef]; S.products[hedef] = t;
        U.renderItems(); P2.renderOutline(); P2.kirlet();
        return { i: hedef, j: null };
      }
      var p = S.products[i]; if (!p) return null;
      var hj = j + yon;
      if (hj < 0 || hj >= p.blocks.length) return null;
      var b = p.blocks[j]; p.blocks[j] = p.blocks[hj]; p.blocks[hj] = b;
      U.renderItems(); P2.kirlet();
      return { i: i, j: hj };
    },
  });

  // ── OTOKAYIT + ÇÖKME YEDEĞİ ─────────────────────────────────────────────
  /* Her değişiklik ~0,8 sn içinde yerel yedeğe yazılır; sekme kapanması,
     tarayıcı çökmesi, elektrik kesintisi veri kaybettirmez. Başarılı PB
     kaydında yedek silinir.
     OTOKAYIT YALNIZ TASLAKLARDA — yayındaki makaleye yarım değişiklik
     basılmaz, orada elle kaydedilir. */
  var yedekAnahtar = function (id) { return 'qor.blogDraft.' + (id || 'new'); };

  P2.anlikJson = function () {
    try { return JSON.stringify({ e: S.editing, p: S.products }); } catch (_) { return String(Math.random()); }
  };
  function kayitDurumu(cls, metin) {
    var e = el('bl_save'); if (!e) return;
    e.className = 'bl-save ' + (cls || ''); e.textContent = metin;
  }
  P2.kirlet = function () {
    S.dirty = true;
    U.editorleriBosalt();
    yedekYaz();
    kayitDurumu('dirty', S.editing && S.editing.status === 'published' ? '● Kaydedilmemiş — Kaydet/Yayınla' : '● Kaydedilmemiş…');
    clearTimeout(S.autoTimer);
    if (S.editing && S.editing.status !== 'published') S.autoTimer = setTimeout(otoKaydet, 2000);
  };
  P2.durdurOtokayit = function () {
    clearTimeout(S.autoTimer); S.autoTimer = null;
    clearTimeout(S.backupTimer); S.dirty = false;
  };
  function yedekYaz() {
    clearTimeout(S.backupTimer);
    S.backupTimer = setTimeout(function () {
      try {
        localStorage.setItem(yedekAnahtar(S.editing && S.editing.id),
          JSON.stringify({ v: 2, e: S.editing, p: S.products, at: Date.now() }));
      } catch (_) { /* dolu localStorage sessiz geçilir */ }
    }, 800);
  }
  P2.yedekYukle = function (id) {
    try {
      var b = JSON.parse(localStorage.getItem(yedekAnahtar(id)) || 'null');
      // v1 (eski editör) yedekleri de açılabilmeli — yarım taslak kaybolmasın.
      return (b && b.e) ? b : null;
    } catch (_) { return null; }
  };
  P2.yedekSil = function (id) { try { localStorage.removeItem(yedekAnahtar(id)); } catch (_) { /* */ } };
  P2.yedekZaman = function (b) {
    try {
      var d = new Date(b.at);
      var p = function (n) { return String(n).padStart(2, '0'); };
      return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (_) { return ''; }
  };
  root.BlogUI.ACT.yedekGeri = function (e, i, j, v) {
    var b = P2.yedekYukle(v === 'new' ? '' : v);
    if (!b) { root.toast('Yedek bulunamadı', 'w'); return; }
    S.pendingBackup = null;
    S.editing = b.e; S.products = Array.isArray(b.p) ? b.p : [];
    S.products.forEach(C.ensureBlocks);
    S.lang = 'tr'; S.srcMode = { body: false, concl: false }; S.importReport = null;
    U.renderEditor();
    S.dirty = true; kayitDurumu('dirty', '● Yedekten geri yüklendi — kaydetmeyi unutma');
    root.toast('Yedek geri yüklendi — kontrol et ve kaydet', 's');
  };
  root.BlogUI.ACT.yedekSil = function (e, i, j, v) {
    P2.yedekSil(v === 'new' ? '' : v); S.pendingBackup = null;
    root.toast('Yedek silindi', 's'); U.renderEditor();
  };

  async function otoKaydet() {
    if (S.saving || !S.editing) return;
    U.paneliOku();
    if (!(S.editing.title_tr || '').trim()) return;   // başlıksız otokayıt olmaz
    var snap = P2.anlikJson();
    if (snap === S.lastSavedJson) { S.dirty = false; kayitDurumu('ok', '✓ Kaydedildi'); return; }
    try {
      await P2.blogSave('draft', true);
      var t = new Date();
      kayitDurumu('ok', '✓ Otomatik kaydedildi ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'));
    } catch (e) { kayitDurumu('dirty', '⚠ Otokayıt başarısız: ' + pbHata(e)); }
  }

  window.addEventListener('beforeunload', function (e) {
    if (S.dirty && S.editing) { e.preventDefault(); e.returnValue = ''; }
  });

  // ── KAYDETME ────────────────────────────────────────────────────────────
  /* PB hata gövdesindeki ALAN BAZLI hataları okunur metne çevir. SDK'nın
     `message`'ı hep "Failed to create record." — asıl bilgi data'da. */
  function pbHata(e) {
    var d = (e && (e.data || e.response)) || {};
    var f = d.data;
    if (f && typeof f === 'object' && Object.keys(f).length) {
      return Object.entries(f).map(function (kv) {
        return kv[0] + ': ' + ((kv[1] && (kv[1].message || kv[1].code)) || 'geçersiz');
      }).join(' · ');
    }
    return (e && e.message) || 'bilinmeyen hata';
  }

  /* `slug` PB'de BENZERSİZ indeksli. Aynı başlıktan ikinci kez makale
     oluşturulmaya çalışılınca PB 400 + validation_not_unique dönüyordu ve
     kullanıcıya yalnızca "Failed to create record" görünüyordu. */
  async function bosSlug(base) {
    var kok = base.slice(0, 74);
    for (var i = 1; i <= 30; i++) {
      var cand = i === 1 ? base : kok + '-' + i;
      try {
        await root.getPb().collection('articles').getFirstListItem('slug="' + cand.replace(/"/g, '\\"') + '"', { $autoCancel: false });
      } catch (err) {
        return cand;   // 404 = boş; sorgu başarısızsa PB son sözü söyler
      }
    }
    return kok + '-' + Date.now().toString(36);
  }

  P2.blogSave = async function (forceStatus, silent) {
    U.paneliOku();
    var a = S.editing;
    var slug = C.slugify(a.slug_tr || a.title_tr || '');
    if (!slug || !a.title_tr) { if (!silent) root.toast('TR başlık gerekli', 'w'); return; }

    /* ── SLUG KOPMA UYARISI ────────────────────────────────────────────────
       `article_events` (canlıda 875 kayıt) ve `reviews` yazıya SLUG ile
       bağlı. Ne PB kısıtı ne de uyarı var — adres değişince istatistik
       sessizce sıfırlanır ve yorumlar görünmez olur. */
    if (!silent && a.id) {
      var u = C.slugKopmaUyarisi(a._slugKayitli || '', slug, S.stats[a._slugKayitli] || {}, S.yorumSayisi);
      if (u && !confirm(u.metin + '\n\nDevam edilsin mi?')) return;
    }

    // Yayınlamadan önce kritik yapısal sorun varsa bir kez sor (otokayıtta değil).
    if (!silent && forceStatus === 'published') {
      var krit = C.articleHealth(a, S.products).filter(function (x) { return x.level === 'error'; });
      if (krit.length) {
        var liste = krit.slice(0, 6).map(function (x) { return '• ' + x.text; }).join('\n');
        if (!confirm('Bu makalede ' + krit.length + ' kritik sorun var:\n\n' + liste
          + (krit.length > 6 ? '\n…' : '') + '\n\nYine de yayınlansın mı?')) { P2.ctxYenile(); return; }
      }
    }
    if (S.saving) return;
    S.saving = true;
    try {
      var data = C.savePayload(a, S.products, { status: forceStatus || a.status || 'draft' });
      if (a.id) await root.getPb().collection('articles').update(a.id, data, { $autoCancel: false });
      else {
        var free = await bosSlug(data.slug);
        var kaydi = free !== data.slug;
        if (kaydi) {
          data.slug = free;
          C.LANG_CODES.forEach(function (c) { if (data['slug_' + c] === slug) data['slug_' + c] = free; });
        }
        var rec = await root.getPb().collection('articles').create(data, { $autoCancel: false });
        a.id = rec.id; a.coverFile = rec.coverFile; a.publishedAt = C.toDtLocal(rec.publishedAt);
        a.slug = rec.slug;
        C.LANG_CODES.forEach(function (c) { if (data['slug_' + c]) a['slug_' + c] = data['slug_' + c]; });
        if (kaydi) root.toast('Bu adres kullanımdaydı — makale "' + free + '" olarak kaydedildi', 'w');
      }
      a.status = data.status;
      a.slug = data.slug;
      a._slugKayitli = data.slug;
      S.dirty = false;
      S.lastSavedJson = P2.anlikJson();
      clearTimeout(S.backupTimer);
      P2.yedekSil(''); P2.yedekSil(a.id);
      S.pendingBackup = null;
      var b = el('bl_badge');
      if (b) { b.textContent = data.status === 'published' ? 'YAYIN' : 'TASLAK'; b.classList.toggle('pub', data.status === 'published'); }
      if (!silent) {
        kayitDurumu('ok', '✓ Kaydedildi');
        root.toast(data.status === 'published' ? '🚀 Yayınlandı — sitede canlı' : 'Taslak kaydedildi', 's');
      }
    } catch (e) {
      if (!silent) root.toast('Kaydedilemedi — ' + pbHata(e), 'e');
      if (silent) throw e;
    } finally { S.saving = false; }
  };

  root.BlogUI.ACT.kaydetTaslak = function () { P2.blogSave('draft'); };
  root.BlogUI.ACT.yayinla = function () { P2.blogSave('published'); };
  root.BlogUI.ACT.onizle = async function () {
    U.editorleriBosalt(); U.paneliOku();
    try {
      await P2.blogSave(S.editing.status === 'published' ? 'published' : 'draft', true);
      if (!S.editing.id) { root.toast('Önce kaydet', 'w'); return; }
      kayitDurumu('ok', '✓ Kaydedildi');
      // Blog linki `<Link>` ile verilemez, ama burası zaten yeni sekme.
      window.open(SITE + '/blog/' + encodeURIComponent(S.editing.slug || C.slugify(S.editing.title_tr || ''))
        + '?previewId=' + S.editing.id, '_blank');
    } catch (e) { root.toast('Önizleme başarısız — ' + pbHata(e), 'e'); }
  };

  // ── YORUMLAR ────────────────────────────────────────────────────────────
  // `reviews` koleksiyonundan `productId = "blog:<slug>"` filtresiyle.
  P2.yorumlariYukle = async function () {
    var box = el('bl_comments'); if (!box || !S.editing.id) return;
    try {
      var key = 'blog:' + (S.editing.slug || '');
      var res = await root.getPb().collection('reviews').getList(1, 100, {
        filter: 'productId = "' + key.replace(/"/g, '\\"') + '"', sort: '-created', $autoCancel: false,
      });
      var items = res.items || [];
      S.yorumSayisi = items.length;
      if (!items.length) { box.innerHTML = '<div style="color:var(--text3)">Henüz yorum yok.</div>'; return; }
      box.style.color = 'inherit';
      box.innerHTML = items.map(function (c) {
        return '<div class="bl-cm"><div style="flex:1;min-width:0">'
          + '<div style="font-size:12px"><b>' + esc(c.authorDisplayName || 'User') + '</b> '
          + '<span style="color:var(--text3)" class="bl-num">' + esc(String(c.created || '').slice(0, 10)) + '</span>'
          + (c.rating ? ' <span style="color:var(--amber)">' + '★'.repeat(Number(c.rating) || 0) + '</span>' : '') + '</div>'
          + '<div style="font-size:13px;margin-top:3px;white-space:pre-wrap;word-break:break-word">' + esc(c.text || '') + '</div></div>'
          + '<button class="bl-btn sm dang" data-bl="yorumSil" data-v="' + c.id + '" title="Sil">🗑</button></div>';
      }).join('');
    } catch (e) { box.innerHTML = '<div style="color:var(--red)">Yorumlar yüklenemedi: ' + esc(e.message) + '</div>'; }
  };
  root.BlogUI.ACT.yorumSil = async function (e, i, j, v) {
    if (!confirm('Bu yorumu sil?')) return;
    try { await root.getPb().collection('reviews').delete(v, { $autoCancel: false }); root.toast('Yorum silindi', 's'); P2.yorumlariYukle(); }
    catch (err) { root.toast('Silinemedi: ' + err.message, 'e'); }
  };

  /* TEŞHİS KANCASI — katalog eşleştirme ve görsel çözümleme, yazıya alakasız
     ürün sokan / yazıyı görselsiz bırakan hataların ta kendisiydi. Konsoldan
     tek tek denenebilsin diye dışarı veriliyor (arayüzde kullanılmaz):
       await blogDebug.resolveCatalogItem('Leonardo AI')   → null olmalı
       await blogDebug.bestLogo('midjourney.com')          → yüklenen logo URL'i
       blogDebug.health()                                  → açık makalenin denetimi */
  root.blogDebug = {
    matchScore: C.matchScore, bestMatch: C.bestMatch,
    resolveCatalogItem: AI.resolveCatalogItem, domainOf: AI.domainOf,
    logoCandidates: AI.logoCandidates, probeImage: AI.probeImage,
    bestLogo: function (d) { return AI.firstLoadableImage(AI.logoCandidates(d)); },
    health: function () { return C.articleHealth(S.editing || {}, S.products); },
    faq: function (c) { return C.faqDurumu(S.editing || {}, c || S.lang); },
    payload: function () { return C.savePayload(S.editing || {}, S.products, {}); },
    S: S,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
