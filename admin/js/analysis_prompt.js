// ═══════════════════════════════════════════════════════════════════════════
//  YAYINLANABILIR URUN ANALIZI — prompt + sema. TEK KOPYA.
//
//  IKI TUKETICI, TEK DOSYA (admin/js/spec_i18n.js ile ayni desen):
//    · admin/js/analyses.js        — tarayici, klasik <script>
//    · web/scripts/gen-analysis.mjs — Node, scripts/_spec_sandbox.mjs ile
//  Ayni metni uretmek zorunda olan iki taraf ayni DOSYAYI kosturmali; "ayni
//  mantigi iki yerde tut" kacinilmaz olarak ayrisir ve ayristigi gun kimse
//  fark etmez. Bu proje o dersi spec cevirisinde bir kez odedi.
//
//  BU, SITEDEKI ETKILESIMLI RAPOR DEGILDIR. web/src/components/AiAnalysis.jsx
//  icindeki buildFullPrompt() kullaniciya OZEL, quiz cevaplariyla beslenen ve
//  ekranda cizilen bir rapor uretir. Buradaki ise YAYINA yonelik: tek bir
//  editoryal analiz metni, herkes icin ayni, SEO sayfasi olacak. Farkli
//  amaclar, farkli ciktilar — kopya degil.
//
//  KURAL: bu prompt urun basina OTOMATIK kosturulmaz. 107k urune AI metni
//  basmak, spec sayfalarindaki olcekli-icerik problemini AI metniyle yeniden
//  kurar. Her kayit admin panelinden insan onayiyla yayina alinir.
// ═══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  var DIL_ADI = { tr: 'Türkçe', en: 'English' };

  // Modelin dilden sapmasini engelleyen kapi. Olculdu (blog uretiminde):
  // "write in Turkish" tek basina yetmiyor, model baslikta Ingilizce kaliyordu.
  function dilKapisi(lang) {
    var ad = DIL_ADI[lang] || DIL_ADI.tr;
    return 'LANGUAGE: write EVERY string value in ' + ad + '. '
      + 'This includes titles, headings, list items and the FAQ. '
      + 'Do not mix languages. Keep product names, brand names and technical '
      + 'abbreviations (RAM, OLED, USB-C, Wi-Fi) exactly as given.';
  }

  // Uydurma engeli. Fiyat/yorum sayisi/alintiyi model UYDURUR; bunlar sayfada
  // dogrulanamaz iddia olur ve E-E-A-T'yi dusurur.
  function dogrulukKurallari() {
    return [
      'EVIDENCE RULES:',
      '- Use ONLY the catalog specs given below as factual product data.',
      '- Never invent exact prices, review counts, ratings, benchmark numbers or direct quotes.',
      '- If something is not in the given data, either omit it or clearly mark it as uncertain.',
      '- Do not claim availability, release dates or stock status that is not given.',
      '- No marketing filler ("game changer", "revolutionary"). Write like a buyer lab report.',
    ].join('\n');
  }

  function specSatiri(specs) {
    if (!specs || typeof specs !== 'object') return '-';
    var out = [];
    for (var k in specs) {
      if (!Object.prototype.hasOwnProperty.call(specs, k)) continue;
      var v = specs[k];
      if (v == null || v === '') continue;
      out.push(k + ': ' + v);
      if (out.length >= 24) break;
    }
    return out.length ? out.join(' · ') : '-';
  }

  /**
   * urun: { name, brand, category, techScore, specs, price, alternatives }
   *   alternatives: [{name, techScore, price}] — ayni kategoriden, ic link icin
   * lang: 'tr' | 'en'
   */
  function buildYayinAnaliziPrompt(urun, lang) {
    var p = urun || {};
    var ad = String(p.name || '').trim();
    var marka = String(p.brand || '').trim();
    var kat = String(p.category || '').trim();
    var skor = Number(p.techScore) || 0;
    var alt = Array.isArray(p.alternatives) ? p.alternatives : [];

    return [
      'You are Qor AI\'s senior product analyst. Write a publishable, standalone buyer analysis of "' + ad + '"'
        + (marka ? ' by ' + marka : '') + (kat ? ' (category: ' + kat + ')' : '') + '.',
      'This is editorial content for a public product page — not a chat answer. It must stand on its own and be worth reading for someone deciding whether to buy.',
      '',
      dilKapisi(lang),
      '',
      dogrulukKurallari(),
      '',
      'Return ONLY one valid JSON object with this exact structure:',
      '{',
      '  "title": "<60 chars. Product name + the angle of the analysis. No clickbait.>",',
      '  "lead": "<2 sentences, max 300 chars. The verdict in short, so a reader knows the answer before scrolling.>",',
      '  "metaDescription": "<max 155 chars, written for search results>",',
      '  "sections": [',
      '    {"h": "<section heading>", "body": "<3-5 paragraphs separated by \\n\\n, 50-90 words each>"}',
      '  ],',
      '  "strengths": ["<5 concrete strengths, each tied to a real spec>"],',
      '  "weaknesses": ["<4 honest weaknesses or trade-offs>"],',
      '  "bestFor": "<2 sentences: who should buy this>",',
      '  "notFor": "<2 sentences: who should skip it>",',
      '  "verdict": "<3-4 sentences closing verdict, decisive>",',
      '  "faq": [{"q": "<a question a buyer actually types>", "a": "<2-3 sentence answer>"}]',
      '}',
      '',
      'Structure rules:',
      // Bolumler ile strengths/weaknesses AYNI SEYI ANLATMAMALI. Ilk surumde
      // prompt bolumlerden birini "where it is strong" diye tarif ediyordu ve
      // sayfada "Güçlü Yönleri" (bolum) ile "Güçlü yanları" (liste) ALT ALTA
      // cikiyordu — ayni icerik iki kez. Artik gucler/zayifliklar YALNIZ
      // yapilandirilmis listelerde; bolumler baska konulari isler.
      '- sections: exactly 5 sections. Cover in this order: what it is and who it is aimed at; the specs that actually matter and what they mean in daily use; how it compares with the listed alternatives; what owning it is like over time (durability, ecosystem, running costs); and practical buying advice (which configuration, what to check before paying).',
      '- Do NOT write a "strengths" or "weaknesses" section — those are returned separately as lists and would be printed twice.',
      '- faq: exactly 5 questions. They must be questions a real buyer types into a search box, not restated headings.',
      '- Mention the alternatives listed below by name at least once, in the comparison section.',
      '- Never repeat the same sentence structure across sections.',
      '',
      'PRODUCT DATA (this is your only factual source):',
      'Name: ' + (ad || '-'),
      'Brand: ' + (marka || '-'),
      'Category: ' + (kat || '-'),
      'Qor AI Tech Score: ' + (skor ? skor + '/100' : 'not scored'),
      'Catalog specs: ' + specSatiri(p.specs),
      '',
      'SAME-CATEGORY ALTERNATIVES (for the comparison section and internal links):',
      alt.length
        ? alt.slice(0, 5).map(function (a) {
          return '- ' + a.name + (a.techScore ? ' (Tech Score ' + a.techScore + '/100)' : '');
        }).join('\n')
        : '- none provided',
    ].join('\n');
  }

  // Modelin dondurdugu JSON'u YAYINA UYGUN hale getirir: eksik alan tamamlanir,
  // fazlalik atilir, uzunluk sinirlari uygulanir. Admin paneli bu sekle guvenir.
  function normalizeAnaliz(ham) {
    var o = (ham && typeof ham === 'object') ? ham : {};
    var dizi = function (v, n) { return (Array.isArray(v) ? v : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean).slice(0, n); };
    var metin = function (v, n) { var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return n && s.length > n ? s.slice(0, n - 1).replace(/[\s,;:.-]+$/, '') : s; };
    return {
      title: metin(o.title, 70),
      lead: metin(o.lead, 320),
      metaDescription: metin(o.metaDescription, 158),
      sections: (Array.isArray(o.sections) ? o.sections : []).slice(0, 6).map(function (s) {
        return { h: metin(s && s.h, 90), body: String((s && s.body) || '').trim() };
      }).filter(function (s) { return s.h && s.body; }),
      strengths: dizi(o.strengths, 6),
      weaknesses: dizi(o.weaknesses, 6),
      bestFor: metin(o.bestFor, 400),
      notFor: metin(o.notFor, 400),
      verdict: String(o.verdict || '').trim(),
      faq: (Array.isArray(o.faq) ? o.faq : []).slice(0, 6).map(function (f) {
        return { q: metin(f && f.q, 160), a: String((f && f.a) || '').trim() };
      }).filter(function (f) { return f.q && f.a; }),
    };
  }

  // Normalize edilmis analizi, `analyses` koleksiyonunun `body_*` alanina
  // gidecek HTML'e cevirir. Izin verilen etiketler blog gövdesiyle ayni
  // (seo.mjs safeBodyHtml ile uyumlu): h2/h3/p/ul/li/strong/em.
  // Govde basliklari DILE GORE. Ilk surumde sabit Turkce yazilmisti ve
  // Ingilizce analiz sayfasinda "Kime uygun?" cikiyordu — Faz 0'da tum siteden
  // temizledigimiz dil sizintisinin aynisi.
  var GOVDE_ETIKET = {
    tr: { strengths: 'Güçlü yanları', weaknesses: 'Zayıf yanları', who: 'Kime uygun?', best: 'Alması gereken', not: 'Almaması gereken' },
    en: { strengths: 'Strengths', weaknesses: 'Weaknesses', who: 'Who is it for?', best: 'Buy it if', not: 'Skip it if' },
  };

  function analizHtml(a, lang) {
    var L = GOVDE_ETIKET[lang] || GOVDE_ETIKET.tr;
    var esc = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    var paragraflar = function (body) {
      return String(body || '').split(/\n{2,}/).map(function (p) {
        var t = p.replace(/\s+/g, ' ').trim();
        return t ? '<p>' + esc(t) + '</p>' : '';
      }).join('');
    };
    var out = [];
    (a.sections || []).forEach(function (s) {
      out.push('<h2>' + esc(s.h) + '</h2>');
      out.push(paragraflar(s.body));
    });
    if ((a.strengths || []).length) {
      out.push('<h2>' + esc(L.strengths) + '</h2><ul>');
      a.strengths.forEach(function (s) { out.push('<li>' + esc(s) + '</li>'); });
      out.push('</ul>');
    }
    if ((a.weaknesses || []).length) {
      out.push('<h2>' + esc(L.weaknesses) + '</h2><ul>');
      a.weaknesses.forEach(function (s) { out.push('<li>' + esc(s) + '</li>'); });
      out.push('</ul>');
    }
    if (a.bestFor || a.notFor) {
      out.push('<h2>' + esc(L.who) + '</h2>');
      if (a.bestFor) out.push('<p><strong>' + esc(L.best) + ':</strong> ' + esc(a.bestFor) + '</p>');
      if (a.notFor) out.push('<p><strong>' + esc(L.not) + ':</strong> ' + esc(a.notFor) + '</p>');
    }
    return out.join('');
  }

  var API = {
    buildYayinAnaliziPrompt: buildYayinAnaliziPrompt,
    normalizeAnaliz: normalizeAnaliz,
    analizHtml: analizHtml,
    DIL_ADI: DIL_ADI,
  };

  root.QorAiAnalysisPrompt = API;
}(typeof globalThis !== 'undefined' ? globalThis : this));
