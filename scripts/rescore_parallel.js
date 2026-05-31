/**
 * Parallel re-score of specific categories — N at a time.
 *
 *   node scripts/rescore_parallel.js <parallel> <cat1> <cat2> ...
 */
'use strict';
const path = require('path');
const cp = require('child_process');

const argv = process.argv.slice(2);
const PAR = Math.max(1, Math.min(8, parseInt(argv[0], 10) || 3));
const CATS = argv.slice(1);
if (!CATS.length) { console.error('usage: node scripts/rescore_parallel.js <par> <cat1>…'); process.exit(2); }

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
    child.stderr.on('data', () => {});
    child.on('exit', code => {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`  [${cat.padEnd(20)}] exit=${code} · ${secs}s · ${lastLine || '(no summary)'}`);
      resolve({ cat, code });
    });
  });
}

(async () => {
  console.log(`\n  Re-scoring ${CATS.length} categories with ${PAR} parallel workers.\n`);
  let i = 0;
  async function next() {
    while (i < CATS.length) {
      const cat = CATS[i++];
      console.log(`→ ${cat}`);
      await runCat(cat);
    }
  }
  const workers = Array.from({ length: PAR }, next);
  await Promise.all(workers);
  console.log('\n  All done.');
})();
