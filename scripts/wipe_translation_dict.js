/**
 * Wipe Qor AI translation dictionaries (Epey TR + Geizhals DE) plus the
 * local Argos worker cache, so the next scrape rebuilds everything from
 * scratch through the new GPU pipeline.
 *
 * Usage:
 *   node scripts/wipe_translation_dict.js --confirm
 *
 * Without --confirm: dry run, prints what would be deleted.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Minimal .env parser — avoid the dotenv dependency.
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
const CONFIRM = process.argv.includes('--confirm');

if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  console.error('Missing POCKETBASE_URL / EMAIL / PASSWORD in migration/.env');
  process.exit(1);
}

async function auth() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!r.ok) throw new Error(`auth failed: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

async function listAll(token, filter) {
  const out = [];
  let page = 1;
  while (true) {
    const url = `${PB_URL}/api/collections/public_config/records?perPage=200&page=${page}&filter=${encodeURIComponent(filter)}&fields=id,key`;
    const r = await fetch(url, { headers: { Authorization: token } });
    if (!r.ok) throw new Error(`list failed: HTTP ${r.status}`);
    const j = await r.json();
    out.push(...(j.items || []));
    if (j.page >= j.totalPages || !j.items?.length) break;
    page++;
  }
  return out;
}

async function deleteRecord(token, id) {
  const r = await fetch(`${PB_URL}/api/collections/public_config/records/${id}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${id}: HTTP ${r.status}`);
}

async function upsertEmpty(token, key) {
  // Replace with an empty sharded marker so admin clients reload as fresh.
  const existing = await listAll(token, `key="${key}"`);
  const body = {
    key,
    value: { sharded: false, terms: {}, totalTerms: 0, updatedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  if (existing.length) {
    await fetch(`${PB_URL}/api/collections/public_config/records/${existing[0].id}`, {
      method: 'PATCH',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } else {
    await fetch(`${PB_URL}/api/collections/public_config/records`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

async function wipeWorkerCache() {
  const cache = path.join(__dirname, '.local-translate-cache.json');
  if (!fs.existsSync(cache)) {
    console.log('worker cache: not present');
    return;
  }
  if (!CONFIRM) {
    console.log(`worker cache: would clear ${cache}`);
    return;
  }
  // Try POST to running worker first (graceful), fall back to filesystem write.
  try {
    const r = await fetch('http://127.0.0.1:8797/clear-cache', { method: 'POST' });
    if (r.ok) {
      console.log('worker cache: cleared via /clear-cache endpoint');
      return;
    }
  } catch (_) {}
  fs.writeFileSync(cache, '{}', 'utf8');
  console.log('worker cache: cleared (file truncated to {})');
}

async function main() {
  console.log(`Mode: ${CONFIRM ? 'CONFIRM (will delete)' : 'DRY RUN (use --confirm to apply)'}`);
  const token = await auth();
  console.log('Authenticated to PocketBase.');

  for (const prefix of ['tr_translation_dict', 'de_translation_dict']) {
    const filter = `key="${prefix}" || key="${prefix}_manifest" || key~"${prefix}__part_"`;
    const records = await listAll(token, filter);
    console.log(`\n${prefix}: ${records.length} record(s) match`);
    for (const rec of records) {
      console.log(`  · ${rec.key} (${rec.id})`);
    }
    if (CONFIRM) {
      for (const rec of records) {
        await deleteRecord(token, rec.id);
      }
      // Re-create empty top-level so admin load doesn't 404 forever.
      await upsertEmpty(token, prefix);
      console.log(`  → deleted ${records.length} record(s); re-created empty ${prefix}`);
    }
  }

  await wipeWorkerCache();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
