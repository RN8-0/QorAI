// ─────────────────────────────────────────────────────────────────────────────
//  Rebuild EVERY Geizhals product's translations deterministically from the
//  German source snapshot (sourceSpecs / sourceSpecSections) using
//  admin/js/geizhals-glossary.js — no machine translation involved.
//
//  Fixes, catalog-wide:
//   • canonical-English specs/specSections (no more "Camera hinten",
//     "Gelistet seit", "umgekehrtes Laden", "B (A bis G)")
//   • complete multiLangSpecs.en / .tr atom maps (admin EN/TR views and the
//     website TR view hit on every atom — zero German leaks)
//   • multiLangSections.en/.tr (no more "Hatıra" for Memory)
//   • nameTranslated without MT case-mangling ("Samsung galaxy z Flip7 fe" →
//     "Samsung Galaxy Z Flip7 FE 128GB Black")
//   • capitalization: every label and value line starts uppercase (TR: İ)
//
//  After PB write, the matching Typesense doc gets a partial update of
//  _raw / name / nameSort so the website serves the fixed data immediately.
//
//  Usage:
//    node scripts/fix_geizhals_products.mjs            # dry-run + residue report
//    node scripts/fix_geizhals_products.mjs --apply    # write PB + Typesense
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const GLOSSARY = require(path.join(ROOT, 'admin', 'js', 'geizhals-glossary.js'));

const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL;
const TS = (env.TYPESENSE_URL || '').replace(/\/+$/, '');
const TS_KEY = env.TYPESENSE_API_KEY;

let token = null;
async function pbAuth() {
  const res = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`PB auth ${res.status}`);
  token = body.token;
}
async function pb(pathname, opts = {}) {
  if (!token) await pbAuth();
  const res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Authorization: token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`PB ${pathname} -> ${res.status}: ${(await res.text()).slice(0, 250)}`);
  return res.json();
}

async function tsPatchDoc(id, partial) {
  const res = await fetch(`${TS}/collections/products/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    if (res.status === 404) return { missing: true };
    throw new Error(`TS patch ${id} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// keySpecs: card-level highlights. Rebuild from clean canonical specs so no
// German residue survives there either.
function buildKeySpecs(specs, oldKeySpecs) {
  const out = {};
  const pickLine = (key, lineFilter) => {
    const v = specs[key];
    if (!v) return '';
    const lines = String(v).split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return '';
    if (lineFilter) {
      const hit = lines.find(lineFilter);
      if (hit) return hit;
    }
    return lines[0];
  };
  const battery = pickLine('Battery capacity', (l) => /mah/i.test(l));
  if (battery) out['Battery capacity'] = battery;
  const screen = pickLine('Screen size', (l) => /"|inch/i.test(l));
  if (screen) out['Screen size'] = screen;
  const cam = pickLine('Main camera', (l) => /mp/i.test(l));
  if (cam) out['Main camera'] = cam;
  if (specs.RAM) out.RAM = String(specs.RAM).split('\n')[0];
  if (specs.Storage) out.Storage = String(specs.Storage).split('\n')[0];
  if (specs.Chipset) out.Chipset = String(specs.Chipset).split('\n')[0];
  const os = pickLine('Operating system');
  if (os) out['Operating system'] = os;
  if (specs['Water resistance']) out['Water resistance'] = String(specs['Water resistance']).split('\n')[0];
  // Keep any clean old keys we did not regenerate (e.g. price-derived ones).
  for (const [k, v] of Object.entries(oldKeySpecs || {})) {
    if (out[k]) continue;
    if (GLOSSARY.residueCheck(`${k} ${v}`).length) continue; // drop dirty leftovers
    if (/pro zyklus|hinten|vorne|gelistet/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

async function main() {
  console.log(`[fix-geizhals] glossary ${GLOSSARY.VERSION} · mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const items = [];
  let page = 1;
  for (;;) {
    const data = await pb(`/api/collections/products/records?perPage=200&page=${page}&filter=${encodeURIComponent(`source~'geizhals'`)}`);
    items.push(...(data.items || []));
    if (page >= (data.totalPages || 1)) break;
    page++;
  }
  console.log(`[fix-geizhals] products: ${items.length}`);

  const allResidues = [];
  let written = 0, tsPatched = 0, tsMissing = 0;
  const samples = [];

  for (const rec of items) {
    const built = GLOSSARY.buildProductTranslations(rec);
    if (built.residues.length) {
      for (const r of built.residues) allResidues.push({ slug: rec.slug, ...r });
    }

    const srcSpecs = rec.sourceSpecs && Object.keys(rec.sourceSpecs || {}).length ? rec.sourceSpecs : rec.specs;
    const srcSections = rec.sourceSpecSections && Object.keys(rec.sourceSpecSections || {}).length ? rec.sourceSpecSections : rec.specSections;

    const patch = {
      specs: built.specs,
      specSections: built.specSections,
      specsEn: built.specs,
      keySpecs: buildKeySpecs(built.specs, rec.keySpecs),
      specsCount: Object.keys(built.specs).length,
      nameTranslated: built.nameTranslated,
      // German spec views were removed (2026-06-30): keep TR + EN only. The
      // German source is preserved in sourceSpecs/sourceSpecSections below for
      // re-deriving TR/EN, but never exposed as a "de" spec map.
      multiLangSpecs: { en: built.multiLangSpecs.en, tr: built.multiLangSpecs.tr },
      multiLangSections: { en: built.multiLangSections.en, tr: built.multiLangSections.tr },
      sourceLang: 'de',
      sourceSpecs: srcSpecs || {},
      sourceSpecSections: srcSections || {},
    };

    if (samples.length < 2) {
      samples.push({
        slug: rec.slug,
        name: built.nameTranslated,
        specsSample: Object.fromEntries(Object.entries(built.specs).slice(0, 6)),
        trSample: Object.fromEntries(Object.entries(built.multiLangSpecs.tr).slice(0, 10)),
        keySpecs: patch.keySpecs,
      });
    }

    if (APPLY) {
      await pb(`/api/collections/products/records/${rec.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      written++;
      // Refresh the Typesense doc's embedded raw record.
      const fresh = await pb(`/api/collections/products/records/${rec.id}`);
      try {
        const r = await tsPatchDoc(rec.id, {
          name: fresh.name || '',
          nameSort: String(fresh.name || '').toLowerCase(),
          _raw: JSON.stringify(fresh),
        });
        if (r && r.missing) tsMissing++; else tsPatched++;
      } catch (e) {
        console.warn(`[fix-geizhals] TS patch failed ${rec.slug}: ${e.message}`);
      }
    }
  }

  console.log(`\n[fix-geizhals] residues: ${allResidues.length}`);
  for (const r of allResidues.slice(0, 40)) {
    console.log(`  ✗ ${r.slug} · ${r.where} · [${r.tokens.join(',')}] · ${JSON.stringify(r.text)}`);
  }
  if (allResidues.length > 40) console.log(`  … +${allResidues.length - 40} more`);

  console.log('\n[fix-geizhals] samples:');
  console.log(JSON.stringify(samples, null, 2).slice(0, 4500));

  if (APPLY) {
    console.log(`\n[fix-geizhals] DONE. PB written=${written} · TS patched=${tsPatched} · TS missing=${tsMissing}`);
  } else {
    console.log(`\n[fix-geizhals] dry-run only. ${allResidues.length === 0 ? 'ZERO residue — safe to --apply.' : 'Fix residues before --apply.'}`);
  }
  if (allResidues.length) {
    fs.writeFileSync(path.join(__dirname, '.fix_geizhals_residues.json'), JSON.stringify(allResidues, null, 2));
    console.log('[fix-geizhals] residue detail → scripts/.fix_geizhals_residues.json');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
