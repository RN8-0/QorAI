// Repair stored Amazon offer links in PocketBase:
//   1. affiliateUrl gets the OWN per-market program tag of the storefront the
//      URL points at (qorai-20 on .de/.co.uk attributed nothing — each store
//      needs its own Store ID; panels 2026-07-05).
//   2. OneLink redirect leftovers (linkCode/linkId, gg2/gg3) are stripped from
//      BOTH url and affiliateUrl — they can re-arm Amazon's session-dependent
//      geo-router even on an untagged URL.
// Old released app builds open affiliateUrl raw, so the DB itself must carry
// correct tags; new web/app additionally re-decide the tag at click time.
//
// Run:  node scripts/fix_offer_affiliate_tags.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY = process.argv.includes('--dry');
const here = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(here, '..', 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL.replace(/\/$/, '');

const TAG_BY_HOST_MARKET = {
  'amazon.com': 'qorai-20', 'amazon.com.tr': 'qorai-21',
  'amazon.de': 'qorai0d-21', 'amazon.co.uk': 'qorai0e-21',
};

function marketHost(host) {
  const h = host.toLowerCase().replace(/^www\./, '');
  return /(^|\.)amazon\./.test(host) ? h : '';
}

// Returns fixed URL string or null when nothing to change.
function fixUrl(raw, { wantTag }) {
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  const mh = marketHost(u.hostname);
  if (!mh) return null;
  const before = u.toString();
  u.searchParams.delete('linkCode');
  u.searchParams.delete('linkId');
  if (wantTag) {
    const own = TAG_BY_HOST_MARKET[mh];
    if (own) u.searchParams.set('tag', own);
    else u.searchParams.delete('tag'); // no program on this storefront → foreign tag would misattribute AND arm the router
  }
  const after = u.toString();
  return after === before ? null : after;
}

async function main() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  }).then(r => r.json());
  if (!auth?.token) throw new Error('PB admin auth failed');
  const H = { Authorization: auth.token, 'Content-Type': 'application/json' };

  let page = 1, scanned = 0, fixed = 0;
  for (;;) {
    const res = await fetch(
      `${PB}/api/collections/offers/records?page=${page}&perPage=500&sort=id&fields=id,url,affiliateUrl,country,store`,
      { headers: H },
    ).then(r => r.json());
    const items = res.items || [];
    const jobs = [];
    for (const o of items) {
      scanned++;
      const patch = {};
      const newUrl = fixUrl(o.url, { wantTag: false });
      const newAff = fixUrl(o.affiliateUrl || o.url, { wantTag: true });
      if (newUrl) patch.url = newUrl;
      if (newAff && newAff !== (o.affiliateUrl || '')) patch.affiliateUrl = newAff;
      if (!Object.keys(patch).length) continue;
      fixed++;
      if (DRY) {
        if (fixed <= 20) console.log(`[dry] ${o.id} ${o.country} ${o.store}\n  aff: ${o.affiliateUrl || '(bos)'} -> ${patch.affiliateUrl || '(ayni)'}`);
        continue;
      }
      jobs.push({ id: o.id, patch });
    }
    // 12'li havuz: 99k kaydı seri PATCH'lemek saatler sürer, RAM-kısıtlı PB'yi
    // boğmayacak kadar mütevazı bir eşzamanlılık yeterli.
    const POOL = 12;
    for (let i = 0; i < jobs.length; i += POOL) {
      await Promise.all(jobs.slice(i, i + POOL).map(async ({ id, patch }) => {
        const r = await fetch(`${PB}/api/collections/offers/records/${id}`, {
          method: 'PATCH', headers: H, body: JSON.stringify(patch),
        });
        if (!r.ok) console.error(`  !! ${id} PATCH ${r.status}`);
      }));
    }
    if (fixed % 5000 < 500) console.log(`  ... ${scanned} tarandi, ${fixed} duzeltildi`);
    if (page >= (res.totalPages || 1)) break;
    page++;
  }
  console.log(`\nTarama: ${scanned} offer, ${DRY ? 'duzeltilecek' : 'duzeltildi'}: ${fixed}`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
