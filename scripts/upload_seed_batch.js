/**
 * Reads every scripts/seed_data/atom_translations_*.json file, merges them
 * into the existing tr_translation_dict shards on PocketBase, and reuploads
 * the shards. Standalone — does not depend on the harvest pipeline.
 *
 *   node scripts/upload_seed_batch.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', 'migration', '.env')), ...process.env };
const PB_URL = (env.POCKETBASE_URL || '').replace(/\/$/, '');
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = env.POCKETBASE_ADMIN_PASSWORD;

const DICT_PB_KEY = 'tr_translation_dict';
const DICT_MANIFEST_KEY = `${DICT_PB_KEY}_manifest`;
const DICT_SHARD_PREFIX = `${DICT_PB_KEY}__part_`;
const DICT_SHARD_MAX_BYTES = 180000;
const LANGS = ['en', 'de', 'es', 'fr', 'pt', 'ru'];

const normalizeKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function loadAllBatches() {
  const dir = path.join(__dirname, 'seed_data');
  const merged = {};
  for (const file of fs.readdirSync(dir).filter(f => /^atom_translations_.*\.json$/i.test(f)).sort()) {
    const obj = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [src, vals] of Object.entries(obj)) {
      if (!Array.isArray(vals) || vals.length < LANGS.length) continue;
      const key = normalizeKey(src);
      if (!key) continue;
      const entry = { tr: src };
      LANGS.forEach((l, i) => { if (vals[i]) entry[l] = vals[i]; });
      merged[key] = entry;
    }
    console.log(`  loaded ${file}: ${Object.keys(obj).length} entries`);
  }
  return merged;
}

async function withRetry(label, fn, attempts = 5) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const wait = 2000 * i;
      console.warn(`  ! ${label} attempt ${i}/${attempts} failed: ${e.message}; waiting ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function auth() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`auth ${r.status}`);
  return (await r.json()).token;
}

(async () => {
  const fromFiles = loadAllBatches();
  console.log(`\nTotal batch entries: ${Object.keys(fromFiles).length}`);

  const token = await withRetry('auth', () => auth());
  console.log('Authenticated.');

  const listing = await withRetry('list shards', async () => {
    const r = await fetch(
      `${PB_URL}/api/collections/public_config/records?perPage=200&filter=${encodeURIComponent('key~"tr_translation_dict__part_"')}&fields=id,value`,
      { headers: { Authorization: token }, signal: AbortSignal.timeout(30000) },
    );
    if (!r.ok) throw new Error(`list ${r.status}`);
    return r.json();
  });
  const items = listing.items || [];
  const existing = {};
  for (const it of items) {
    const terms = it.value?.terms || {};
    for (const [k, v] of Object.entries(terms)) existing[k] = v;
  }
  console.log(`Existing dict size: ${Object.keys(existing).length}`);

  let added = 0;
  for (const [k, v] of Object.entries(fromFiles)) {
    if (!existing[k] || JSON.stringify(existing[k]) !== JSON.stringify(v)) {
      existing[k] = v;
      added++;
    }
  }
  console.log(`Added / updated: ${added}`);
  console.log(`Merged dict size: ${Object.keys(existing).length}`);

  // Rebuild shards.
  const shards = [];
  let shard = {}, bytes = 0;
  for (const [k, v] of Object.entries(existing)) {
    const eb = Buffer.byteLength(JSON.stringify({ [k]: v }), 'utf8');
    if (Object.keys(shard).length && bytes + eb > DICT_SHARD_MAX_BYTES) {
      shards.push(shard); shard = {}; bytes = 0;
    }
    shard[k] = v; bytes += eb;
  }
  if (Object.keys(shard).length) shards.push(shard);
  console.log(`Will write ${shards.length} shards.`);

  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const updatedAt = new Date().toISOString();

  const upsert = async (key, value) => {
    const search = await withRetry(`search ${key}`, async () => {
      const r = await fetch(
        `${PB_URL}/api/collections/public_config/records?filter=${encodeURIComponent(`key="${key}"`)}&fields=id`,
        { headers: { Authorization: token }, signal: AbortSignal.timeout(30000) },
      );
      if (!r.ok) throw new Error(`search ${r.status}`);
      return r.json();
    });
    const body = { key, value, updatedAt };
    if (search.items && search.items.length) {
      await withRetry(`patch ${key}`, async () => {
        const r = await fetch(`${PB_URL}/api/collections/public_config/records/${search.items[0].id}`, {
          method: 'PATCH', headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) throw new Error(`patch ${r.status} ${await r.text().catch(() => '')}`);
      });
    } else {
      await withRetry(`create ${key}`, async () => {
        const r = await fetch(`${PB_URL}/api/collections/public_config/records`, {
          method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) throw new Error(`create ${r.status} ${await r.text().catch(() => '')}`);
      });
    }
  };

  // delete extras
  for (const it of items) {
    const idx = Number(it.value?.index ?? -1);
    if (idx >= shards.length) {
      try {
        await withRetry(`delete extra ${idx}`, async () => {
          const r = await fetch(`${PB_URL}/api/collections/public_config/records/${it.id}`, {
            method: 'DELETE', headers: { Authorization: token }, signal: AbortSignal.timeout(20000),
          });
          if (!r.ok && r.status !== 404) throw new Error(`delete ${r.status}`);
        });
      } catch (e) { console.warn('  ! delete extra shard failed:', e.message); }
    }
  }

  for (let i = 0; i < shards.length; i++) {
    const key = `${DICT_SHARD_PREFIX}${String(i).padStart(4, '0')}`;
    await upsert(key, { sharded: true, batchId, index: i, total: shards.length, terms: shards[i] });
    console.log(`  ✓ shard ${i} (${Object.keys(shards[i]).length} entries)`);
  }
  await upsert(DICT_MANIFEST_KEY, { sharded: true, batchId, totalShards: shards.length, totalTerms: Object.keys(existing).length, updatedAt });
  await upsert(DICT_PB_KEY, { sharded: true, manifestKey: DICT_MANIFEST_KEY, totalShards: shards.length, totalTerms: Object.keys(existing).length, updatedAt });
  console.log(`\nUploaded. Dict total: ${Object.keys(existing).length}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
