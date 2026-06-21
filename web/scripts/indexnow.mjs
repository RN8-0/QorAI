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

function fromSitemap() {
  const f = join(site, 'sitemap.xml');
  if (!existsSync(f)) return [];
  const xml = readFileSync(f, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => !/\/sitemap-\d+\.xml$/.test(u));
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
