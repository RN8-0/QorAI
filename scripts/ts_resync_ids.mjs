// Re-upsert a saved id list into Typesense via ts_fast_upsert_products.js.
// Used after fix_sponsored_keyspecs.mjs when TS batches failed (150-id PB
// filters 400'd); PB is already clean, only TS docs need regenerating.
//   node scripts/ts_resync_ids.mjs [idsFile] [batchSize]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const idsFile = process.argv[2] || path.join(ROOT, 'scripts', '.sponsored_repair_ids.json');
const BATCH = Number(process.argv[3] || 40);

const ids = JSON.parse(readFileSync(idsFile, 'utf8'));
console.log(`TS resync: ${ids.length} ids, batch=${BATCH}`);
let ok = 0, failed = 0;
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH);
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'ts_fast_upsert_products.js')], {
      env: { ...process.env, TS_FAST_IDS: batch.join(',') },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
    });
    ok += batch.length;
  } catch (e) {
    failed++;
    console.log(`  ! batch ${Math.floor(i / BATCH) + 1} (${batch[0]}…): ${String(e.message).slice(0, 120)}`);
  }
  if ((i / BATCH) % 50 === 0) console.log(`  …${Math.min(i + BATCH, ids.length)}/${ids.length} (ok≈${ok}, failed batches=${failed})`);
}
console.log(`Done: ~${ok} docs re-upserted, ${failed} batches failed.`);
