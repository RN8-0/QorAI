// IndexNow submitter — pings Bing / Yandex / DuckDuckGo / Seznam (and, via Bing,
// Microsoft Copilot) so new & changed URLs are crawled within hours instead of
// weeks. Google ignores IndexNow but still has the sitemap.
//
// Usage:
//   node web/scripts/indexnow.mjs            # submit every URL in sitemap.xml
//   git diff --name-only ... | node web/scripts/indexnow.mjs   # submit piped URLs
//
// Best-effort: any failure exits 0 so it never breaks the deploy pipeline.

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SITE = 'https://qorai.net';
const HOST = 'qorai.net';
const KEY = '2c03809d550d2c5ae87a65ed1f0fcd1e';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');

// Sitemap'ten YALNIZ SON ZAMANDA DEGISMIS adresler.
//
// NEDEN (2026-08-21): bu fonksiyon eskiden sitemap'teki HER adresi donduruyordu
// ve boru ile adres beslenmediginde her gece 23.199 adres IndexNow'a
// gonderiliyordu — gercekte ~50 sayfa degismisken. IndexNow'in tek amaci
// "SUNLAR degisti" demek; her seferinde her seyi bildirmek o sinyali gurultuye
// cevirir ve arama motoru bildirimleri ciddiye almayi birakir. Ayni hatanin
// sitemap `lastmod` tarafi zaten bir kez yasanmis ve duzeltilmisti.
//
// Artik olcut sitemap'in KENDI `lastmod` degeri: son GUN_SINIRI gun icinde
// degismis adresler gider, digerleri gitmez. Cron'un betigi nasil cagirdigindan
// bagimsiz olarak dogru davranir.
const GUN_SINIRI = Number(process.env.INDEXNOW_MAX_AGE_DAYS || 7);

function sitemapDosyalari() {
  const kok = join(site, 'sitemap.xml');
  if (!existsSync(kok)) return [];
  const xml = readFileSync(kok, 'utf8');
  const parcalar = [...xml.matchAll(/<loc>[^<]*\/(sitemap-\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  return parcalar.length ? parcalar.map((p) => join(site, p)) : [kok];
}

function fromSitemap() {
  const esik = new Date(Date.now() - GUN_SINIRI * 864e5).toISOString().slice(0, 10);
  const out = [];
  let toplam = 0;
  for (const f of sitemapDosyalari()) {
    if (!existsSync(f)) continue;
    const xml = readFileSync(f, 'utf8');
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const blok = m[1];
      const loc = (blok.match(/<loc>([^<]+)<\/loc>/) || [])[1];
      if (!loc || /\/sitemap-\d+\.xml$/.test(loc)) continue;
      toplam += 1;
      const lastmod = (blok.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || '';
      // `lastmod` yoksa adres degismis SAYILMAZ: eksik tarihi "yeni" kabul
      // etmek tam da kacinmaya calistigimiz toplu gonderimi geri getirirdi.
      if (lastmod.slice(0, 10) >= esik) out.push(loc.trim());
    }
  }
  console.log(`[indexnow] sitemap: ${toplam} adresin ${out.length} tanesi son ${GUN_SINIRI} gunde degismis`);
  return out;
}

async function readStdin() {
  if (process.stdin.isTTY) return [];
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

async function main() {
  let urls = await readStdin();
  if (!urls.length) urls = fromSitemap();
  urls = [...new Set(urls)].filter((u) => u.startsWith(SITE));
  if (!urls.length) { console.log('[indexnow] nothing to submit'); return; }

  const CHUNK = 10000; // IndexNow accepts up to 10k URLs per request
  for (let i = 0; i < urls.length; i += CHUNK) {
    const urlList = urls.slice(i, i + CHUNK);
    try {
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
      });
      console.log(`[indexnow] submitted ${urlList.length} urls -> HTTP ${res.status}`);
    } catch (e) {
      console.error(`[indexnow] batch failed: ${e.message}`);
    }
  }
}

main().catch((e) => { console.error('[indexnow] error', e.message); process.exit(0); });
