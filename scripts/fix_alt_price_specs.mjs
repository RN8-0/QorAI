// ═══════════════════════════════════════════════════════════════════════════
//  ALTERNATIF KARTLARINDAKI CEVRILMIS USD FIYAT CIPINI ONAR
//
//  Kosum:  node scripts/fix_alt_price_specs.mjs          (deneme, yazmaz)
//          node scripts/fix_alt_price_specs.mjs --yaz    (PB'ye yazar)
//
//  NEDEN: yayinlanan analizlerin `alternatives[].keySpecs` listesinde
//  {"label":"Price","value":"2165 USD"} gibi satirlar var. O sayi gercek bir
//  fiyat DEGIL: yerel fiyatin bayat kur tablosundan gecirilmis hali.
//  Olculdu 2026-09-03, Apple iPhone 15 Plus (512 GB):
//      priceTR         75.699        <- gercek, o pazarda okunmus
//      lowestPriceUSD   2.164,99     <- 75.699 x 0,0286
//  Model alternatif adaylarini FIYATSIZ aldigi icin bosluga elindeki tek
//  sayiyi koymustu. Uretim tarafi duzeltildi (qor_ai_prompts.js ->
//  segmentPriceLocal artik `pricesByCountry` / `priceTR`'den okuyor).
//
//  KURAL (kullanici): kur ile islem YAPILMAZ. Bu betik de yapmaz.
//
//  AI CAGRISI YOK. Dogru fiyat katalogdan okunur; katalogda fiyat yoksa
//  satir SILINIR, tahmin edilmez.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';

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

const FIYAT_ETIKETI = /^(price|fiyat|preis|prix)$/i;
const USD_DEGERI = /\b\d[\d.,]*\s*(USD|\$)/i;

const ULKE_PARA = { TR: 'TRY', US: 'USD', GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR' };

/** Katalogdan GERCEK yerel fiyat. Cevrim yok; yoksa bos doner. */
const onbellek = new Map();
async function katalogFiyati(productId) {
  if (!productId) return '';
  if (onbellek.has(productId)) return onbellek.get(productId);
  let etiket = '';
  try {
    const pr = await (await fetch(`${PB_URL}/api/collections/products/records/${productId}`, { headers: H })).json();
    if (Number(pr.lowestPrice) > 0) {
      etiket = `${Number(pr.lowestPrice).toLocaleString('tr-TR')} ${pr.lowestPriceCurrency || ''}`.trim();
    } else {
      // `prices` alani ulke -> tutar. Ilk dolu ulkeyi kendi para biriminde yaz.
      let harita = pr.prices;
      if (typeof harita === 'string') { try { harita = JSON.parse(harita); } catch (_) { harita = null; } }
      if (harita && typeof harita === 'object') {
        const ulke = Object.keys(harita).find((c) => Number(harita[c]?.price ?? harita[c]) > 0);
        if (ulke) {
          const tutar = Number(harita[ulke]?.price ?? harita[ulke]);
          etiket = `${tutar.toLocaleString('tr-TR')} ${ULKE_PARA[ulke.toUpperCase()] || ulke.toUpperCase()}`;
        }
      }
    }
  } catch (_) { etiket = ''; }
  onbellek.set(productId, etiket);
  return etiket;
}

const liste = await (await fetch(`${PB_URL}/api/collections/analyses/records?perPage=200`, { headers: H })).json();
let dokunulan = 0; let duzeltilen = 0; let silinen = 0;

for (const rec of liste.items) {
  const yama = {};
  for (const lang of ['tr', 'en']) {
    const rep = rec[`report_${lang}`];
    if (!rep || typeof rep !== 'object') continue;
    const kopya = JSON.parse(JSON.stringify(rep));
    let n = 0;

    // Alternatif listeleri hem tekil raporda hem karsilastirmada olabilir.
    const kumeler = [];
    if (Array.isArray(kopya.alternatives)) kumeler.push(kopya.alternatives);
    if (Array.isArray(kopya.products)) {
      kopya.products.forEach((p) => { if (Array.isArray(p?.alternatives)) kumeler.push(p.alternatives); });
    }

    for (const kume of kumeler) {
      for (const alt of kume) {
        if (!alt || !Array.isArray(alt.keySpecs)) continue;
        const kalanlar = [];
        for (const spec of alt.keySpecs) {
          const fiyatSatiri = FIYAT_ETIKETI.test(String(spec?.label || '').trim())
            && USD_DEGERI.test(String(spec?.value || ''));
          if (!fiyatSatiri) { kalanlar.push(spec); continue; }
          const dogru = await katalogFiyati(alt.productId);
          if (dogru) {
            console.log(`   ${alt.name}: "${spec.value}" -> "${dogru}"`);
            kalanlar.push({ ...spec, value: dogru });
            duzeltilen += 1;
          } else {
            // UYDURMA YOK: katalogda fiyat yoksa cip komple duser. Sayfada
            // zaten canli magaza listesi var.
            console.log(`   ${alt.name}: "${spec.value}" -> SATIR SILINDI (katalogda fiyat yok)`);
            silinen += 1;
          }
          n += 1;
        }
        alt.keySpecs = kalanlar;
      }
    }
    if (n) yama[`report_${lang}`] = kopya;
  }

  if (!Object.keys(yama).length) continue;
  console.log(`### ${rec.slug}`);
  dokunulan += 1;
  if (YAZ) {
    const w = await fetch(`${PB_URL}/api/collections/analyses/records/${rec.id}`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(yama),
    });
    console.log(`   yazıldı: ${w.status}`);
  }
}

console.log(`\n${dokunulan} kayıt · ${duzeltilen} fiyat düzeltildi · ${silinen} satır silindi`
  + `${YAZ ? '' : '  (DENEME — yazılmadı)'}`);
