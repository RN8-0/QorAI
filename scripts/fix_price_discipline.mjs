// ═══════════════════════════════════════════════════════════════════════════
//  YAYINLANMIS ANALIZLERE FIYAT DISIPLINI UYGULA
//
//  Kosum:  node scripts/fix_price_discipline.mjs          (deneme, yazmaz)
//          node scripts/fix_price_discipline.mjs --yaz    (PB'ye yazar)
//
//  NE DUZELTIR (hepsi olculdu, uydurma degil):
//    · YABANCI PAZAR FIYATI. Katalogda TRY fiyati olan iPhone 17 Pro Max,
//      arastirma notlarindaki Ingiltere fiyatiyla anlatilmisti: alti ayri
//      yerde "1189 GBP", biri duz yanlis ("Turkiye pazarindaki 1189 GBP").
//    · UYARI LISTELERINDE FIYAT. cons / criticalPoints / decisiveDifferences
//      icinde fiyat cumleleri.
//    · HAM SAYI BICIMI. "88968.45 TRY" -> "88.968,45 TL".
//    · YABANCI PARA ETKENI. priceForecast.drivers icinde "GBP kur
//      dalgalanmalari" gibi, Turkiye fiyatiyla ilgisi olmayan maddeler.
//
//  AI CAGRISI YOK. Dogru fiyat KATALOGDAN okunur; katalogda fiyat yoksa
//  rakam UYDURULMAZ, cumle atilir.
//
//  PARAGRAF RENKLERI TASINIR. `paragraphSentiment` anahtarlari paragraf
//  metninin kendisi; metin degisince anahtar tutmaz ve renk kaybolur. Bu
//  tuzaga fix_usd_prices.mjs'te bir kez dusuldu, burada bastan kapatildi.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import '../admin/js/qor_ai_prompts.js';

const P = globalThis.QorAiPrompts;
const YAZ = process.argv.includes('--yaz');
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

const env = Object.fromEntries(fs.readFileSync(new URL('../migration/.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const T = (await (await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
})).json()).token;
const H = { Authorization: T };

// ── katalog fiyati ─────────────────────────────────────────────────────────
const onbellek = new Map();
async function katalogKaydi(anahtar, tur) {
  const k = `${tur}:${anahtar}`;
  if (onbellek.has(k)) return onbellek.get(k);
  let rec = null;
  try {
    if (tur === 'id') {
      rec = await (await fetch(`${PB_URL}/api/collections/products/records/${anahtar}`, { headers: H })).json();
    } else {
      const q = encodeURIComponent(`slug="${anahtar}"`);
      const j = await (await fetch(`${PB_URL}/api/collections/products/records?perPage=1&filter=${q}`, { headers: H })).json();
      rec = (j.items || [])[0] || null;
    }
  } catch (_) { rec = null; }
  if (rec && rec.id) {
    const f = P.segmentPriceLocal(rec, 'tr');
    rec = Number(f?.v) > 0 ? { tutar: Number(f.v), para: String(f.cur || '').toUpperCase() } : null;
  } else rec = null;
  onbellek.set(k, rec);
  return rec;
}

/** Rapordaki urun dugumlerinden ad -> katalog fiyati haritasi. */
async function fiyatHaritasi(rec, rapor) {
  const harita = {};
  const urunler = Array.isArray(rapor?.products) ? rapor.products
    : (rapor?.product ? [{ ...rapor.product, url: '' }] : []);
  for (const u of urunler) {
    let f = null;
    const slug = String(u?.url || '').replace(/^\/product\//, '').trim();
    if (slug) f = await katalogKaydi(slug, 'slug');
    if (!f && rec.productId) f = await katalogKaydi(rec.productId, 'id');
    if (f && u?.name) harita[u.name] = f;
  }
  return harita;
}

// ── paragraf renkleri ──────────────────────────────────────────────────────
// `nesirParagraflari` qor_ai_run.js icinde ve o dosya tarayici IIFE'si.
// Ikinci bir kopya yazmak yerine FONKSIYONU CIKARIP kullaniyoruz — iki
// taraf paragrafi farkli bolerse anahtarlar tutmaz.
const runSrc = fs.readFileSync(new URL('../admin/js/qor_ai_run.js', import.meta.url), 'utf8');
const bas = runSrc.indexOf('var NESIR_ALANLARI = [');
const son = runSrc.indexOf('/**', runSrc.indexOf('function nesirParagraflari'));
// eslint-disable-next-line no-new-func
const nesirParagraflari = new Function('P', `${runSrc.slice(bas, son)}\nreturn nesirParagraflari;`)(P);

const ilkCumle = (s) => String(s).split(/(?<=[.!?…])\s+/)[0];

/* ANAHTAR NORMALLESTIRMESI OKUMA TARAFININ AYNISI OLMAK ZORUNDA.
   Ilk surum ham dize esitligi ariyordu ve ESKI kayitlarda 0/51 renk
   esledi: o kayitlarin anahtarlarini RAPOR MODELI yazmis ve tam paragraf
   yerine ILK CUMLEYI koymus. Okuma tarafi zaten paragraphKey()'den
   geciriyor (web/src/lib/sentiment.js), biz de ondan geciriyoruz. */
function paragraphKey(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const ilk = t.split(/(?<=[.!?])\s+/)[0] || t;
  return ilk.toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim().slice(0, 90).trim();
}

/* Tutarlar atilmis anahtar. Ayni paragrafin fiyati degistiginde iki
   surumu birbirine baglayan tek sabit budur. */
const FIYAT_ATOM = /(?:[$€£₺¥]\s?\d[\d.,]*)|(?:\d[\d.,]*\s?(?:USD|EUR|GBP|TRY|TL|JPY|CNY|INR|AED|PLN|SEK|CHF|CAD|AUD|RUB|KRW)\b)|(?:\d[\d.,]*\s?[$€£₺¥])/gi;
const fiyatsizAnahtar = (t) => paragraphKey(String(t || '').replace(FIYAT_ATOM, ' '));

/** Metni degisen paragraflarin rengini yeni metne tasir. */
function renkleriTasi(eskiHarita, eskiPar, yeniPar) {
  // Eski harita ANAHTARLA indekslenir (anahtar ham paragraf da olabilir,
  // ilk cumle de — ikisi de ayni paragraphKey()'e duser).
  const indeks = new Map();
  for (const [k, v] of Object.entries(eskiHarita)) {
    const nk = paragraphKey(k);
    if (nk) indeks.set(nk, v);
  }
  // Metni degismis paragraflar icin: eski paragrafin ANAHTARINDAN yenisine.
  const eskiIlkler = eskiPar.map((e) => ({
    ilk: ilkCumle(e), anahtar: paragraphKey(e), fiyatsiz: fiyatsizAnahtar(e), metin: e,
  }));

  const out = {};
  let tasinan = 0;
  for (const yeni of yeniPar) {
    const nk = paragraphKey(yeni);
    if (!nk) continue;
    // 1) Metin degismedi.
    if (indeks.has(nk)) { out[yeni] = indeks.get(nk); continue; }
    // 2) Bas cumlesi atilmis: yeni ilk cumleyi ICEREN eski paragraf.
    const ilk = ilkCumle(yeni);
    let eski = eskiIlkler.find((e) => e.metin.includes(ilk) || ilk.includes(e.ilk));
    // 3) Yalnizca TUTAR degismis: fiyatsiz anahtarlar esitse ayni paragraf.
    if (!eski || !indeks.has(eski.anahtar)) {
      const fk = fiyatsizAnahtar(yeni);
      if (fk) eski = eskiIlkler.find((e) => e.fiyatsiz === fk);
    }
    if (eski && indeks.has(eski.anahtar)) { out[yeni] = indeks.get(eski.anahtar); tasinan += 1; }
  }
  return { harita: out, tasinan };
}

/** Bir paragrafin haritada rengi var mi? (okuma tarafiyla ayni anahtar) */
function indeksliMi(harita, paragraf) {
  const nk = paragraphKey(paragraf);
  if (!nk) return false;
  return Object.keys(harita).some((k) => paragraphKey(k) === nk);
}

// ── kosu ───────────────────────────────────────────────────────────────────
const liste = await (await fetch(`${PB_URL}/api/collections/analyses/records?perPage=200`, { headers: H })).json();
let dokunulan = 0; let toplamAlan = 0; let toplamTasinan = 0; let kayipVar = 0;

for (const rec of liste.items) {
  const yama = {};
  const notlar = [];
  for (const lang of ['tr', 'en']) {
    const rep = rec[`report_${lang}`];
    if (!rep || typeof rep !== 'object') continue;
    const kopya = JSON.parse(JSON.stringify(rep));

    const eskiHarita = (kopya.paragraphSentiment && typeof kopya.paragraphSentiment === 'object')
      ? { ...kopya.paragraphSentiment } : {};
    const eskiPar = nesirParagraflari(kopya);

    const harita = await fiyatHaritasi(rec, kopya);
    const n = P.enforcePriceDiscipline(kopya, harita, lang);
    if (!n) continue;

    // Renkler YENI metne tasinir.
    if (Object.keys(eskiHarita).length) {
      const yeniPar = nesirParagraflari(kopya);
      const { harita: yeniHarita, tasinan } = renkleriTasi(eskiHarita, eskiPar, yeniPar);
      kopya.paragraphSentiment = yeniHarita;
      toplamTasinan += tasinan;
      /* ONCE/SONRA: "bugunku paragraflarin kaci renkli". Eski haritanin
         BOYUTUNA bolmek yaniltiyordu -- o haritada hicbir paragrafa denk
         dusmeyen bayat anahtarlar da var (olculdu: 17 anahtar, 10 paragraf). */
      const oncekiRenkli = eskiPar.filter((x) => indeksliMi(eskiHarita, x)).length;
      const sonrakiRenkli = yeniPar.filter((x) => indeksliMi(yeniHarita, x)).length;
      const isaret = sonrakiRenkli < oncekiRenkli ? '  ← KAYIP' : '';
      notlar.push(`${lang}: ${n} alan · renk ${oncekiRenkli}/${eskiPar.length} → `
        + `${sonrakiRenkli}/${yeniPar.length}${isaret}`);
      if (sonrakiRenkli < oncekiRenkli) kayipVar += 1;
    } else {
      notlar.push(`${lang}: ${n} alan`);
    }
    yama[`report_${lang}`] = kopya;
    toplamAlan += n;
  }

  if (!Object.keys(yama).length) continue;
  dokunulan += 1;
  console.log(`### ${rec.slug}`);
  notlar.forEach((x) => console.log(`   ${x}`));
  if (YAZ) {
    const w = await fetch(`${PB_URL}/api/collections/analyses/records/${rec.id}`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(yama),
    });
    console.log(`   yazıldı: ${w.status}`);
  }
}

console.log(`\n${dokunulan} kayıt · ${toplamAlan} alan · ${toplamTasinan} paragraf rengi taşındı`
  + `${YAZ ? '' : '  (DENEME — yazılmadı)'}`);
if (kayipVar) {
  console.log(`UYARI: ${kayipVar} dil-kaydında renkli paragraf sayısı DÜŞTÜ.`);
  process.exitCode = 1;
} else console.log('Renk kaybı yok.');
