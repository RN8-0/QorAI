// Pre-build: clear the previous SPA output from website/ so stale hashed
// chunks and route shells don't pile up. The static pages we must keep
// (privacy.html, terms.html, email-verify.html, reset-password.html,
// css/, assets/) are never touched.

import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'website');
const wipe = [
  'spa', 'catalog', 'compare', 'ai-chat', 'pc-builder',
  'link-analysis', 'subscriptions', 'quiz', 'profile', 'product',
];

for (const dir of wipe) {
  rmSync(join(site, dir), { recursive: true, force: true });
}
console.log('[prebuild] cleared previous SPA output');
