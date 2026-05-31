/**
 * Re-score every category one by one (cheap fetch per cat, safe restart).
 *
 *   node scripts/rescore_all_cats.js [--skip=cat1,cat2]
 *
 * Loops categories smallest-first so the big ones (laptops/desktops/tvs)
 * land last and don't block quick wins. Each category is its own
 * subprocess via require so a network blip on one doesn't abort the rest.
 */
'use strict';
const path = require('path');
const cp = require('child_process');

const argv = process.argv.slice(2);
const skip = new Set(
  ((argv.find(a => a.startsWith('--skip=')) || '').split('=')[1] || '')
    .split(',').filter(Boolean)
);

const { req } = require('../migration/pb');

async function listCategoriesWithCount() {
  // Cursor sweep grouping by category — cheaper than 46 separate counts.
  const out = {};
  let lastId = '';
  for (;;) {
    const filters = lastId ? [`id>"${lastId.replace(/"/g, '\\"')}"`] : [];
    const filter = filters.length ? `&filter=${encodeURIComponent(filters.join(' && '))}` : '';
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=1&sort=id&skipTotal=1&fields=id,category${filter}`);
    const items = r.body.items || [];
    for (const it of items) out[it.category || '_uncat'] = (out[it.category || '_uncat'] || 0) + 1;
    if (items.length) lastId = items[items.length - 1].id;
    if (items.length < 500) break;
  }
  return out;
}

function runCat(cat) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = cp.spawn('node', [path.join(__dirname, 'score_catalog.js'), '--overwrite', `--cat=${cat}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let lastLine = '';
    child.stdout.on('data', buf => {
      const lines = buf.toString().split(/\r?\n/).filter(Boolean);
      for (const l of lines) {
        if (/Done — |✗|failed/.test(l)) lastLine = l.trim();
      }
    });
    child.stderr.on('data', buf => { process.stderr.write(buf); });
    child.on('exit', code => {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`  [${cat.padEnd(20)}] exit=${code} · ${secs}s · ${lastLine || '(no summary)'}`);
      resolve({ cat, code, lastLine, secs });
    });
  });
}

(async () => {
  console.log('\n  Enumerating categories…');
  const counts = await listCategoriesWithCount();
  const cats = Object.entries(counts)
    .filter(([c]) => c && c !== '_uncat' && !skip.has(c))
    .sort((a, b) => a[1] - b[1]);     // smallest first
  console.log(`  ${cats.length} categories (skipping ${[...skip].join(', ') || 'none'}).\n`);

  const summary = [];
  for (const [cat, n] of cats) {
    console.log(`\n→ ${cat} (${n} products)`);
    const res = await runCat(cat);
    summary.push({ cat, n, ...res });
  }

  console.log('\n  Done. Recap:');
  for (const s of summary) {
    console.log(`    ${s.cat.padEnd(22)} n=${String(s.n).padStart(6)} · ${s.secs}s · ${s.lastLine.slice(0, 100)}`);
  }
})().catch(e => { console.error('  ✗', e.message); process.exit(1); });
