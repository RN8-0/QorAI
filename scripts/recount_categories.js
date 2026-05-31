/**
 * Qor AI — Category recount (non-destructive)
 *
 * For every record in the `categories` collection, count how many products
 * carry that slug and write the real productCount + isActive (count > 0).
 * Does NOT re-tag products, does NOT delete any record. Only writes
 * productCount/isActive back onto the ~35 category records.
 *
 *   node scripts/recount_categories.js          apply
 *   node scripts/recount_categories.js --dry     preview only
 */
'use strict';

const { req } = require('../migration/pb');

const DRY = process.argv.includes('--dry');
const SKIP_SLUGS = new Set(['gaming', 'subscription', 'tech', 'travel']);

const enc = v => encodeURIComponent(v);
const filt = v => `category="${String(v).replace(/"/g, '\\"')}"`;

async function withRetry(label, fn, attempts = 6) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const delay = Math.min(8000, 500 * Math.pow(2, i));
      console.log(`  retry ${i}/${attempts} ${label}: ${String(e.message || e).slice(0, 120)}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function countProducts(category) {
  return withRetry(`count ${category}`, async () => {
    const r = await req('GET', `/api/collections/products/records?perPage=1&skipTotal=0&fields=id&filter=${enc(filt(category))}`);
    if (r.status !== 200) throw new Error(`count ${category}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    return r.body.totalItems || 0;
  });
}

async function main() {
  console.log(`\n  Category recount ${DRY ? '(DRY RUN)' : ''}\n`);

  const catRes = await withRetry('list categories', async () => {
    const r = await req('GET', '/api/collections/categories/records?perPage=500&sort=slug');
    if (r.status !== 200) throw new Error(`list: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    return r;
  });
  const categories = (catRes.body.items || []).filter(c => c.slug && !SKIP_SLUGS.has(c.slug));
  console.log(`  ${categories.length} category records to recount\n`);

  let active = 0, inactive = 0, changed = 0;
  for (const cat of categories) {
    const count = await countProducts(cat.slug);
    const isActive = count > 0;
    isActive ? active++ : inactive++;
    const needsUpdate = cat.productCount !== count || cat.isActive !== isActive;
    if (needsUpdate && !DRY) {
      await withRetry(`patch ${cat.slug}`, async () => {
        const u = await req('PATCH', `/api/collections/categories/records/${cat.id}`, { productCount: count, isActive });
        if (u.status !== 200) throw new Error(`patch ${cat.slug}: ${u.status} ${JSON.stringify(u.body).slice(0, 120)}`);
        return u;
      });
      changed++;
    }
    const flag = needsUpdate ? (DRY ? ' (would update)' : ' (updated)') : '';
    console.log(`  · ${cat.slug.padEnd(22)} ${String(count).padStart(6)}  ${isActive ? 'active' : 'inactive'}${flag}`);
  }

  console.log(`\n  Done — ${active} active, ${inactive} inactive; ${changed} record(s) ${DRY ? 'would be' : ''} updated.${DRY ? ' (dry run)' : ''}\n`);
}

main().catch(e => { console.error('  x', e.message); process.exit(1); });
