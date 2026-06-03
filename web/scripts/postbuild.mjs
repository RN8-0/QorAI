// Post-build: Coolify's static server has no SPA fallback, so a direct
// hit on /catalog would 404. We copy the built index.html into a real
// <route>/index.html for every known top-level route — those now return
// HTTP 200. Product pages use /product?id=... for crawlable 200 responses;
// legacy /product/:id deep links still rely on 404.html.

import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');
const indexHtml = join(site, 'index.html');

if (!existsSync(indexHtml)) {
  console.error('[postbuild] website/index.html not found — run vite build first');
  process.exit(1);
}

const ROUTES = [
  'category', 'product', 'compare', 'ai-chat',
  'link-analysis', 'subscriptions', 'quiz', 'profile',
];

for (const route of ROUTES) {
  const dir = join(site, route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(indexHtml, join(dir, 'index.html'));
}

copyFileSync(indexHtml, join(site, '404.html'));
console.log(`[postbuild] wrote ${ROUTES.length} route shells + 404.html`);
