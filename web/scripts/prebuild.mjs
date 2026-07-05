// Pre-build: clear the previous SPA output from website/ so stale hashed
// chunks and route shells don't pile up. Legacy root legal pages are removed
// because clean routes like /privacy must resolve to the generated SPA route
// shell, not to stale privacy.html files.

import { rmSync, existsSync } from 'fs';
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

for (const dir of wipe) {
  nukeDir(join(site, dir));
}

for (const file of ['terms.html', 'privacy.html', 'cookies.html', 'contact.html', 'about.html', 'faq.html']) {
  rmSync(join(site, file), { force: true });
}
console.log('[prebuild] cleared previous SPA output');
