// ─────────────────────────────────────────────────────────────────────────────
//  Strip the German ("de") values out of the Epey translation dictionary
//  (public_config.tr_translation_dict + its __part_* shards).
//
//  The dictionary maps each Turkish source term → { tr, en, de, ... }. German
//  spec translation was removed (2026-07-01), so every entry's `de` value is
//  purged here. The dictionary becomes TR → EN only.
//
//  KEPT on purpose:
//    • public_config.de_translation_dict (Geizhals DE→TR+EN) — that dictionary
//      CONSUMES German source and outputs TR/EN; it never produces German.
//    • Each entry's `en` (and tr) values.
//
//  Usage:
//    node scripts/purge_german_dict.mjs           # dry-run
//    node scripts/purge_german_dict.mjs --apply   # write
//
//  Env (migration/.env): POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL;

let token = null;
async function pbAuth() {
  const res = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PB auth ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  token = body.token;
}
async function pbFetch(pathname, opts = {}) {
  if (!token) await pbAuth();
  let res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Accept: 'application/json', Authorization: token, ...(opts.headers || {}) } });
  if (res.status === 401) { token = null; await pbAuth(); res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Accept: 'application/json', Authorization: token, ...(opts.headers || {}) } }); }
  return res;
}

// Return the term-map inside a doc value, whichever legacy/sharded shape it uses.
function termsOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.terms && typeof value.terms === 'object' && !Array.isArray(value.terms)) return value.terms;
  // Legacy non-sharded: value itself is { term: {en,de,...} }. Detect by shape:
  // at least one entry that is an object of string translations.
  const looksFlat = Object.values(value).some(
    (v) => v && typeof v === 'object' && !Array.isArray(v) &&
      Object.values(v).some((s) => typeof s === 'string'),
  );
  return looksFlat ? value : null;
}

// Delete `de` from every entry; return count removed.
function stripDe(terms) {
  let removed = 0;
  for (const k of Object.keys(terms)) {
    const entry = terms[k];
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'de')) {
      delete entry.de;
      removed++;
    }
  }
  return removed;
}

async function main() {
  console.log(`[dict-de-purge] mode=${APPLY ? 'APPLY (writing)' : 'DRY-RUN'}`);

  // Fetch every public_config doc whose key belongs to the TR dictionary
  // (main + manifest + __part_* shards). ~"tr_translation_dict" matches all.
  const items = [];
  let page = 1;
  for (;;) {
    const res = await pbFetch(`/api/collections/public_config/records?perPage=200&page=${page}&filter=${encodeURIComponent(`key~'tr_translation_dict'`)}&fields=id,key,value`);
    if (!res.ok) throw new Error(`list page ${page} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    items.push(...(data.items || []));
    if (page >= (data.totalPages || 1)) break;
    page++;
  }
  console.log(`[dict-de-purge] tr_translation_dict docs: ${items.length}`);

  let docsWithTerms = 0, totalTerms = 0, deRemoved = 0, docsUpdated = 0, errors = 0;

  for (const rec of items) {
    const value = rec.value;
    const terms = termsOf(value);
    if (!terms) continue; // main pointer / manifest: no term values
    docsWithTerms++;
    totalTerms += Object.keys(terms).length;
    const removed = stripDe(terms);
    if (!removed) continue;
    deRemoved += removed;

    if (!APPLY) { docsUpdated++; continue; }
    try {
      const w = await pbFetch(`/api/collections/public_config/records/${rec.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
      });
      if (!w.ok) { errors++; console.error(`[dict-de-purge] PATCH ${rec.key} -> ${w.status}: ${(await w.text()).slice(0, 160)}`); continue; }
      docsUpdated++;
      console.log(`[dict-de-purge] ${rec.key}: removed de from ${removed} terms`);
    } catch (e) { errors++; console.error(`[dict-de-purge] ${rec.key} failed: ${e.message}`); }
  }

  console.log(`\n[dict-de-purge] DONE. docsWithTerms=${docsWithTerms} totalTerms=${totalTerms} deRemoved=${deRemoved} docsUpdated=${docsUpdated} errors=${errors}`);
  if (!APPLY) console.log('[dict-de-purge] dry-run only — re-run with --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); });
