// ══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — BLOG ÇEKİRDEĞİ
//
//  BU DOSYA DOM'A DOKUNMAZ. Tek bir `document`, `window`, `DOMParser` ya da
//  `fetch` çağrısı yok. Sebebi tek: Node'dan doğrudan çalıştırılabilsin ve
//  gerileme testi (scripts/blog_kural_testi.mjs) fonksiyonları GERÇEKTEN
//  koşturabilsin.
//
//  `node --check` YETMEZ — bu projede bir kez `priceRulesBlock is not defined`
//  sözdizimi denetiminden geçip dört prompt'u birden kıracaktı. Burada duran
//  her kural, testte gerçekten çağrılarak doğrulanıyor.
//
//  Bölümler:
//    1. sabitler + metin yardımcıları
//    2. markdown → HTML
//    3. blok modeli (ensureBlocks / normalize / sanitize)
//    4. SSS ÇIKARIMI — seo.mjs ve BlogPost.jsx ile BİREBİR aynı kapılar
//    5. sağlık denetimi (deterministik)
//    6. katalog eşleştirme puanı
//    7. kaydetme yükü (PB `articles` şeması — DEĞİŞTİRİLEMEZ)
//    8. anahat / özet yardımcıları
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  // Almanca 2026-08-21'de kaldırıldı: blog yalnızca TR + EN.
  // Eski kayıtlarda `de` alanları HÂLÂ DURUYOR (ölçüldü 2026-09-03: 146 metin
  // bloğunun 139'unda `de` var, 28 öğede `name_de`). Hiçbiri render edilmiyor
  // çünkü tr/en her blokta dolu. SİLMİYORUZ — bilinmeyen anahtarlar olduğu
  // gibi korunuyor; sessiz veri kaybı bu projede en pahalı hata sınıfı.
  var LANGS = [['tr', '🇹🇷 Türkçe'], ['en', '🇬🇧 English']];
  var LANG_CODES = ['tr', 'en'];
  var LANG_LABEL = { tr: 'TR', en: 'EN' };

  var META_TITLE_MAX = 60;
  var META_DESC_MAX = 155;

  // ── 1. metin yardımcıları ───────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugify(v) {
    return String(v || '').trim().toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }

  /* HTML → düz metin. `document.createElement` KULLANILMIYOR: bu fonksiyon
     SSS çıkarımının parçası ve ön-render tarafındaki karşılığı (seo.mjs →
     sssCikar içindeki `metin`) Node'da koşuyor, orada DOM yok. İki taraf
     AYNI sonucu üretmek zorunda, o yüzden ikisi de aynı regex'i kullanır. */
  function duzMetin(html) {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim();
  }

  function wordCount(s) {
    return (String(s || '').trim().match(/\S+/g) || []).length;
  }

  /* Kelime sınırından kırp — ORTADAN KESME.
     seo-audit.mjs kesik başlığı yakalayıp build'i düşürüyor. Sınırın %60'ından
     sonra boşluk yoksa (tek uzun jeton) sert kırpmaya düşer. */
  function clampText(s, max) {
    var t = String(s || '').trim();
    if (t.length <= max) return t;
    var cut = t.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, '');
  }

  // PB "2026-06-21 10:11:00.000Z" → <input type="datetime-local"> değeri
  function toDtLocal(v) {
    if (!v) return '';
    var d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* Blok metinleri DÜZ METİNDİR (site markdown-benzeri kurallarla render eder).
     AI bazen içine ham HTML sıkıştırıyor; bu onu geri indirir. Linkler metne
     iner, `href="#"` yer tutucuları tamamen atılır. */
  function htmlToPlain(s) {
    var t = String(s || '');
    if (!/<[a-z!/]/i.test(t) && !/&[a-z#][a-z0-9]{1,8};/i.test(t)) return t;
    t = t.replace(/<br\s*\/?>/gi, '\n');
    t = t.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
    t = t.replace(/<li[^>]*>/gi, '- ');
    t = t.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**');
    t = t.replace(/<a[^>]*href=["']#["'][^>]*>([\s\S]*?)<\/a>/gi, '');
    t = t.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    t = t.replace(/<[^>]+>/g, '');
    t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
    return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* Öğe adındaki "1. " öneki silinir — site sıra numarasını KENDİ basar,
     yoksa yayında "1. 1. iPad Pro" görünür. */
  function stripLeadingNumber(s) {
    return String(s || '').replace(/^\s*\d+\s*[.)\-–—:]\s*/, '').trim();
  }

  /* Öğe başlığındaki "| En İyi: …" kuyruğunu at. Yazar bunu bölüm başlığı
     olarak yazıyor; öğe adı olarak basılınca üç satırlık dev başlık çıkıyordu.
     FİYAT EKİ KORUNUR — katalog dışı öğelerde tek fiyat bilgisi odur. */
  function stripHeadingTail(s) {
    return String(s || '').split('|')[0].replace(/[\s—–-]+$/, '').trim();
  }

  /* Öğe başlığından markdown süsü VE fiyat ekini temizle:
     "NordVPN — 12,99 $/ay (2 yıllıkta 3,49 $)" → "NordVPN".
     "Sony WH-1000XM5" gibi boşluksuz tireler dokunulmaz kalır.
     YALNIZCA KATALOG ARAMASINDA kullanılır; görünen ad yazarın yazdığı gibi. */
  function cleanItemName(raw) {
    var n = String(raw || '').replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
    n = n.replace(/\s+[—–-]\s+[^—–-]*(?:\$|€|₺|£|\bTL\b|\bUSD\b|\bEUR\b|\/ay|\/yıl|\/month|month)\S*.*$/i, '').trim();
    n = n.replace(/\s*\((?:[^)]*(?:\$|€|₺|£|\bTL\b|fiyat|price)[^)]*)\)\s*$/i, '').trim();
    return n;
  }

  /* Kaynak atıflarını gövdeden sök. Kullanıcı bunları istemiyor (rakip
     sitelere dış link + görsel kirlilik). Etiketi VE metnini birlikte söker,
     kalan boş parantez/çift boşluk/boşalan <p> kabuklarını temizler. */
  function stripCitationLinks(html) {
    var t = String(html || '');
    if (!/<a\b/i.test(t)) return t;
    t = t.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '');
    t = t.replace(/[([]\s*[)\]]/g, '');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\s+([.,;:!?])/g, '$1');
    t = t.replace(/[ \t]+(<\/(?:p|li|h[1-6]|td|th|div)>)/gi, '$1');
    t = t.replace(/<p>\s*<\/p>/gi, '');
    return t.trim();
  }

  /* Kaynak atıflarını AI'a HİÇ GÖSTERME. Modele "linkleri yazma" demek
     yetmiyor: linki atıp adını ("MacRumors") başıboş satır olarak bırakıyor. */
  function stripSourcesFromRaw(text) {
    var t = String(text || '');
    t = t.replace(/\[[^\]\n]{1,60}\]\(\s*https?:\/\/[^)\s]+\s*\)/g, '');
    t = t.replace(/\(\s*https?:\/\/[^)\s]+\s*\)/g, '');
    t = t.replace(/https?:\/\/\S+/g, '');
    t = t.replace(/\[[^\]\n]{1,60}\s\+\s\d+\]/g, '');
    t = t.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');
    t = t.replace(/^[ \t]+$/gm, '');
    return t;
  }

  // ── 2. markdown → HTML ──────────────────────────────────────────────────
  function mdInline(s) {
    var t = esc(s);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t;
  }

  function mdToHtmlFallback(md) {
    var lines = String(md || '').split(/\r?\n/);
    var out = [];
    var list = null;
    var para = [];
    var table = null;
    var flushPara = function () { if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; } };
    var flushList = function () { if (list) { out.push('</' + list + '>'); list = null; } };
    var flushTable = function () {
      if (!table) return;
      var h = '<table><thead><tr>' + table.header.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
      h += table.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + mdInline(c) + '</td>'; }).join('') + '</tr>'; }).join('');
      out.push(h + '</tbody></table>'); table = null;
    };
    var cells = function (l) { return l.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); };
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (/^\|.+\|/.test(line)) {
        flushPara(); flushList();
        if (!table) {
          var next = (lines[i + 1] || '').trim();
          if (/^\|?[\s:|-]+\|?$/.test(next) && next.indexOf('-') >= 0) { table = { header: cells(line), rows: [] }; i++; continue; }
        }
        if (table) { table.rows.push(cells(line)); continue; }
      } else if (table) flushTable();
      if (!line) { flushPara(); flushList(); continue; }
      var m = line.match(/^(#{1,6})\s+(.+)$/);
      if (m) { flushPara(); flushList(); var lvl = Math.min(4, Math.max(2, m[1].length)); out.push('<h' + lvl + '>' + mdInline(m[2]) + '</h' + lvl + '>'); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
      if (/^>\s?/.test(line)) { flushPara(); flushList(); out.push('<blockquote><p>' + mdInline(line.replace(/^>\s?/, '')) + '</p></blockquote>'); continue; }
      m = line.match(/^[-*•]\s+(.+)$/);
      if (m) { flushPara(); if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + mdInline(m[1]) + '</li>'); continue; }
      m = line.match(/^\d+[.)]\s+(.+)$/);
      if (m) { flushPara(); if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + mdInline(m[1]) + '</li>'); continue; }
      m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (m) { flushPara(); flushList(); out.push('<figure><img src="' + esc(m[2]) + '" alt="' + esc(m[1]) + '"></figure>'); continue; }
      para.push(line);
    }
    flushPara(); flushList(); flushTable();
    return out.join('\n');
  }

  function mdToHtml(md) {
    var html = '';
    if (root.marked && typeof root.marked.parse === 'function') {
      try { html = root.marked.parse(String(md || ''), { breaks: false }); } catch (_) { html = ''; }
    }
    if (!html) html = mdToHtmlFallback(md);
    // güvenlik + site uyumu: script sök, h1'i h2'ye indir (başlık ayrı alan)
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<(\/?)h1(\s|>)/gi, '<$1h2$2');
    return html.trim();
  }

  // Zaten HTML mi, yoksa markdown mı? İkisini de kabul eden alanlar için.
  function toHtml(v) {
    var s = String(v || '');
    return /<\w+[^>]*>/.test(s) ? s : mdToHtml(s);
  }

  /* Makale markdown'ını parçalara ayır: başlık, lead, gövde, öğe bölümleri,
     sonuç. "## 1. Ürün Adı" biçimli 2. seviye başlıklar öğe sayılır. */
  function parseMdArticle(md, opts) {
    var o = Object.assign({ takeTitle: true, detectItems: true, splitConclusion: true }, opts || {});
    var lines = String(md || '').replace(/\r/g, '').split('\n');
    var title = '';
    var lead = '';
    var sections = [];
    var cur = { head: '', lines: [] };
    lines.forEach(function (raw) {
      var m = raw.match(/^##\s+(.+?)\s*$/);
      if (m) { sections.push(cur); cur = { head: m[1].trim(), lines: [] }; return; }
      cur.lines.push(raw);
    });
    sections.push(cur);
    var pre = sections[0].lines;
    var bodyPre = [];
    for (var i = 0; i < pre.length; i++) {
      var line = pre[i];
      var h1 = line.match(/^#\s+(.+?)\s*$/);
      if (h1 && !title && o.takeTitle) { title = h1[1].replace(/\*\*/g, '').trim(); continue; }
      if (!lead && o.takeTitle && line.trim() && !/^[#>\-*|!\d]/.test(line.trim())) { lead = line.trim().replace(/\*\*/g, ''); continue; }
      bodyPre.push(line);
    }
    var bodyParts = [bodyPre.join('\n')];
    var items = [];
    var conclusionMd = '';
    var CONCL = /^(sonuç|sonuc|conclusion|fazit|özet|ozet|verdict|karar|summary)\b/i;
    for (var j = 1; j < sections.length; j++) {
      var sec = sections[j];
      var content = sec.lines.join('\n').trim();
      var numbered = sec.head.match(/^(\d+)[.)]\s+(.+)$/);
      if (o.splitConclusion && CONCL.test(sec.head)) { conclusionMd += (conclusionMd ? '\n\n' : '') + content; continue; }
      if (o.detectItems && numbered) {
        items.push({ name: numbered[2].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim(), md: content });
        continue;
      }
      bodyParts.push('## ' + sec.head + '\n' + content);
    }
    return { title: title, lead: lead, bodyMd: bodyParts.join('\n\n').trim(), items: items, conclusionMd: conclusionMd };
  }

  /* Öğe bölümü markdown'ı → blocks[]. Görseller ayrı image bloğu; metin
     sitenin renderRichText'inin anladığı düz-markdown olarak kalır. */
  function mdSectionToBlocks(md, lang) {
    var blocks = [];
    var text = [];
    var flush = function () {
      var t = text.join('\n').replace(/^\n+|\n+$/g, '');
      if (t.trim()) { var b = { t: 'text', style: 'paragraph', tr: '', en: '' }; b[lang] = t; blocks.push(b); }
      text = [];
    };
    var imgCount = 0;
    String(md || '').split('\n').forEach(function (raw) {
      var m = raw.trim().match(/^!\[[^\]]*\]\(([^)\s]+)\)$/);
      if (m) { flush(); blocks.push({ t: 'image', url: m[1], pos: imgCount === 0 ? 'right' : 'full', size: 'm' }); imgCount++; return; }
      text.push(raw.replace(/^###\s+/, '## '));
    });
    flush();
    if (!blocks.some(function (b) { return b.t === 'text'; })) blocks.push({ t: 'text', style: 'paragraph', tr: '', en: '' });
    return blocks;
  }

  // ── 3. blok modeli ──────────────────────────────────────────────────────
  var BLOCK_STYLES = ['paragraph', 'heading', 'subheading', 'bullets'];
  var IMG_POS = ['left', 'right', 'center', 'full'];
  var IMG_SIZES = ['s', 'm', 'l', 'xl'];

  function bosMetinBlok() { return { t: 'text', style: 'paragraph', tr: '', en: '' }; }

  /* ESKİ MODEL → YENİ MODEL GÖÇÜ.
     `blocks` varsa yeni model (ÖLÇÜLDÜ 2026-09-03: 67 öğenin 62'si). Yoksa
     `layout` + `desc/desc2` eski modeli (kalan 5 öğe, hepsi layout='left').
     Devir teslim notu "hiçbirinde blocks yok" diyordu — ölçüm bunun tersini
     söylüyor; asıl risk eski kayıtları açamamak değil, YENİ modeldeki 62
     öğeyi bozmak. Bu yüzden `blocks` varsa bu fonksiyon yalnızca boş diziyi
     doldurur, İÇERİĞE DOKUNMAZ. */
  function ensureBlocks(p) {
    if (!p) return;
    if (Array.isArray(p.blocks)) {
      if (!p.blocks.length) p.blocks.push(bosMetinBlok());
      return;
    }
    var blocks = [];
    var hasD1 = LANG_CODES.some(function (c) { return p['desc_' + c]; });
    var hasD2 = LANG_CODES.some(function (c) { return p['desc2_' + c]; });
    var img = p.image || p.imageUrl || p.logo || '';
    // `de` DAHİL bütün dil alanları taşınır: eski kayıtta Almanca metin varsa
    // silmek yerine bloğa geçsin — render etmiyoruz ama kaybetmiyoruz da.
    var txt = function (k) {
      var b = { t: 'text', style: 'paragraph', tr: p[k + '_tr'] || '', en: p[k + '_en'] || '' };
      if (p[k + '_de']) b.de = p[k + '_de'];
      return b;
    };
    var imgBlock = function () {
      return {
        t: 'image', url: img,
        pos: p.layout === 'left' ? 'left' : p.layout === 'right' ? 'right' : 'full',
        size: p.imgSize || 'm',
      };
    };
    var layout = p.layout || 'split';
    if (layout === 'top') { if (img) blocks.push(imgBlock()); if (hasD1) blocks.push(txt('desc')); if (hasD2) blocks.push(txt('desc2')); }
    else if (layout === 'text') { if (hasD1) blocks.push(txt('desc')); if (hasD2) blocks.push(txt('desc2')); }
    else { if (hasD1) blocks.push(txt('desc')); if (img) blocks.push(imgBlock()); if (hasD2) blocks.push(txt('desc2')); }
    if (!blocks.some(function (b) { return b.t === 'text'; })) blocks.push(bosMetinBlok());
    p.blocks = blocks;
  }

  /* AI'dan / içe aktarmadan gelen ham bloğu site sözleşmesine indirger.
     BİLİNMEYEN ANAHTARLAR KORUNUR (`de` gibi) — yalnız bilinen alanlar
     normalize edilir. */
  function normalizeBlock(b) {
    if (!b || typeof b !== 'object') return bosMetinBlok();
    var tip = b.t || b.type;
    if (tip === 'image') {
      var out = Object.assign({}, b);
      delete out.type;
      out.t = 'image';
      out.url = String(b.url || '');
      out.pos = IMG_POS.indexOf(b.pos) >= 0 ? b.pos : 'right';
      out.size = IMG_SIZES.indexOf(b.size) >= 0 ? b.size : 'm';
      var w = Number(b.w);
      out.w = (w >= 15 && w <= 100) ? w : '';
      out.cap_tr = String(b.cap_tr || b.cap || '');
      out.cap_en = String(b.cap_en || '');
      return out;
    }
    var t = Object.assign({}, b);
    delete t.type;
    t.t = 'text';
    t.style = BLOCK_STYLES.indexOf(b.style) >= 0 ? b.style : 'paragraph';
    t.tr = String(b.tr || '');
    t.en = String(b.en || '');
    return t;
  }

  /* İÇE AKTARMA/ÜRETİM SONRASI ZORUNLU TEMİZLİK.
     Modelin kurallara uymasına GÜVENMEYİZ: sınırlar burada deterministik
     olarak uygulanır. Dört yolda da (auto/md/json import + yazar + çeviri)
     çağrılır — tek kapı. */
  function sanitizeArticle(a, products) {
    if (!a) return;
    LANG_CODES.forEach(function (c) {
      if (a['metaTitle_' + c]) a['metaTitle_' + c] = clampText(a['metaTitle_' + c], META_TITLE_MAX);
      if (a['metaDescription_' + c]) a['metaDescription_' + c] = clampText(a['metaDescription_' + c], META_DESC_MAX);
    });
    (products || []).forEach(function (p, i) {
      if ((p.kind || 'product') === 'custom') {
        LANG_CODES.forEach(function (c) {
          if (p['name_' + c]) p['name_' + c] = stripHeadingTail(stripLeadingNumber(p['name_' + c]));
        });
        if (p.name) p.name = stripHeadingTail(stripLeadingNumber(p.name));
      }
      ensureBlocks(p);
      p.blocks.forEach(function (b) {
        if (b.t !== 'text') return;
        LANG_CODES.forEach(function (c) { if (b[c]) b[c] = htmlToPlain(b[c]); });
      });
      /* GÖRSEL YERLEŞTİRME — AI'IN İŞARETLEDİĞİ YUVAYA.
         Yazar prompt'u modele "url YAZMA, yalnız görselin NEREYE ve HANGİ
         BOYUTTA geleceğini söyle" diyor; model de url'süz bir görsel bloğu
         bırakıyor. Katalog fotoğrafı İŞTE O YUVAYA girer — böylece modelin
         seçtiği pos/size korunur.

         ÖLÇÜLDÜ 2026-09-04 (canlı koşu): eskiden fotoğraf başa `unshift`
         ediliyor, modelin bıraktığı boş blok da duruyordu; her öğede bir
         fotoğraf VE bir "görsel yok" yer tutucusu görünüyordu. Sitede zararsız
         (boş url render edilmiyor) ama editörde "bu öğede görsel var mı yok mu"
         sorusunu okunamaz hâle getiriyordu.

         Kural: doldurulamayan boş görsel bloklarından EN FAZLA BİRİ kalır ve
         yalnızca öğenin hiç görseli yoksa — o da yazarın elle koyacağı yuva
         (kural 1: katalogda yoksa görsel BOŞ kalır, yazar koyar). */
      var img = p.image || p.imageUrl || p.logo || '';
      var doluVar = p.blocks.some(function (b) { return b.t === 'image' && b.url; });
      if (img && !doluVar) {
        var yuva = p.blocks.filter(function (b) { return b.t === 'image' && !b.url; })[0];
        if (yuva) { yuva.url = img; }
        else { p.blocks.unshift({ t: 'image', url: img, pos: i % 2 === 0 ? 'right' : 'left', size: 'm' }); }
        doluVar = true;
      }
      var bosGorulen = 0;
      p.blocks = p.blocks.filter(function (b) {
        if (b.t !== 'image' || b.url) return true;
        bosGorulen += 1;
        return !doluVar && bosGorulen === 1;   // görselsiz öğede TEK yuva kalsın
      });
      if (!p.blocks.length) p.blocks.push(bosMetinBlok());
    });
  }

  // Site tarafının okuduğu metin (BlogPost.jsx → blockText ile aynı düşüş).
  function blockText(b, lang) {
    if (!b || b.t !== 'text') return '';
    return String(b[lang] || b.tr || b.en || b.de || '');
  }

  function itemName(p, lang) {
    if (!p) return '';
    if ((p.kind || 'product') === 'custom') return String(p['name_' + lang] || p.name || p.name_tr || p.name_en || '');
    return String(p.name || '');
  }

  function itemImageUrl(p) {
    return String((p && (p.image || p.imageUrl || p.logo)) || '').trim();
  }

  function itemHasImage(p) {
    if (itemImageUrl(p)) return true;
    return Array.isArray(p && p.blocks) && p.blocks.some(function (b) { return b.t === 'image' && b.url; });
  }

  function totalWords(a, products, c) {
    var w = wordCount(a['title_' + c]) + wordCount(a['lead_' + c])
      + wordCount(duzMetin(a['body_' + c])) + wordCount(duzMetin(a['conclusion_' + c]));
    (products || []).forEach(function (p) {
      (p.blocks || []).forEach(function (b) { if (b.t === 'text') w += wordCount(b[c]); });
    });
    return w;
  }

  // ── 4. SSS ÇIKARIMI ─────────────────────────────────────────────────────
  /* ══ ÜÇ TARAF BİREBİR AYNI OLMAK ZORUNDA ═══════════════════════════════
     · web/scripts/seo.mjs      → sssCikar()     (regex, Node'da DOMParser yok)
     · web/src/pages/BlogPost.jsx → sssCiftleri() (DOMParser)
     · burası                    → sssCikar()     (regex, editör önizlemesi)

     Ayrışırlarsa aynı sayfa JS'siz ve JS'li halde FARKLI yapısal veri
     gösterir. Şemada `faq_tr`/`faq_en` YOK ve eklenmeyecek: soru-cevap
     GÖVDENİN İÇİNDE duruyor.

     KAPILAR:
       · soru "?" ile bitmeli ve ≥ 12 karakter olmalı
       · cevap ≥ 40 karakter olmalı
       · EN AZ İKİ çift olmalı (tek soru bir SSS sayfası yapmaz)
       · cevap 900 karakterde kırpılır
       · çıkarım GÖVDE + SONUÇ üzerinden (bir kez yalnız gövdeye bakıldı:
         ekranda SSS vardı, JSON-LD'de 0 soru çıkıyordu). */
  function sssCikar() {
    var govdeler = Array.prototype.slice.call(arguments);
    var html = govdeler.filter(Boolean).join('\n');
    if (!html) return [];
    var out = [];
    var re = /<(h[23])\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<h[1-6]\b|$)/gi;
    var m = re.exec(html);
    while (m) {
      var q = duzMetin(m[2]);
      var a = duzMetin(m[3]);
      if (/[?？]$/.test(q) && q.length >= 12 && a.length >= 40) out.push({ q: q, a: a.slice(0, 900) });
      m = re.exec(html);
    }
    return out.length >= 2 ? out : [];
  }

  // Yayın öncesi göstergesi: kaç soru geçerli, kaç aday elendi ve NEDEN.
  function faqDurumu(a, lang) {
    var html = [a['body_' + lang] || '', a['conclusion_' + lang] || ''].filter(Boolean).join('\n');
    var adaylar = 0;
    var kisaSoru = 0;
    var kisaCevap = 0;
    var re = /<(h[23])\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<h[1-6]\b|$)/gi;
    var m = re.exec(html);
    while (m) {
      var q = duzMetin(m[2]);
      var c = duzMetin(m[3]);
      if (/[?？]$/.test(q)) {
        adaylar++;
        if (q.length < 12) kisaSoru++;
        else if (c.length < 40) kisaCevap++;
      }
      m = re.exec(html);
    }
    var gecerli = sssCikar(a['body_' + lang], a['conclusion_' + lang]);
    return { pairs: gecerli, count: gecerli.length, adaylar: adaylar, kisaSoru: kisaSoru, kisaCevap: kisaCevap };
  }

  // ── 5. SAĞLIK DENETİMİ (deterministik) ──────────────────────────────────
  /* Yapısal sorunları AI'a SORMAYIZ — veriye bakıp kesin karar veririz.
     Yargı gerektiren şeyler AI'da; ölçülebilir olanlar burada, çünkü burada
     atlama ve uydurma olmaz. Aynı fonksiyon hem editörde hem toplu taramada
     kullanılır → tek makaleye özel düzeltme olmaz, HER makale denetlenir. */
  function articleHealth(a, products) {
    var out = [];
    var add = function (level, text) { out.push({ level: level, text: text }); };
    var prods = Array.isArray(products) ? products : (Array.isArray(a.products) ? a.products : []);

    // 1) Dil bütünlüğü + slug'lar
    var slugs = {};
    LANG_CODES.forEach(function (c) {
      var hasTitle = Boolean((a['title_' + c] || '').trim());
      var hasBody = Boolean(duzMetin(a['body_' + c]) || prods.some(function (p) {
        return (p.blocks || []).some(function (b) { return b.t === 'text' && (b[c] || '').trim(); });
      }));
      var s = (a['slug_' + c] || '').trim();
      if (!hasTitle) { add(c === 'tr' ? 'error' : 'warn', LANG_LABEL[c] + ' başlığı yok — bu dilde yayınlanamaz.'); return; }
      if (!hasBody) add('warn', LANG_LABEL[c] + ' başlığı var ama metni boş.');
      if (!s) add('error', LANG_LABEL[c] + ' adresi (slug) boş — bu dildeki ziyaretçi doğru URL\'e yönlenemez.');
      else {
        if (slugs[s]) add('error', LANG_LABEL[c] + ' ve ' + slugs[s] + ' aynı adresi kullanıyor ("' + s + '") — diller ayrı URL\'de olmalı.');
        slugs[s] = LANG_LABEL[c];
      }
      var mt = (a['metaTitle_' + c] || '').trim();
      var md = (a['metaDescription_' + c] || '').trim();
      if (mt.length > META_TITLE_MAX) add('warn', LANG_LABEL[c] + ' meta başlığı ' + mt.length + ' karakter (Google 60\'ta keser).');
      if (md.length > META_DESC_MAX) add('warn', LANG_LABEL[c] + ' meta açıklaması ' + md.length + ' karakter (Google 155\'te keser).');
      if (!md && !(a['lead_' + c] || '').trim()) add('warn', LANG_LABEL[c] + ' meta açıklaması ve özeti yok — arama sonucunda metin çıkmaz.');
      if (!(a['tags_' + c] || '').trim()) add('info', LANG_LABEL[c] + ' etiketleri boş.');

      // SSS — FAQPage yapısal verisi buradan üretiliyor.
      var f = faqDurumu(a, c);
      if (f.count === 0 && f.adaylar > 0) {
        var neden = f.kisaSoru ? f.kisaSoru + ' soru 12 karakterden kısa' : (f.kisaCevap ? f.kisaCevap + ' sorunun cevabı 40 karakterden kısa' : 'en az 2 soru gerekiyor');
        add('warn', LANG_LABEL[c] + ' SSS üretilmiyor (' + f.adaylar + ' aday, ' + neden + ') — FAQPage yapısal verisi çıkmayacak.');
      } else if (f.count === 0 && hasTitle) {
        add('info', LANG_LABEL[c] + ' bölümünde SSS yok — soru işaretiyle biten <h2> başlıkları FAQPage üretir.');
      }
    });

    // Kanonik slug TR slug'ıyla aynı olmalı (site TR'yi ana kayıt dili sayar)
    if ((a.slug || '') && (a.slug_tr || '') && a.slug !== a.slug_tr) {
      add('warn', 'Ana adres "' + a.slug + '" ile TR adresi "' + a.slug_tr + '" farklı — TR ziyaretçi beklenmedik URL görebilir.');
    }

    // 2) Görsel ve künye
    var ilkGorselli = prods.find(function (p) { return p.image || p.imageUrl; });
    var cover = a.cover || a.coverFile || (ilkGorselli && (ilkGorselli.image || ilkGorselli.imageUrl));
    if (!cover) add('error', 'Kapak görseli yok — paylaşımlarda ve listede boş görünür.');
    if (!(a.category || '').trim()) add('warn', 'Kategori boş — benzer ürün önerileri ve kategori bağlantıları çalışmaz.');

    // 3) İçerik öğeleri
    if (!prods.length) add('warn', 'Hiç içerik öğesi yok (ürün/abonelik).');
    prods.forEach(function (p, i) {
      var nm = p.name || p.name_tr || ('Öğe ' + (i + 1));
      var blocks = Array.isArray(p.blocks) ? p.blocks : [];
      if (!blocks.some(function (b) { return b.t === 'image' && b.url; })) add('warn', '"' + nm + '" öğesinde görsel yok.');
      LANG_CODES.forEach(function (c) {
        if (!(a['title_' + c] || '').trim()) return;
        var hasText = blocks.some(function (b) { return b.t === 'text' && (b[c] || '').trim(); });
        if (!hasText) add('warn', '"' + nm + '" öğesinin ' + LANG_LABEL[c] + ' metni boş.');
      });
      // "Katalogda eşleşmedi" YALNIZ gerçekten ürün olması beklenen öğeler için
      // anlamlı; Midjourney gibi hizmetler katalogda ZATEN yok.
      if ((p.kind || 'product') === 'custom' && !p.site && !p.brand) {
        add('info', '"' + nm + '" katalogda eşleşmedi (özel öğe) — ürün sayfasına iç link vermiyor.');
      }
    });

    // 4) İÇ LİNKLER — /tr/blog/* YUMUŞAK 404 ÜRETİR
    // Blog i18n'i önek değil SLUG tabanlı; yazılar YALNIZ /blog/<slug> altına
    // ön-render ediliyor. /tr/blog/... 200 + noindex döner (ölçüldü 2026-08-29).
    LANG_CODES.forEach(function (c) {
      var html = String(a['body_' + c] || '') + String(a['conclusion_' + c] || '');
      var trBlog = (html.match(/href=["']\/(?:tr|de)\/blog\//gi) || []).length;
      if (trBlog) add('error', LANG_LABEL[c] + ' metninde ' + trBlog + ' adet /tr/blog/ linki var — bu adres yumuşak 404 (noindex) döner, /blog/<slug> kullan.');
      var bosLink = (html.match(/href=["'](?:#|)["']/gi) || []).length;
      if (bosLink) add('warn', LANG_LABEL[c] + ' metninde ' + bosLink + ' boş/yer tutucu link var (href="#").');
    });

    // 5) Uzunluk ve tarih
    var words = totalWords(a, prods, 'tr');
    if (words < 300) add('warn', 'TR içerik ' + words + ' kelime — 300\'ün altı arama motorunda "ince içerik" sayılır.');
    var pub = Date.parse(String(a.publishedAt || '').replace(' ', 'T'));
    if (Number.isFinite(pub) && pub > Date.now() + 60000 && a.status === 'published') {
      add('warn', 'Yayın tarihi gelecekte — yayında görünse de tarih ileri bir günü gösteriyor.');
    }
    return out;
  }

  /* SLUG DEĞİŞİKLİĞİ = SESSİZ VERİ KAYBI.
     `article_events` (875 kayıt) ve `reviews` yazıya **slug ile** bağlı; ne PB
     kısıtı ne de uyarı var. Bu fonksiyon uyarı metnini üretir; kaydetme
     onaysız geçemez. */
  function slugKopmaUyarisi(eski, yeni, stat, yorumSayisi) {
    if (!eski || eski === yeni) return null;
    var s = stat || {};
    var parcalar = [];
    if (s.view) parcalar.push(s.view + ' görüntülenme');
    if (s.read) parcalar.push(s.read + ' okuma');
    if (s.like) parcalar.push(s.like + ' beğeni');
    if (yorumSayisi) parcalar.push(yorumSayisi + ' yorum');
    return {
      eski: eski,
      yeni: yeni,
      kopan: parcalar,
      metin: 'Adres "' + eski + '" → "' + yeni + '" olarak değişiyor.\n\n'
        + (parcalar.length
          ? 'Eski adrese bağlı ' + parcalar.join(', ') + ' KOPACAK — istatistik sıfırlanır, yorumlar görünmez olur.'
          : 'Bu adrese bağlı istatistik/yorum bulunamadı, kayıp beklenmiyor.')
        + '\n\nArama sonuçlarındaki eski adres de 404 olur.',
    };
  }

  /* Başıboş kaynak adı ADAYLARINI kod çıkarır (AI'a özet göndermek yetmiyordu:
     180 çöp satırın yalnız 3'ünü görebiliyordu). Aday = tek başına duran kısa
     satır; cümle değil, madde değil, ara başlık değil. AI sonra bu KISA
     LİSTEYİ sınıflandırır — hiçbiri kaçmaz, gerçek içerik riske girmez. */
  function junkCandidates(a, products) {
    var seen = new Map();
    var scan = function (txt) {
      String(txt || '').split(/\r?\n/).forEach(function (raw) {
        var t = raw.trim();
        if (!t || t.length > 60) return;
        if (/[.!?:;,]$/.test(t)) return;       // cümle ya da ara başlık
        if (/^[-*•#>]/.test(t)) return;         // madde / başlık işareti
        if (/^\d+\s*[.)]/.test(t)) return;      // "1." / "2)" numaralı satır
        if (t.split(/\s+/).length > 6) return;  // uzun ifade = içerik
        if (/\*\*/.test(t)) return;             // vurgulu içerik satırı
        seen.set(t, (seen.get(t) || 0) + 1);
      });
    };
    (products || []).forEach(function (p) {
      ensureBlocks(p);
      p.blocks.forEach(function (b) {
        if (b.t !== 'text') return;
        LANG_CODES.forEach(function (c) { scan(b[c]); });
      });
    });
    var toLines = function (h) { return String(h || '').replace(/<\/(p|li|h[1-6]|div)>/gi, '\n').replace(/<[^>]+>/g, ''); };
    LANG_CODES.forEach(function (c) {
      scan(toLines(a['body_' + c]));
      scan(toLines(a['conclusion_' + c]));
    });
    return Array.from(seen.keys()).slice(0, 120);
  }

  // ── 6. KATALOG EŞLEŞTİRME ───────────────────────────────────────────────
  /* ESKİ KURAL TEK YÖNLÜYDÜ: sorgu token'larının %50'si aday adda geçerse
     KABUL. ÖLÇÜLDÜ (2026-08-02):
       "Google AI Pro Nano Banana 2" → "Google Pixel Buds Pro 2"  (0.50 kabul)
       "Leonardo AI"                 → "MSI Stealth A16 AI+"      (0.50 kabul)
     Katalogda HİÇ OLMAYAN hizmetler rastgele ürünlere bağlanıyordu.

     YENİ KURAL — iki kapı, ikisi de geçilmeli:
       1) MARKA token'ı (ilk anlamlı kelime) adayda geçmeli.
       2) AYIRT EDİCİ token'ların HEPSİ adayda bulunmalı. Eksik kalan tek
          kelimeye ancak RAKAMSIZ ise göz yumulur.
     F1 artık kabul kapısı DEĞİL, yalnız adaylar arasında sıralama ölçütü.

     BU MANTIK BOZULMAYACAK. Gevşetildiğinde yanlış ürünler girdi (ölçüldü). */
  function tokensOf(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9ğüşöçı ]+/gi, ' ').split(/\s+/).filter(Boolean);
  }

  // Ayırt edici olmayan kelimeler. NOT: pro/ultra/max/plus BİLEREK listede
  // DEĞİL — onlar gerçek varyant ayırt edicileridir (S24 vs S24 Ultra).
  var MATCH_STOPWORDS = new Set([
    'ai', 'the', 'and', 'with', 've', 'ile', 'için', 'yeni', 'new', 'best', 'en', 'iyi',
    'edition', 'series', 'seri', 'model', 'tam', 'kablosuz', 'wireless', 'adet', 'gb', 'tb',
    // Bağlantı/depolama ekleri: ürünü değil varyantı anlatır.
    '5g', '4g', 'lte', 'wifi', 'wi', 'fi', 'cellular', 'esim',
  ]);

  var _uniq = function (arr) { return Array.from(new Set(arr)); };
  var _hasDigit = function (t) { return /\d/.test(t); };

  /* RAKAMLI DİYE HEPSİ MODEL NUMARASI DEĞİL.
     İKİ sınıf yumuşak:
      · YIL (2015-2035) — katalog adı yılı yazmaz.
      · ALT-MODEL KODU (harf+rakam, ≥5 karakter) ama YALNIZCA aday BAŞKA BİR
        KODLAMA SİSTEMİNDEN geliyorsa.
     ÇIPLAK SAYI YUMUŞATMASI DENENDİ VE GERİ ALINDI (2026-09-02): "Redmi Note
     14 Pro" → "Note 5 Pro" ve "OPPO Reno 15" → "Reno (CPH1917)" yanlış
     eşleşmeleri üretti. O sayı ekran boyutu değil NESİL numarasıydı.
     KASITEN SERT: "M4" / "S24" / "A315" gibi kısa kodlar. */
  var _yilMi = function (t) { return /^(20(1[5-9]|2\d|3[0-5]))$/.test(t); };
  var _altModelKodu = function (t) { return t.length >= 5 && /[a-zğüşöçı]/.test(t) && /\d/.test(t); };

  /* Aday BAŞKA bir kodlama sisteminden mi geliyor?
     "15IAN8" ile "83K2001WTR015" ortak önek taşımaz — farklı sistemler. Ama
     "1000XM5" ile "1000XM6" AYNI sistemin komşu nesilleridir; üç karakterlik
     ortak önek eşiği bu ikisini ayırıyor. */
  function _farkliKodlamaMi(t, nt) {
    var kodlar = nt.filter(function (x) { return x.length >= 4 && /[a-z]/.test(x) && /\d/.test(x); });
    if (!kodlar.length) return false;
    return !kodlar.some(function (k) {
      var n = 0;
      while (n < k.length && n < t.length && k[n] === t[n]) n += 1;
      return n >= 3;
    });
  }

  function _yumusakMi(t, nt) {
    if (_yilMi(t)) return true;
    return _altModelKodu(t) && _farkliKodlamaMi(t, nt);
  }

  /* RAKİP HAT ADI: eksik kelimenin YERİNE başkası geçmişse eşleşme YOK.
     Ölçüldü 2026-09-02: "Sonos Ace Ultra" → "Sonos Arc Ultra Soundbar".
     Kulaklık soundbar'a bağlanmıştı. "ace" yok ama "arc" var; ikisi de ürün
     HATTININ adı. Bu bir eksiklik değil, ÇELİŞKİDİR. */
  function _rakipHatAdi(eksik, qt, nt) {
    if (!eksik || /\d/.test(eksik)) return false;
    var qSet = new Set(qt);
    return nt.some(function (t) {
      if (qSet.has(t) || MATCH_STOPWORDS.has(t)) return false;
      if (/\d/.test(t)) return false;              // model kodu, hat adı değil
      if (t.length < 3 || t.length > 12) return false;
      return Math.abs(t.length - eksik.length) <= 2;
    });
  }

  function matchScore(query, candidateName) {
    var qt = _uniq(tokensOf(query));
    var nt = _uniq(tokensOf(candidateName));
    if (!qt.length || !nt.length) {
      return { f1: 0, sigOk: false, brandOk: false, missing: qt, sertEksik: qt, ok: false, gevsekOk: false };
    }
    var nSet = new Set(nt);
    var inter = qt.filter(function (t) { return nSet.has(t); }).length;
    var qCov = inter / qt.length;
    var nCov = inter / nt.length;
    var f1 = (qCov + nCov) ? (2 * qCov * nCov) / (qCov + nCov) : 0;
    var sig = qt.filter(function (t) { return !MATCH_STOPWORDS.has(t) && t.length > 1; });
    var missing = sig.filter(function (t) { return !nSet.has(t); });
    var sigOk = sig.length > 0 && missing.length === 0;
    var brand = sig[0] || '';
    var brandOk = brand ? nSet.has(brand) : false;
    var nearOk = sig.length > 2 && missing.length === 1 && !_hasDigit(missing[0])
      && f1 >= 0.5 && !_rakipHatAdi(missing[0], qt, nt);
    // GEVŞEK KAPI — yalnızca sert kapıdan hiçbir aday geçemezse kullanılır.
    var sertEksik = missing.filter(function (t) { return !_yumusakMi(t, nt); });
    var gevsekOk = sig.length > 2 && sertEksik.length === 0 && missing.length > 0 && f1 >= 0.35;
    return {
      f1: f1, sigOk: sigOk, brandOk: brandOk, missing: missing, sertEksik: sertEksik,
      gevsekOk: gevsekOk, ok: brandOk && (sigOk || nearOk),
    };
  }

  // Bir aday listesinden en iyisini seç (ağ yok — test edilebilir saf hâli).
  function bestMatch(query, candidates) {
    var sec = function (kapi) {
      var best = null; var bestF1 = -1;
      (candidates || []).forEach(function (d) {
        var m = matchScore(query, ((d.brand || '') + ' ' + (d.name || '')).trim());
        if (!kapi(m)) return;
        if (m.f1 > bestF1) { bestF1 = m.f1; best = d; }
      });
      return best;
    };
    var best = sec(function (m) { return m.ok; });
    if (best) return { doc: best, gevsek: false };
    best = sec(function (m) { return m.brandOk && m.gevsekOk; });
    return best ? { doc: best, gevsek: true } : null;
  }

  // ── 7. KAYDETME YÜKÜ ────────────────────────────────────────────────────
  /* PB `articles` ŞEMASI DEĞİŞTİRİLEMEZ. Yeni alan eklemek ön-render,
     istemci ve SEO'nun üçünü birden bozar. Bu fonksiyon YALNIZCA bugün var
     olan alanları yazar; testte anahtar kümesi doğrulanıyor.

     NOT: `template` PB'de YOK (ölçüldü 2026-09-03). AI'ın seçtiği şablon
     bilerek yalnız bellekte/yerel yedekte tutuluyor. */
  var SAVE_KEYS = ['slug', 'status', 'category', 'cover', 'author', 'publishedAt', 'products']
    .concat(LANG_CODES.reduce(function (acc, c) {
      return acc.concat(['title_' + c, 'lead_' + c, 'body_' + c, 'conclusion_' + c,
        'tags_' + c, 'metaTitle_' + c, 'metaDescription_' + c, 'slug_' + c]);
    }, []));

  function savePayload(a, products, opts) {
    var o = opts || {};
    var slug = slugify(a.slug_tr || a.title_tr || '');
    var data = {
      slug: slug,
      status: o.status || a.status || 'draft',
      category: a.category || '',
      cover: a.cover || '',
      author: (a.author || '').trim(),
      publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : (o.now || new Date()).toISOString(),
      products: (products || [])
        .map(function (p) {
          // `_livePrice` yalnız ekranda gösterilen geçici alan — kayda girmez.
          // (11 eski öğede kayda girmiş; ilk kaydetmede temizlenecek.)
          var q = Object.assign({}, p);
          delete q._livePrice;
          if ((q.kind || 'product') !== 'custom') return q;
          var nm = (q.name_tr || q.name_en || q.name || '').trim();
          return Object.assign({}, q, { name: nm, slug: slugify(nm) });
        })
        .filter(function (p) { return (p.kind || 'product') !== 'custom' || String(p.name || '').trim(); }),
    };
    LANG_CODES.forEach(function (c) {
      data['title_' + c] = a['title_' + c] || '';
      data['lead_' + c] = a['lead_' + c] || '';
      data['body_' + c] = a['body_' + c] || '';
      data['conclusion_' + c] = a['conclusion_' + c] || '';
      data['tags_' + c] = (a['tags_' + c] || '').trim();
      data['metaTitle_' + c] = (a['metaTitle_' + c] || '').trim();
      data['metaDescription_' + c] = (a['metaDescription_' + c] || '').trim();
      data['slug_' + c] = slugify(a['slug_' + c] || a['title_' + c] || '') || slug;
    });
    return data;
  }

  // ── 8. ANAHAT ───────────────────────────────────────────────────────────
  // Sol raya çizilen yapı haritası. AI'a da AYNI özet gönderilir (blogAiQa).
  function articleOutline(a, products, c) {
    return {
      lang: c,
      template: a.template || '',
      title: a['title_' + c] || '',
      lead: a['lead_' + c] || '',
      bodyExcerpt: duzMetin(a['body_' + c]).slice(0, 1200),
      bodyLen: duzMetin(a['body_' + c]).length,
      conclusionLen: duzMetin(a['conclusion_' + c]).length,
      hasCover: Boolean(a.cover || a.coverFile || itemImageUrl((products || [])[0])),
      items: (products || []).map(function (p, i) {
        ensureBlocks(p);
        var txt = p.blocks.filter(function (b) { return b.t === 'text'; })
          .map(function (b) { return b[c] || ''; }).join('\n');
        return {
          i: i,
          name: itemName(p, c),
          kind: p.kind || 'product',
          textLen: txt.length,
          images: p.blocks.filter(function (b) { return b.t === 'image' && b.url; }).length,
          excerpt: txt.replace(/\s+/g, ' ').slice(0, 260),
        };
      }),
    };
  }

  // Gövde/sonuç HTML'indeki <h2>/<h3> başlıkları (anahat rayı için).
  function basliklar(html) {
    var out = [];
    var re = /<(h[23])\b[^>]*>([\s\S]*?)<\/\1>/gi;
    var m = re.exec(String(html || ''));
    while (m) {
      var t = duzMetin(m[2]);
      if (t) out.push({ level: m[1] === 'h2' ? 2 : 3, text: t, soru: /[?？]$/.test(t) });
      m = re.exec(String(html || ''));
    }
    return out;
  }

  root.BlogCore = {
    LANGS: LANGS, LANG_CODES: LANG_CODES, LANG_LABEL: LANG_LABEL,
    META_TITLE_MAX: META_TITLE_MAX, META_DESC_MAX: META_DESC_MAX,
    BLOCK_STYLES: BLOCK_STYLES, IMG_POS: IMG_POS, IMG_SIZES: IMG_SIZES,
    SAVE_KEYS: SAVE_KEYS, MATCH_STOPWORDS: MATCH_STOPWORDS,

    esc: esc, slugify: slugify, duzMetin: duzMetin, wordCount: wordCount,
    clampText: clampText, toDtLocal: toDtLocal, htmlToPlain: htmlToPlain,
    stripLeadingNumber: stripLeadingNumber, stripHeadingTail: stripHeadingTail,
    cleanItemName: cleanItemName, stripCitationLinks: stripCitationLinks,
    stripSourcesFromRaw: stripSourcesFromRaw,

    mdInline: mdInline, mdToHtml: mdToHtml, mdToHtmlFallback: mdToHtmlFallback,
    toHtml: toHtml, parseMdArticle: parseMdArticle, mdSectionToBlocks: mdSectionToBlocks,

    bosMetinBlok: bosMetinBlok, ensureBlocks: ensureBlocks, normalizeBlock: normalizeBlock,
    sanitizeArticle: sanitizeArticle, blockText: blockText, itemName: itemName,
    itemImageUrl: itemImageUrl, itemHasImage: itemHasImage, totalWords: totalWords,

    sssCikar: sssCikar, faqDurumu: faqDurumu,
    articleHealth: articleHealth, slugKopmaUyarisi: slugKopmaUyarisi,
    junkCandidates: junkCandidates,

    tokensOf: tokensOf, matchScore: matchScore, bestMatch: bestMatch,
    savePayload: savePayload, articleOutline: articleOutline, basliklar: basliklar,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
