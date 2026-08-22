// ═══════════════════════════════════════════════════════════════════════════
//  `nameTranslated.de` TEMIZLIGI
//
//  NEDEN AYRI BIR BETIK: `drop_german_fields.js` yalnizca ADI `_de` ile biten
//  KOLONLARI siliyor (title_de, lead_de...). `nameTranslated` bir JSON alani ve
//  Almanca ad onun ICINDE bir alt anahtar olarak duruyordu — o tarama hic
//  gormedi. Olculdu (2026-08-22): 107.449 urunun 78.319'unda (%72,9)
//  `nameTranslated.de` hala vardi.
//
//  GORUNMUYORDU AMA VARDI: `displayProductName()` yalnizca tr/en okuyor ve
//  Typesense'teki `_raw.nameTranslated` zaten yalniz {en, tr} tasiyor. Yani
//  sizinti ekrana ulasmiyordu; sorun, ileride bir dil eklendiginde ya da bu
//  alani genel gezen bir betik yazildiginda Almancanin SESSIZCE geri gelmesi.
//
//  GERI YAZAN YOL KAPATILDI: `scripts/fix_epey_names_and_junk.mjs` bu alani
//  `nameTranslated.de` olarak yaziyordu (100k+ urune dokunan bir betik);
//  2026-08-22'de o da kaldirildi. Scraper zaten TARGET_LANGS=['en'].
//
//  KOSTUR:  node migration/drop_german_name_key.js --dry   (yalniz sayar)
//           node migration/drop_german_name_key.js         (yazar)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const PER_PAGE = 500;
// Es zamanli PATCH. Host 2 vCPU / 4 GB ve takas zaten kullanimda (bkz.
// CLAUDE.md "Server"), o yuzden dusuk tutuluyor: hiz degil, PB'yi ayakta
// tutmak onemli.
const ESZAMANLI = 6;

function loadEnv() {
  const env = { ...process.env };
  const p = path.resolve(__dirname, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).replace(/^﻿/, '').trim();
      if (!(k in env)) env[k] = line.slice(i + 1).trim();
    }
  }
  return env;
}

// Node'un global fetch'inde VARSAYILAN ZAMAN ASIMI YOKTUR. Ilk kosuda betik
// 170. sayfada asili kaldi: PB sagliklidi (health 248 ms) ama surecin bir
// soketi olmustu ve `await fetch` sonsuza kadar bekledi — CPU 20 saniyede
// 0,2 s ilerledi. Her istek artik kendi zaman asimini tasiyor ve geri
// cekilerek 3 kez deneniyor.
const ZAMAN_ASIMI_MS = 30000;

async function iste(url, secenek, deneme = 3) {
  for (let i = 1; ; i += 1) {
    try {
      const r = await fetch(url, { ...secenek, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
      if (r.status >= 500 && i < deneme) { await bekle(500 * i); continue; }
      return r;
    } catch (e) {
      if (i >= deneme) throw e;
      await bekle(500 * i);
    }
  }
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function havuz(isler, sinir) {
  const kuyruk = isler.slice();
  const calisanlar = Array.from({ length: Math.min(sinir, kuyruk.length) }, async () => {
    for (;;) {
      const is = kuyruk.shift();
      if (!is) return;
      await is();
    }
  });
  await Promise.all(calisanlar);
}

(async () => {
  const env = loadEnv();
  const B = String(env.POCKETBASE_URL || '').replace(/\/+$/, '');
  if (!B) { console.error('POCKETBASE_URL yok'); process.exit(1); }

  const auth = await iste(`${B}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!auth.ok) { console.error('superuser auth basarisiz:', auth.status); process.exit(1); }
  const { token } = await auth.json();
  const H = { Authorization: token, 'Content-Type': 'application/json' };

  let sayfa = 1;
  let taranan = 0;
  let bulunan = 0;
  let yazilan = 0;
  let hata = 0;
  const t0 = Date.now();

  for (;;) {
    const r = await iste(
      // SIRALAMA SABITLENIR. Sirasiz listede PATCH `updated` alanini
      // degistirir; varsayilan sira ondan etkileniyorsa kayitlar
      // sayfalar arasi kayar ve tarama kayit ATLAR.
      `${B}/api/collections/products/records?perPage=${PER_PAGE}&page=${sayfa}&sort=id&fields=id,nameTranslated`,
      { headers: H },
    );
    if (!r.ok) { console.error('liste okunamadi:', r.status); process.exit(1); }
    const d = await r.json();

    const kirli = d.items.filter((it) => {
      taranan += 1;
      const nt = it.nameTranslated;
      return nt && typeof nt === 'object' && !Array.isArray(nt) && nt.de !== undefined;
    });
    bulunan += kirli.length;

    if (!DRY && kirli.length) {
      await havuz(kirli.map((it) => async () => {
        const nt = { ...it.nameTranslated };
        delete nt.de;
        try {
          const p = await iste(`${B}/api/collections/products/records/${it.id}`, {
            method: 'PATCH', headers: H, body: JSON.stringify({ nameTranslated: nt }),
          });
          if (p.ok) yazilan += 1; else hata += 1;
        } catch (_) { hata += 1; }
      }), ESZAMANLI);
    }

    if (sayfa % 10 === 0 || sayfa >= d.totalPages) {
      const sn = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  sayfa ${sayfa}/${d.totalPages} · taranan ${taranan} · kirli ${bulunan} · yazilan ${yazilan} · hata ${hata} · ${sn}s`);
    }
    if (sayfa >= d.totalPages) break;
    sayfa += 1;
  }

  console.log(`\ntaranan ${taranan} urun · nameTranslated.de olan ${bulunan}`);
  console.log(DRY ? 'DRY — hicbir sey yazilmadi.' : `yazilan ${yazilan} · hata ${hata}`);
})().catch((e) => { console.error('hata:', e.message); process.exit(1); });
