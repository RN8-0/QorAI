// ═══════════════════════════════════════════════════════════════════════════
//  TR FIYAT EGILIMI — makale icin kanit uretir
//
//  Yontem (makalede de aynen anlatilacak, cunku dogrulanabilir olmayan sayi
//  yazmiyoruz):
//   · Yalniz country=TR ve price>0 kayitlar
//   · Bir urunun ILK ve SON kaydi arasinda EN AZ 30 GUN olmali — iki gunluk
//     dalgalanma "zam" degildir
//   · Ayni urunun ayni gundeki birden fazla kaydi ORTANCA ile tek noktaya
//     indirilir (magazadan magazaya fark egilimi bozmasin)
//   · %±200 disindaki degisimler ATILIR: bunlar varyant/magaza karisikligi,
//     gercek zam degil
//   · Ozet ORTANCA ile verilir; ortalama tek bir ucuk degerle savrulur
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('migration/.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).replace(/^﻿/, '').trim(), l.slice(i + 1).trim()]; }),
);
const B = env.POCKETBASE_URL.replace(/\/+$/, '');

const a = await (await fetch(`${B}/api/collections/_superusers/auth-with-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
})).json();
const H = { Authorization: a.token };

const ortanca = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── TUM TR snapshot'larini sayfa sayfa cek ───────────────────────────────
const perPage = 500;
let sayfa = 1;
const seri = new Map(); // productId -> Map(gun -> [fiyat])
for (;;) {
  const r = await (await fetch(
    `${B}/api/collections/price_snapshots/records?perPage=${perPage}&page=${sayfa}`
    + `&filter=${encodeURIComponent('country="TR"')}&sort=checkedAt&fields=productId,price,checkedAt`,
    { headers: H },
  )).json();
  for (const x of r.items || []) {
    const f = Number(x.price);
    if (!(f > 0)) continue;
    const gun = String(x.checkedAt || '').slice(0, 10);
    if (!gun) continue;
    if (!seri.has(x.productId)) seri.set(x.productId, new Map());
    const g = seri.get(x.productId);
    if (!g.has(gun)) g.set(gun, []);
    g.get(gun).push(f);
  }
  if (sayfa % 40 === 0) console.error(`  ...sayfa ${sayfa}/${r.totalPages}`);
  if (sayfa >= r.totalPages) break;
  sayfa += 1;
}
console.error(`ham seri: ${seri.size} urun`);

// ── Degisim hesabi ───────────────────────────────────────────────────────
const GUN_ESIK = 30;
const sonuc = [];
let elenenSure = 0;
let elenenUcuk = 0;
for (const [pid, gunler] of seri) {
  const sirali = [...gunler.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
  if (sirali.length < 2) continue;
  const [ilkGun, ilkler] = sirali[0];
  const [sonGun, sonlar] = sirali[sirali.length - 1];
  const gunFark = (new Date(sonGun) - new Date(ilkGun)) / 86400000;
  if (gunFark < GUN_ESIK) { elenenSure += 1; continue; }
  const ilk = ortanca(ilkler);
  const son = ortanca(sonlar);
  if (!(ilk > 0) || !(son > 0)) continue;
  const yuzde = ((son - ilk) / ilk) * 100;
  if (Math.abs(yuzde) > 200) { elenenUcuk += 1; continue; }
  sonuc.push({ pid, ilk, son, yuzde, gunFark: Math.round(gunFark), nokta: sirali.length });
}

const artan = sonuc.filter((x) => x.yuzde > 1);
const azalan = sonuc.filter((x) => x.yuzde < -1);
const sabit = sonuc.filter((x) => Math.abs(x.yuzde) <= 1);

console.log(`\n═══ SONUC ═══`);
console.log(`degerlendirilen urun : ${sonuc.length}  (>=${GUN_ESIK} gun araliği)`);
console.log(`  elenen: sure kisa ${elenenSure} · ucuk deger ${elenenUcuk}`);
console.log(`ZAM GORDU (>%1)      : ${artan.length}  (%${(artan.length / sonuc.length * 100).toFixed(1)})`);
console.log(`UCUZLADI (<-%1)      : ${azalan.length}  (%${(azalan.length / sonuc.length * 100).toFixed(1)})`);
console.log(`DEGISMEDI (±%1)      : ${sabit.length}  (%${(sabit.length / sonuc.length * 100).toFixed(1)})`);
console.log(`\nORTANCA degisim      : %${ortanca(sonuc.map((x) => x.yuzde)).toFixed(1)}`);
console.log(`zam gorenlerin ortancasi: %${ortanca(artan.map((x) => x.yuzde)).toFixed(1)}`);
console.log(`ucuzlayanlarin ortancasi: %${ortanca(azalan.map((x) => x.yuzde)).toFixed(1)}`);

// ── En cok zam gorenler (ad + kategori ile) ──────────────────────────────
const enCok = [...sonuc].sort((x, y) => y.yuzde - x.yuzde).slice(0, 12);
const enAz = [...sonuc].sort((x, y) => x.yuzde - y.yuzde).slice(0, 8);
const adGetir = async (pid) => {
  try {
    const p = await (await fetch(`${B}/api/collections/products/records/${pid}?fields=name,brand,category,slug,imageUrl`, { headers: H })).json();
    return p;
  } catch { return {}; }
};
console.log('\n── EN COK ZAM ──');
for (const x of enCok) {
  const p = await adGetir(x.pid);
  console.log(`  +%${x.yuzde.toFixed(1).padStart(6)}  ${String(p.name || '').slice(0, 44).padEnd(46)} ${Math.round(x.ilk)} -> ${Math.round(x.son)} TL · ${x.gunFark}g · ${p.category || ''}`);
  x.ad = p.name; x.kategori = p.category; x.slug = p.slug; x.gorsel = p.imageUrl; x.marka = p.brand;
}
console.log('\n── EN COK UCUZLAYAN ──');
for (const x of enAz) {
  const p = await adGetir(x.pid);
  console.log(`  %${x.yuzde.toFixed(1).padStart(7)}  ${String(p.name || '').slice(0, 44).padEnd(46)} ${Math.round(x.ilk)} -> ${Math.round(x.son)} TL · ${x.gunFark}g · ${p.category || ''}`);
  x.ad = p.name; x.kategori = p.category; x.slug = p.slug; x.gorsel = p.imageUrl; x.marka = p.brand;
}

// ── Kategoriye gore ──────────────────────────────────────────────────────
const katSeri = {};
for (const x of sonuc) {
  if (!x.kategori) continue;
  (katSeri[x.kategori] ||= []).push(x.yuzde);
}
const katOzet = Object.entries(katSeri)
  .filter(([, v]) => v.length >= 5)
  .map(([k, v]) => ({ kategori: k, n: v.length, ortanca: ortanca(v) }))
  .sort((x, y) => y.ortanca - x.ortanca);
if (katOzet.length) {
  console.log('\n── KATEGORIYE GORE (>=5 urun) ──');
  katOzet.forEach((k) => console.log(`  ${k.kategori.padEnd(20)} n=${String(k.n).padStart(3)}  ortanca %${k.ortanca.toFixed(1)}`));
}

writeFileSync('scripts/.fiyat_egilimi.json', JSON.stringify({
  uretildi: new Date().toISOString(),
  aralik: { gunEsik: GUN_ESIK },
  toplam: sonuc.length,
  artan: artan.length,
  azalan: azalan.length,
  sabit: sabit.length,
  ortancaDegisim: ortanca(sonuc.map((x) => x.yuzde)),
  ortancaArtan: ortanca(artan.map((x) => x.yuzde)),
  ortancaAzalan: ortanca(azalan.map((x) => x.yuzde)),
  enCok, enAz, katOzet,
}, null, 1));
console.log('\nkanit dosyasi: scripts/.fiyat_egilimi.json');
