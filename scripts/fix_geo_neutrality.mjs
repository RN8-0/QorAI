// ═══════════════════════════════════════════════════════════════════════════
//  YAYINLANMIS ANALIZLERDEN ULKE / MILLIYET REFERANSINI TEMIZLE
//
//  Kosum:  node scripts/fix_geo_neutrality.mjs          (deneme, yazmaz)
//          node scripts/fix_geo_neutrality.mjs --yaz    (PB'ye yazar)
//
//  NEDEN (olculdu 2026-09-03, canli `analyses` — 44 kayit):
//    35 / 44  kayitta ulke veya milliyet adi
//    30       report_tr.priceForecast.analysis
//    19       report_en.priceForecast.analysis
//    14       report_tr.product.reliabilityNotes[].detail
//    53 dize  report_en icinde TL/TRY tutari
//
//  Gecen metinler aynen: "launched in Turkey in July 2026" · "device
//  registration with local authorities (BTK in Turkey)" · "Apple Türkiye
//  Warranty" · "Türkiye'de 85.509 TL'lik fiyat etiketi".
//
//  Site kuresel ve rapor TEK KEZ uretilip herkese ayni gosteriliyor: bu
//  cumleleri Fransa'dan giren okuyucu da goruyor ve onun icin hepsi yanlis.
//
//  AI CAGRISI YOK. Temizlik `enforceGeoNeutrality` ile deterministik yapilir
//  (admin/js/qor_ai_prompts.js — admin, site ve bu betik AYNI fonksiyonu
//  kullanir; ikinci bir kopya kacinilmaz olarak ayrisir).
//
//  PARAGRAF RENKLERI TASINIR. `paragraphSentiment` anahtari paragrafin ilk
//  cumlesi; metin degisince anahtar tutmaz ve renk kaybolur. Tasima artik
//  `enforceGeoNeutrality`nin KENDI icinde, burada ek bir kod yok.
//
//  BASLIK BOSALIRSA ESKISI KORUNUR: bir SEO basligi tumuyle ulke adindan
//  ibaretse temizlik onu bosaltirdi; bos baslik kaydi bozar.
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
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
})).json()).token;
const H = { Authorization: T };

/* Alan -> dil. Dil KRITIK: Ingilizce rapor kuresel okuyucuya gidiyor ve
   TL/TRY tutari da orada yasak (kullanicinin kurali: TRY yalnizca Turkce
   raporda). Turkce raporda para birimi kalir, yalnizca ULKE adi duser. */
const ALANLAR = [
  ['report_tr', 'tr'], ['report_en', 'en'], ['report', 'tr'],
  ['body_tr', 'tr'], ['body_en', 'en'],
  ['lead_tr', 'tr'], ['lead_en', 'en'],
  ['faq_tr', 'tr'], ['faq_en', 'en'],
  ['verdict_tr', 'tr'], ['verdict_en', 'en'],
  ['title_tr', 'tr'], ['title_en', 'en'],
  ['metaTitle_tr', 'tr'], ['metaTitle_en', 'en'],
  ['metaDescription_tr', 'tr'], ['metaDescription_en', 'en'],
];
// Bosalirsa eskisi korunacak alanlar (bos baslik/aciklama kaydi bozar).
const KORUNAN = /^(title_|metaTitle_|metaDescription_|lead_)/;

const RE_KONTROL = /(t[üu]rkiye|turkey|turkish|t[üu]rk(?:ler)?\b|t[üu]rk[çc]e|\bBTK\b|\bTSE\b|[üu]lkemiz)/i;

/** Bir degerdeki kalan ihlalleri sayar (dogrulama icin). */
function ihlalSay(node, dil, out = []) {
  if (typeof node === 'string') {
    if (RE_KONTROL.test(node)) out.push(node.slice(0, 120));
    if (dil !== 'tr' && /(?:\d[\d.,]*\s?(?:TRY|TL)\b)|(?:₺\s?\d)/i.test(node)) out.push('[TRY] ' + node.slice(0, 100));
    return out;
  }
  if (Array.isArray(node)) { node.forEach((x) => ihlalSay(x, dil, out)); return out; }
  if (node && typeof node === 'object') { Object.values(node).forEach((v) => ihlalSay(v, dil, out)); }
  return out;
}

let liste = [];
for (let page = 1; ; page += 1) {
  const j = await (await fetch(`${PB_URL}/api/collections/analyses/records?perPage=200&page=${page}`, { headers: H })).json();
  if (!Array.isArray(j.items)) throw new Error('PB listesi okunamadi: ' + JSON.stringify(j).slice(0, 200));
  liste = liste.concat(j.items);
  if (page >= (j.totalPages || 1)) break;
}
console.log(`${liste.length} analiz kaydi okundu.\n`);

let degisenKayit = 0;
let toplamAlan = 0;
let kalanIhlal = 0;

for (const rec of liste) {
  const yama = {};
  let kayitAlan = 0;
  const raporlar = [];

  for (const [alan, dil] of ALANLAR) {
    const ham = rec[alan];
    if (ham == null || ham === '') continue;
    // PB JSON alanlari nesne, metin alanlari dize gelir; ikisi de gezilir.
    const kopya = typeof ham === 'string' ? { _: ham } : JSON.parse(JSON.stringify(ham));
    let n = 0;
    try { n = P.enforceGeoNeutrality(kopya, dil); } catch (e) { console.log(`  ! ${rec.id}.${alan}: ${e.message}`); continue; }
    if (!n) continue;
    const yeni = typeof ham === 'string' ? kopya._ : kopya;
    // Bosalan baslik/aciklama: eskisi korunur, elle duzeltilmek uzere raporlanir.
    if (KORUNAN.test(alan) && (typeof yeni !== 'string' || !yeni.trim())) {
      console.log(`  ~ ${rec.id}.${alan} temizlikte bosaldi — ESKISI KORUNDU: "${String(ham).slice(0, 80)}"`);
      continue;
    }
    yama[alan] = yeni;
    kayitAlan += n;
    raporlar.push(`${alan}:${n}`);
    kalanIhlal += ihlalSay(yeni, dil).length;
  }

  if (!kayitAlan) continue;
  degisenKayit += 1;
  toplamAlan += kayitAlan;
  const ad = rec.productSlug || rec.slug || rec.id;
  console.log(`${YAZ ? '✎' : '·'} ${ad.padEnd(36)} ${raporlar.join(' ')}`);

  if (YAZ) {
    const w = await fetch(`${PB_URL}/api/collections/analyses/records/${rec.id}`, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify(yama),
    });
    if (!w.ok) console.log(`  ! yazilamadi (${w.status}): ${(await w.text()).slice(0, 200)}`);
  }
}

console.log(`\n${degisenKayit} kayit, ${toplamAlan} alan ${YAZ ? 'GUNCELLENDI' : 'degisecek (deneme)'}.`);
console.log(kalanIhlal
  ? `!! temizlik sonrasi KALAN ihlal: ${kalanIhlal} — desenler gozden gecirilmeli`
  : 'Temizlik sonrasi kalan ihlal: 0');
if (!YAZ) console.log('\nYazmak icin: node scripts/fix_geo_neutrality.mjs --yaz');
