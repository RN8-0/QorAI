// Ayni salinim olcumu HER PAZARDA. Makale tek para birimine hapsolmasin:
// asil ilginc soru "Turkiye daha mi oynak" ve buna ancak karsilastirarak
// yanit verilebilir.
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

async function pazar(kod) {
  const seri = new Map();
  let sayfa = 1;
  for (;;) {
    const r = await (await fetch(
      `${B}/api/collections/price_snapshots/records?perPage=500&page=${sayfa}`
      + `&filter=${encodeURIComponent(`country="${kod}"`)}&sort=checkedAt&fields=productId,price,checkedAt`,
      { headers: H },
    )).json();
    for (const x of r.items || []) {
      const f = Number(x.price);
      if (!(f > 0)) continue;
      if (!seri.has(x.productId)) seri.set(x.productId, []);
      seri.get(x.productId).push({ f, g: String(x.checkedAt || '').slice(0, 10) });
    }
    if (sayfa >= r.totalPages) break;
    sayfa += 1;
  }

  const degisim = [];
  const salinim = [];
  for (const [, k] of seri) {
    if (k.length < 3) continue;
    const gunler = [...new Set(k.map((x) => x.g))].sort();
    const ara = (new Date(gunler[gunler.length - 1]) - new Date(gunler[0])) / 86400000;
    if (ara < 30) continue;
    const fs = k.map((x) => x.f);
    const min = Math.min(...fs); const max = Math.max(...fs);
    if (!(min > 0) || max / min > 8) continue;
    salinim.push(((max - min) / max) * 100);
    // ilk gun -> son gun degisimi
    const ilkGun = gunler[0]; const sonGun = gunler[gunler.length - 1];
    const ilk = ortanca(k.filter((x) => x.g === ilkGun).map((x) => x.f));
    const son = ortanca(k.filter((x) => x.g === sonGun).map((x) => x.f));
    if (ilk > 0 && son > 0) degisim.push(((son - ilk) / ilk) * 100);
  }

  const esik = (e) => salinim.filter((x) => x >= e).length;
  return {
    kod,
    urun: salinim.length,
    ortancaSalinim: +ortanca(salinim).toFixed(1),
    ortancaDegisim: +ortanca(degisim).toFixed(1),
    zamOran: +((degisim.filter((x) => x > 1).length / Math.max(1, degisim.length)) * 100).toFixed(1),
    ucuzOran: +((degisim.filter((x) => x < -1).length / Math.max(1, degisim.length)) * 100).toFixed(1),
    p10: +((esik(10) / Math.max(1, salinim.length)) * 100).toFixed(1),
    p20: +((esik(20) / Math.max(1, salinim.length)) * 100).toFixed(1),
    p30: +((esik(30) / Math.max(1, salinim.length)) * 100).toFixed(1),
  };
}

const sonuc = [];
for (const k of ['TR', 'DE', 'GB', 'US']) {
  const r = await pazar(k);
  sonuc.push(r);
  console.log(
    `${r.kod}  urun ${String(r.urun).padStart(5)} · ortanca salinim %${String(r.ortancaSalinim).padStart(4)} · `
    + `>=%10 ${String(r.p10).padStart(4)}% · >=%20 ${String(r.p20).padStart(4)}% · >=%30 ${String(r.p30).padStart(4)}% · `
    + `2,5 ayda ortanca degisim %${r.ortancaDegisim} (zam %${r.zamOran} / ucuz %${r.ucuzOran})`,
  );
}
writeFileSync('scripts/.salinim_pazarlar.json', JSON.stringify(sonuc, null, 1));
console.log('\n-> scripts/.salinim_pazarlar.json');
