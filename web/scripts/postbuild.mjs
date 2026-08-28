// Post-build: copy the built index.html into a real <route>/index.html for
// every known top-level route so a direct hit returns HTTP 200. seo.mjs then
// overwrites these with per-route meta. Product detail pages are handled
// separately by seo.mjs, which prerenders a curated set at clean
// /product/<slug>-<id> paths; uncurated product deep links fall back to the
// host's SPA rewrite (serves index.html, then the SPA renders the product).

import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');
const indexHtml = join(site, 'index.html');
const root = join(here, '..', '..');

if (!existsSync(indexHtml)) {
  console.error('[postbuild] website/index.html not found — run vite build first');
  process.exit(1);
}

const ROUTES = [
  'category', 'product', 'compare', 'search', 'ai-chat', 'blog',
  'link-analysis', 'subscriptions', 'premium', 'quiz', 'go', 'profile',
  'terms', 'privacy', 'refund', 'cookies', 'contact', 'about', 'faq',
];

// ── DIL ONEKLI KABUKLAR (2026-08-18) ──────────────────────────────────────
// CANLI OLAY: /tr/compare BEYAZ EKRAN veriyordu. O kabuklar
// aylar once ELLE eklenmis (commit 6aaba95 "eksik dizin kabuklari") ve BIR
// DAHA HIC URETILMEMISTI; icindeki `spa/index-TkhoIV_k.js` artik yok ->
// 404 -> SPA hic boot etmiyor. Ustelik 404 edge'de negatif cache'lenir.
// Ayni durum /tr/product icin de gecerliydi (on-render edilmemis
// bir urunun derin linki bu kabuga dusuyor).
//
// Cozum: kabuklari ELLE tutma — HER derlemede, HER dil oneki icin YENIDEN
// yaz. seo.mjs sonrasinda kendi meta'siyla uzerine yazdiklarini yazar; onun
// dokunmadiklari (compare/product/search/profile/go) burada taze kalir.
// Almanca 2026-08-21'de kaldirildi: artik yalnizca kok (en) + /tr.
const LANG_PREFIXES = ['', 'tr'];

for (const prefix of LANG_PREFIXES) {
  // Dil kokunun kendisi de bir kabuk olmali: /tr/ (seo.mjs uzerine yazar)
  if (prefix) {
    const kok = join(site, prefix);
    mkdirSync(kok, { recursive: true });
    copyFileSync(indexHtml, join(kok, 'index.html'));
  }
  for (const route of ROUTES) {
    const dir = prefix ? join(site, prefix, route) : join(site, route);
    mkdirSync(dir, { recursive: true });
    copyFileSync(indexHtml, join(dir, 'index.html'));
  }
}

copyFileSync(indexHtml, join(site, '404.html'));

/* ABONELIK LOGOLARI — DIZININ KENDISI LISTEDIR.
   Onceden burada ELLE yazilmis 29 dosyalik bir dizi vardi. Olculdu
   2026-08-28: `assets/icons/quiz_logos/` icinde 103 dosya var, yani 74 logo
   hicbir zaman yayina cikmiyordu. Ayni ada `admin/js/sub_logos.js` eslesme
   verse bile dosya 404 donuyor ve arayuz harf/kelime rozetine dusuyordu —
   kullanicinin bildirdigi "bazi aboneliklerde logo yok" bunun bir ayagi.
   Tum dizin 498 KB; secmenin bir kazanci yok, ayrisma maliyeti var. */
const logoSourceDir = join(root, 'assets', 'icons', 'quiz_logos');
const logoTargetDir = join(site, 'assets', 'subscriptions');
mkdirSync(logoTargetDir, { recursive: true });
const SUBSCRIPTION_LOGOS = existsSync(logoSourceDir)
  ? readdirSync(logoSourceDir).filter((f) => /\.(?:svg|png|jpg|jpeg|webp)$/i.test(f))
  : [];
if (!SUBSCRIPTION_LOGOS.length) {
  console.error(`[postbuild] no subscription logo assets under ${logoSourceDir}`);
  process.exit(1);
}
for (const file of SUBSCRIPTION_LOGOS) {
  copyFileSync(join(logoSourceDir, file), join(logoTargetDir, file));
}

console.log(`[postbuild] wrote ${ROUTES.length * LANG_PREFIXES.length + LANG_PREFIXES.length - 1} route shells (${LANG_PREFIXES.length} dil) + 404.html + ${SUBSCRIPTION_LOGOS.length} subscription logos`);
