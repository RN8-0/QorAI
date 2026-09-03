// ═══════════════════════════════════════════════════════════════════════════
//  ASKIDA KALAN BAS METINLERI TEMIZLE (tek seferlik onarim)
//
//  Kosum:  node scripts/fix_askida_madde.mjs          (deneme)
//          node scripts/fix_askida_madde.mjs --yaz    (PB'ye yazar)
//
//  NEDEN: `fix_price_discipline.mjs`in ILK surumu fiyat cumlesini atiyor ama
//  ARDINDAN gelen cumleyi birakabiliyordu:
//      [Yuksek Baslangic Fiyati] "Bu durum, butce odakli kullanicilar icin
//                                 bir engel teskil edebilir."
//  Ilk cumle ("Cihazin 1189 GBP'lik fiyat etiketi...") silinince "Bu durum"
//  neye isaret ettigini kaybetti. Kural artik motorun icinde
//  (qor_ai_prompts.js -> trimDanglingLead) ama ONCEDEN yazilmis kayitlarda
//  fiyat rakami kalmadigi icin kapi tetiklenmiyor; bu betik onlari temizler.
//
//  IKI TUR AYRI ELE ALINIR:
//    BAGLAC ATILIR   "Ayrica, sensor kaymasi titresim yapar." -> baglac atilir,
//                    cumle KALIR (gercek bir sikayet; dusurmek icerik kaybi)
//    GONDERME DUSER  "Bu durum, ..." -> gosterici oznenin KENDISI, madde duser
//
//  YALNIZCA UYARI LISTELERI taranir. Nesir paragraflarina DOKUNULMAZ: orada
//  "Bu durum" dogal bir baglactir.
//
//  AI CAGRISI YOK.
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

/* DESEN YOK, MOTOR VAR. Onceki surum desenleri buraya KOPYALAMISTI ve iki
   surum hemen ayristi (biri kelime siniri tasiyor, oteki tasimiyordu).
   Artik `QorAiPrompts.trimDanglingLead` cagriliyor: tek kaynak. */
const YASAK = ['cons', 'weaknesses', 'criticalPoints', 'decisiveDifferences', 'case', 'for', 'against'];

/** Askida bas metinleri temizler; degisen sayisini doner. */
function temizle(dugum, yasak, kayit, derinlik = 0) {
  if (derinlik > 8 || dugum == null) return { deger: dugum, n: 0 };
  if (typeof dugum === 'string') {
    if (!yasak) return { deger: dugum, n: 0 };
    const yeni = P.trimDanglingLead(dugum);
    if (yeni === dugum) return { deger: dugum, n: 0 };
    kayit.push(yeni
      ? `BAGLAC ATILDI  ${yeni.slice(0, 78)}`
      : `DUSTU          ${dugum.slice(0, 78)}`);
    return { deger: yeni, n: 1 };
  }
  if (Array.isArray(dugum)) {
    let n = 0;
    const out = dugum
      .map((x) => { const r = temizle(x, yasak, kayit, derinlik + 1); n += r.n; return r.deger; })
      .filter((x) => (typeof x === 'string' ? x.trim().length > 0 : true));
    return { deger: out, n };
  }
  if (typeof dugum !== 'object') return { deger: dugum, n: 0 };
  let n = 0;
  Object.keys(dugum).forEach((k) => {
    if (k === 'paragraphSentiment') return;
    const r = temizle(dugum[k], yasak || YASAK.indexOf(k) >= 0, kayit, derinlik + 1);
    dugum[k] = r.deger; n += r.n;
  });
  // Detayi bosalan kritik nokta duser: baslik tek basina bir uyari degildir.
  if (Array.isArray(dugum.criticalPoints)) {
    const kalan = dugum.criticalPoints
      .filter((x) => (x && typeof x === 'object' ? String(x.detail || '').trim() : true));
    if (kalan.length !== dugum.criticalPoints.length) { dugum.criticalPoints = kalan; n += 1; }
  }
  return { deger: dugum, n };
}

const liste = await (await fetch(`${PB_URL}/api/collections/analyses/records?perPage=200`, { headers: H })).json();
let dokunulan = 0; let toplam = 0;

for (const rec of liste.items) {
  const yama = {};
  for (const lang of ['tr', 'en']) {
    const rep = rec[`report_${lang}`];
    if (!rep || typeof rep !== 'object') continue;
    const kopya = JSON.parse(JSON.stringify(rep));
    const kayit = [];
    const { n } = temizle(kopya, false, kayit);
    if (!n) continue;
    console.log(`### ${rec.slug} [${lang}] — ${n} madde`);
    kayit.forEach((x) => console.log(`   ${x}`));
    yama[`report_${lang}`] = kopya;
    toplam += n;
  }
  if (!Object.keys(yama).length) continue;
  dokunulan += 1;
  if (YAZ) {
    const w = await fetch(`${PB_URL}/api/collections/analyses/records/${rec.id}`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(yama),
    });
    console.log(`   yazildi: ${w.status}`);
  }
}

console.log(`\n${dokunulan} kayit · ${toplam} askida madde${YAZ ? ' temizlendi' : ' (DENEME — yazilmadi)'}`);
