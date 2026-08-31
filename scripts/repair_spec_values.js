#!/usr/bin/env node
/**
 * Bozuk spec DEGERLERINI temiz Turkce kaynaktan yeniden turetir.
 *
 * NEDEN AYRI SCRIPT: repair_specs_canonical.js ANAHTARLARI kanoniklestirir,
 * degerlere dokunmaz. Degerlerde eski ceviri hattindan kalma bozukluk var ve
 * en gorunur yerde duruyor:
 *     Screen size = "6.3 I 'm not ."   (dogrusu "6.3 inches")
 *     Battery Specifications = "20 minutesda %50 Dolum"
 * Olculdu 2026-08-31 (400 urun / 24.140 deger): "I 'm not" 61 · "...da %" 46.
 * `inç` kaydi sozlukte BUGUN DOGRU; bozukluk veriye ESKI surumden kazinmis.
 *
 * NEDEN TAHMIN YOK: temiz Turkce kaynak DURUYOR (multiLangSpecs.tr ->
 * "Ekran Boyutu = 6.3 İnç") ve kuratorlu sozluk dogru cevirisini veriyor:
 *     resolve("6.3 İnç")               -> "6.3 inches"
 *     resolve("20 dakikada %50 Dolum") -> "50% charge in 20 minutes"
 *
 * ELENEN IKI YOL (olculdu, 200 Epey urunu):
 *   - localizeProduct ciktisini dogrudan yazmak:
 *       12.535 -> 10.988 spec = %12 ALAN KAYBI (AB enerji etiketi alanlari
 *       siliniyor: Enerji Sinifi, Onarilabilirlik Sinifi, Dusme Direnci).
 *       localizeProduct bir GORUNTULEME fonksiyonu, depolama kaynagi degil.
 *   - temiz hat + taban birlestirmek:
 *       12.535 -> 19.565 spec = KOPYA PATLAMASI; iki hat ayni olgu icin
 *       FARKLI kanonik anahtar uretiyor, "uzerine yazma" degil "ekleme" olur.
 *
 * BU SCRIPT: alan EKLEMEZ, SILMEZ, anahtar DEGISTIRMEZ. Yalnizca zaten var
 * olan bir anahtarin BOZUK degerini, ayni olgunun temiz Turkcesinden cevirir.
 * Eslesme kanonik anahtar uzerinden kurulur.
 *
 * Kullanim:
 *   node --require ./scripts/dns-patch.js scripts/repair_spec_values.js --dry --category=smartphones
 *   node --require ./scripts/dns-patch.js scripts/repair_spec_values.js --apply --category=smartphones
 */
'use strict';

const path = require('path');
const { req: pbReq } = require('../migration/pb');
const { req: tsReq } = require('../migration/ts');
require(path.join(__dirname, '..', 'admin', 'js', 'spec_i18n.js'));
const I18n = globalThis.QorAiSpecI18n;
const Canon = require(path.join(__dirname, '..', 'admin', 'js', 'spec_canonical.js'));

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CATEGORY = (argv.find((a) => a.startsWith('--category=')) || '').split('=')[1] || '';
const LIMIT = Number((argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const CONCURRENCY = Math.max(1, Number((argv.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4));

const FIELDS = ['id', 'name', 'category', 'source', 'specs', 'specsEn', 'keySpecs',
  'multiLangSpecs', 'multiLangSections', 'sourceLang'].join(',');

// SADECE OLCULEN BOZUKLUK SINIFLARI. Genis tutmak ("her Turkce degeri cevir")
// sozlukte olmayan kelimeyi yarim cevirip YENI bozukluk uretirdi -- ayni
// tuzaga etiket tarafinda dusuldu, bkz. admin/js/spec_canonical.js.
const BOZUK = /I\s*'m\s*not|\b(?:minutes|hours|seconds)da\b|\bthe\s+the\b/i;

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort()
    .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
const jsonEq = (a, b) => stableStringify(a || {}) === stableStringify(b || {});

// Typesense'in ARANABILIR alani. repair_specs_canonical.js ile ayni uretim --
// bozuk deger asil BURADA zarar veriyor: olculdu, keySpecsText su an
// "Screen size 6.3 I 'm not ." tasiyor, yani "6.3 inches" arayan kullanici
// telefonu BULAMIYOR. Bu yuzden deger yamasi keySpecsText'i de tazelemeli;
// yoksa PB duzelir, arama bozuk kalirdi.
function keySpecsText(product, patch) {
  const chunks = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => { chunks.push(k); visit(v); });
    } else chunks.push(String(value));
  };
  visit(patch.keySpecs || product.keySpecs);
  visit(patch.specs || product.specs);
  visit(product.specSections);
  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 60000);
}

// DEGERIN SAYISAL IMZASI: rakamlar ve yuzde isaretleri, sirasiyla.
//   "20 minutesda %50 Dolum"  ->  "20|%50"
//   "20 Dakikada %50 Dolum"   ->  "20|%50"     (ayni olgu)
//   "6.3 I 'm not ."          ->  "6.3"
//   "6.3 Inc"                 ->  "6.3"
// Kelimeler ceviri yuzunden ayrisiyor ama SAYILAR ayrismiyor.
function imza(text) {
  const m = String(text == null ? '' : text).match(/%?\d+(?:[.,]\d+)?/g);
  return m ? m.join('|') : '';
}

/** Kanonik anahtar -> temiz Turkce degerin cevirisi. */
function temizCeviriHaritasi(product) {
  const tr = (product.multiLangSpecs && product.multiLangSpecs.tr) || {};
  if (!Object.keys(tr).length) return null;
  let L;
  try { L = I18n.createSpecLocalizer(product, 'en'); } catch (_) { return null; }
  if (!L || typeof L.resolve !== 'function') return null;
  const harita = {};
  for (const [kTr, vTr] of Object.entries(tr)) {
    const ham = String(vTr == null ? '' : vTr).trim();
    if (!ham) continue;
    let cev;
    try { cev = L.resolve(ham); } catch (_) { continue; }
    // Ceviri yoksa ya da aynen dondiyse ATLA -- yarim ceviri uretme.
    if (!cev || String(cev) === ham) continue;
    if (BOZUK.test(String(cev))) continue;
    // IKI ANAHTARLA INDEKSLE.
    //
    // Stored anahtarlar Turkce DEGIL, eski sozlugun YARIM cevirisidir:
    //     TR "Batarya Ozellikleri"  ->  stored "Battery Specifications"
    // canonicalKey saf Turkce etiketi KASITLI olarak oldugu gibi birakiyor
    // (makineyle cevirmek "Sirali Okuma" -> "Sequential Okuma" hatasini
    // uretiyordu), bu yuzden TR anahtardan gelen kanonik ad stored anahtarla
    // ESLESMIYOR ve deger duzelmiyordu. Olculdu 2026-08-31: smartphones
    // ilk kosudan sonra %61,7 hala bozuk kaldi, hepsi bu koprunun eksikligi.
    //
    // Cozum: ayni degeri hem TR etiketin hem de o etiketin YARIM CEVRILMIS
    // halinin kanonik adiyla indeksle -- stored anahtar tam olarak ikincisi.
    const ekle = (etiket) => {
      const K = Canon.canonicalKey(etiket, ham, product.category || '');
      if (K && !harita[K]) harita[K] = String(cev);
    };
    ekle(kTr);
    try {
      const yarim = I18n.finalPassTurkishCleanup(kTr, 'en');
      if (yarim && String(yarim) !== kTr) ekle(String(yarim));
    } catch (_) { /* sozluk yoksa tek anahtar yeter */ }
  }
  return Object.keys(harita).length ? harita : null;
}

/**
 * IMZA KOPRUSU -- anahtar eslesmesi TUTMADIGINDA kullanilir.
 *
 * Stored anahtarlar ESKI sozluk surumunun yarim cevirisi; o surum elimizde
 * YOK. Olculdu 2026-08-31:
 *     TR "Batarya Ozellikleri"
 *       bugunku sozluk -> "Battery Features"
 *       stored veri    -> "Battery Specifications"
 * Yani tarihsel yarim ceviri YENIDEN URETILEMEZ; anahtardan koprü kurmak
 * bu alanlarda calismiyor (smartphones ilk kosudan sonra %61,7 bozuk kaldi).
 *
 * Ama DEGERIN SAYILARI cevirilerden etkilenmiyor. Bu yuzden bozuk stored
 * degerin imzasi, ayni urunun TR kaynagindaki bir degerin imzasiyla
 * eslestirilir. TEKLIK SARTI var: imza birden fazla TR alanina denk
 * geliyorsa DOKUNULMAZ -- yanlis alani yazmaktansa bozuk birakmak yeglenir.
 */
function imzaHaritasi(product) {
  const tr = (product.multiLangSpecs && product.multiLangSpecs.tr) || {};
  if (!Object.keys(tr).length) return null;
  let L;
  try { L = I18n.createSpecLocalizer(product, 'en'); } catch (_) { return null; }
  if (!L || typeof L.resolve !== 'function') return null;
  const sayac = {};
  const harita = {};
  for (const vTr of Object.values(tr)) {
    const ham = String(vTr == null ? '' : vTr).trim();
    const sig = imza(ham);
    if (!ham || !sig) continue;
    sayac[sig] = (sayac[sig] || 0) + 1;
    let cev;
    try { cev = L.resolve(ham); } catch (_) { continue; }
    if (!cev || String(cev) === ham || BOZUK.test(String(cev))) continue;
    harita[sig] = String(cev);
  }
  // Teklik: birden fazla alana denk gelen imzayi AT.
  for (const sig of Object.keys(harita)) if (sayac[sig] !== 1) delete harita[sig];
  return Object.keys(harita).length ? harita : null;
}

// "I 'm not" HER ZAMAN "İnç"IN BOZUK CEVIRISI -- olculdu, istisna yok.
// 2100 urun tarandi, kalan 5 satirin BESININ DE Turkce karsiliginda `İnç`
// geciyor:
//     "N/N <<X>> Sensor Size"  <->  "N/N İnç Sensör Boyutu"   (3)
//     "N <<X>>"                <->  "N İnç"                    (2)
// Bugunku sozluk de `inç -> inches` diyor. Bu yuzden jeton degisimi TAHMIN
// DEGIL, kanitla sabit: satirin geri kalanina DOKUNULMAZ, yalnizca bozuk
// jeton yerine `inches` yazilir ("1/1.56 I 'm not . Sensor Size" ->
// "1/1.56 inches Sensor Size").
const NL = String.fromCharCode(10);
const INC_BOZUK = /I\s*'m\s*not\s*\.?/gi;

function duzelt(map, harita, sigHarita, satirHarita) {
  if (!map || typeof map !== 'object') return { out: map, n: 0 };
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(map)) {
    const s = String(v == null ? '' : v);
    if (!BOZUK.test(s)) { out[k] = v; continue; }

    // 1) anahtar eslesmesi (deger BUTUN olarak)
    let yeni = harita[k];
    // 2) tutmazsa degerin imzasi (yine butun olarak)
    if (!yeni && sigHarita) yeni = sigHarita[imza(s)];

    // 3) tutmazsa SATIR SATIR. Cok satirli degerlerde bozukluk tek satirda
    //    oluyor ("Bypass Charge / Dual-cell Battery / 15 minutesda %50 Dolum")
    //    ve degerin tamami eslesmedigi icin oncekiler bu satirlari
    //    kaciriyordu -- ilk kosudan sonra kalan %7,2 tam olarak buydu.
    if (!yeni && satirHarita) {
      const satirlar = s.split(NL);
      let degisti = false;
      const yeniSatirlar = satirlar.map((satir) => {
        if (!BOZUK.test(satir)) return satir;
        const c = satirHarita[imza(satir)];
        if (c && !BOZUK.test(c)) { degisti = true; return c; }
        // Satir eslesmedi: hic olmazsa kanitli jetonu duzelt.
        if (INC_BOZUK.test(satir)) {
          INC_BOZUK.lastIndex = 0;
          const d = satir.replace(INC_BOZUK, 'inches').replace(/\s+/g, ' ').trim();
          if (d !== satir) { degisti = true; return d; }
        }
        return satir;
      });
      if (degisti) yeni = yeniSatirlar.join(NL);
    }

    // 4) son care: kanitli jeton degisimi (tek satirli degerler icin)
    if (!yeni) {
      INC_BOZUK.lastIndex = 0;
      if (INC_BOZUK.test(s)) {
        INC_BOZUK.lastIndex = 0;
        const d = s.replace(INC_BOZUK, 'inches').replace(/[ 	]+/g, ' ').trim();
        if (d !== s) yeni = d;
      }
    }

    if (yeni && String(yeni) !== s) { out[k] = yeni; n += 1; } else out[k] = v;
  }
  return { out, n };
}

/** SATIR bazli imza haritasi -- cok satirli degerler icin. Teklik sarti ayni. */
function satirImzaHaritasi(product) {
  const tr = (product.multiLangSpecs && product.multiLangSpecs.tr) || {};
  if (!Object.keys(tr).length) return null;
  let L;
  try { L = I18n.createSpecLocalizer(product, 'en'); } catch (_) { return null; }
  if (!L || typeof L.resolve !== 'function') return null;
  const sayac = {};
  const harita = {};
  for (const vTr of Object.values(tr)) {
    for (const satir of String(vTr == null ? '' : vTr).split(NL)) {
      const ham = satir.trim();
      const sig = imza(ham);
      if (!ham || !sig) continue;
      sayac[sig] = (sayac[sig] || 0) + 1;
      let cev;
      try { cev = L.resolve(ham); } catch (_) { continue; }
      if (!cev || String(cev) === ham || BOZUK.test(String(cev))) continue;
      harita[sig] = String(cev);
    }
  }
  for (const sig of Object.keys(harita)) if (sayac[sig] !== 1) delete harita[sig];
  return Object.keys(harita).length ? harita : null;
}

function buildPatch(p) {
  const harita = temizCeviriHaritasi(p);
  const sigHarita = imzaHaritasi(p);
  const satirHarita = satirImzaHaritasi(p);
  if (!harita && !sigHarita && !satirHarita) return null;
  const patch = {};
  let toplam = 0;
  for (const alan of ['specs', 'specsEn', 'keySpecs']) {
    const r = duzelt(p[alan], harita || {}, sigHarita, satirHarita);
    if (r.n && !jsonEq(r.out, p[alan])) { patch[alan] = r.out; toplam += r.n; }
  }
  const mlEn = (p.multiLangSpecs && p.multiLangSpecs.en) || null;
  if (mlEn) {
    const r = duzelt(mlEn, harita || {}, sigHarita, satirHarita);
    if (r.n && !jsonEq(r.out, mlEn)) {
      patch.multiLangSpecs = Object.assign({}, p.multiLangSpecs, { en: r.out });
      toplam += r.n;
    }
  }
  return toplam ? { patch, toplam } : null;
}

async function fetchProducts() {
  const out = [];
  let lastId = '';
  for (;;) {
    const f = [];
    if (CATEGORY) f.push('category = "' + CATEGORY + '"');
    if (lastId) f.push('id > "' + lastId + '"');
    const filter = f.length ? '&filter=' + encodeURIComponent(f.join(' && ')) : '';
    const url = '/api/collections/products/records?perPage=500&page=1&sort=id&skipTotal=1'
      + '&fields=' + encodeURIComponent(FIELDS) + filter;
    const r = await pbReq('GET', url);
    if (r.status !== 200) throw new Error('fetch: ' + r.status);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length) lastId = items[items.length - 1].id;
    if ((LIMIT && out.length >= LIMIT) || items.length < 500) break;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

async function runPool(items, worker) {
  let i = 0;
  const n = Math.min(CONCURRENCY, items.length || 1);
  await Promise.all(Array.from({ length: n }, async () => {
    for (;;) { const it = items[i]; i += 1; if (!it) break; await worker(it); }
  }));
}

(async () => {
  console.log('[deger] mode=' + (APPLY ? 'APPLY' : 'DRY') + ' category=' + (CATEGORY || 'hepsi'));
  const list = await fetchProducts();
  console.log('[deger] ' + list.length + ' urun yuklendi');
  let urun = 0; let alan = 0; let pbOk = 0; let pbHata = 0;
  const ornek = [];
  await runPool(list, async (p) => {
    const res = buildPatch(p);
    if (!res) return;
    urun += 1; alan += res.toplam;
    if (ornek.length < 6) {
      // YALNIZ GERCEKTEN DEGISEN alani ornekle: patch tum haritayi tasiyor,
      // "eskisi bozuk" demek "duzeldi" demek DEGIL (sozlukte karsiligi
      // olmayan alan aynen kaliyor -- kasitli, yarim ceviri uretmemek icin).
      const k = Object.keys(res.patch.specs || {})
        .find((x) => BOZUK.test(String((p.specs || {})[x]))
          && String(res.patch.specs[x]) !== String((p.specs || {})[x]));
      if (k) {
        ornek.push(p.name.slice(0, 28) + ' | ' + k + ': "'
          + String(p.specs[k]).slice(0, 24) + '" -> "' + res.patch.specs[k] + '"');
      }
    }
    if (!APPLY) return;
    const r = await pbReq('PATCH', '/api/collections/products/records/' + p.id, res.patch);
    if (r.status === 200) {
      pbOk += 1;
      try {
        await tsReq('PATCH', '/collections/products/documents/' + encodeURIComponent(p.id), {
          _raw: JSON.stringify(Object.assign({}, p, res.patch)),
          keySpecsText: keySpecsText(p, res.patch),
        });
      } catch (_) { /* TS gece senkronunda toparlar */ }
    } else { pbHata += 1; console.warn('[uyari] ' + p.id + ' PB ' + r.status); }
  });
  console.log('[deger] duzelen urun=' + urun + ' alan=' + alan + ' pb=' + pbOk + '/' + pbHata);
  ornek.forEach((o) => console.log('   ', o));
  if (!APPLY) console.log('[deger] kuru kosu; yazmak icin --apply');
})().catch((e) => { console.error('[deger] fatal:', e); process.exit(1); });
