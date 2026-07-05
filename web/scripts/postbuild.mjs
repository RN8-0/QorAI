// Post-build: copy the built index.html into a real <route>/index.html for
// every known top-level route so a direct hit returns HTTP 200. seo.mjs then
// overwrites these with per-route meta. Product detail pages are handled
// separately by seo.mjs, which prerenders a curated set at clean
// /product/<slug>-<id> paths; uncurated product deep links fall back to the
// host's SPA rewrite (serves index.html, then the SPA renders the product).

import { mkdirSync, copyFileSync, existsSync } from 'fs';
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
  'category', 'product', 'ai-chat',
  'link-analysis', 'subscriptions', 'premium', 'quiz', 'go', 'profile',
  'terms', 'privacy', 'refund', 'cookies', 'contact', 'about', 'faq',
];

for (const route of ROUTES) {
  const dir = join(site, route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(indexHtml, join(dir, 'index.html'));
}

copyFileSync(indexHtml, join(site, '404.html'));

const SUBSCRIPTION_LOGOS = [
  'netflix.svg',
  'disney_plus.png',
  'prime_video.png',
  'apple_tv_plus.svg',
  'max.svg',
  'youtube_premium.svg',
  'crunchyroll.svg',
  'spotify.svg',
  'apple_music.svg',
  'youtube_music.svg',
  'tidal.svg',
  'chatgpt_plus.png',
  'claude.svg',
  'gemini.svg',
  'perplexity.svg',
  'midjourney.png',
  'game_pass.png',
  'ps_plus.svg',
  'microsoft_365.png',
  'google_one.png',
  'icloud.svg',
  'adobe_cc.png',
  'notion.svg',
  'canva.png',
];
const logoSourceDir = join(root, 'assets', 'icons', 'quiz_logos');
const logoTargetDir = join(site, 'assets', 'subscriptions');
mkdirSync(logoTargetDir, { recursive: true });
for (const file of SUBSCRIPTION_LOGOS) {
  const src = join(logoSourceDir, file);
  if (!existsSync(src)) {
    console.error(`[postbuild] missing subscription logo asset: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, join(logoTargetDir, file));
}

console.log(`[postbuild] wrote ${ROUTES.length} route shells + 404.html + ${SUBSCRIPTION_LOGOS.length} subscription logos`);
