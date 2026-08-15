// Pre-build: clear the previous SPA output from website/ so stale hashed
// chunks and route shells don't pile up. Legacy root legal pages are removed
// because clean routes like /privacy must resolve to the generated SPA route
// shell, not to stale privacy.html files.

import { rmSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'website');
const wipe = [
  'spa', 'catalog', 'compare', 'ai-chat', 'pc-builder',
  'link-analysis', 'subscriptions', 'premium', 'quiz', 'profile', 'product',
  'terms', 'privacy', 'refund', 'cookies', 'contact', 'about', 'faq',
];

// product/ holds 100k+ tiny html files. Node's recursive rmSync is flaky on
// Windows for trees this large — it throws ENOTEMPTY/EBUSY even with retries
// (antivirus/indexer briefly locks freshly written files). The OS-native
// remover (`rmdir /s /q` on Windows, `rm -rf` elsewhere) is far more robust,
// so use that first and fall back to rmSync.
function nukeDir(dir) {
  if (!existsSync(dir)) return;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      if (process.platform === 'win32') {
        execSync(`rmdir /s /q "${dir}"`, { stdio: 'ignore', shell: 'cmd.exe' });
      } else {
        execSync(`rm -rf "${dir}"`, { stdio: 'ignore' });
      }
      if (!existsSync(dir)) return;
    } catch {
      // fall through to rmSync / retry
    }
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      if (!existsSync(dir)) return;
    } catch {
      // keep retrying
    }
  }
  if (existsSync(dir)) {
    throw new Error(`[prebuild] could not remove ${dir} after multiple attempts`);
  }
}

// ── SILMEDEN ONCE: katalog gercekten erisilebilir mi? ───────────────────────
// Bu dosya website/ altindaki product/ (6 bin dizin), compare/ (1,3 bin) ve tum
// rota kabuklarini SILIYOR; seo.mjs sonra hepsini yeniden uretiyor. Build o
// arada duserse — ki Typesense'e ulasilamadiginda seo.mjs "stripped sitemap
// yayinlamayi reddediyorum" deyip HAKLI OLARAK duruyor — geriye BOSALTILMIS bir
// website/ kaliyor. 2026-08-15'te bu iki kez yasandi: agac 23 bin sayfayi
// kaybetti, elle `git checkout origin/master -- website/` ile geri alindi.
// Boyle bir agac commit'lenip deploy edilseydi sitenin TUM SEO sayfalari
// silinirdi.
// Cozum: yikmadan once katalogun ayakta oldugunu dogrula. Basarisizsa hicbir sey
// silinmeden cikilir, calisma agaci saglam kalir.
// Baglanti sabitleri seo.mjs'ten OKUNUR, kopyalanmaz: iki yerde tutmak
// kacinilmaz olarak ayrisir ve bu kontrol sessizce yanlis hedefi yoklamaya
// baslar (yani korumasi oldugunu sanip korumaz).
const seoSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'seo.mjs'), 'utf8');
const pick = (name) => (seoSrc.match(new RegExp(`const ${name} = '([^']+)'`)) || [])[1] || '';
const TS_URL = pick('TS_URL');
const TS_KEY = pick('TS_KEY');
const TS_COLLECTION = pick('TS_COLLECTION');
async function catalogReachable() {
  // seo.mjs'in GERCEKTEN kullandigi agir sorgunun ayni sekli (per_page=250 +
  // ayni alanlar). Hafif bir `per_page=1` sorgusu yaniltici: yol bozukken o
  // geciyor ama asil sayfalama dusuyordu (olculdu).
  const fields = 'id,name,slug,brand,category,subcategory,imageUrl,techScore,trendScore,lowestPriceUSD,specsCount,screenSizeValue,batteryCapacityValue,weightValueKg,updatedAtTs,scrapedAtTs';
  const qs = new URLSearchParams({
    q: '*', query_by: 'name', sort_by: 'techScore:desc',
    per_page: '250', page: '1', include_fields: fields,
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`, {
      headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, signal: ctrl.signal,
    });
    if (!res.ok) return `HTTP ${res.status}`;
    const j = await res.json();
    return (j && j.found > 0) ? '' : 'katalog bos dondu';
  } catch (e) {
    return e.name === 'AbortError' ? '25 sn icinde yanit yok' : String(e.message || e);
  } finally { clearTimeout(to); }
}

if (process.env.SEO_ALLOW_EMPTY_CATALOG !== '1' && TS_URL && TS_KEY && TS_COLLECTION) {
  const hata = await catalogReachable();
  if (hata) {
    console.error(`[prebuild] katalog erisilemez (${hata}) — HICBIR SEY SILINMEDI.`);
    console.error('[prebuild] website/ oldugu gibi birakildi; Typesense erisilir olunca tekrar deneyin.');
    process.exit(1);
  }
}

for (const dir of wipe) {
  nukeDir(join(site, dir));
}

for (const file of ['terms.html', 'privacy.html', 'cookies.html', 'contact.html', 'about.html', 'faq.html']) {
  rmSync(join(site, file), { force: true });
}
console.log('[prebuild] cleared previous SPA output');
