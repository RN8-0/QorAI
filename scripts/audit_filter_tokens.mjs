// ─────────────────────────────────────────────────────────────────────────────
//  Audit every category's Typesense browse filters for unit/spec confusion.
//
//  Flags the classic bugs where one spec leaks into another filter group:
//    • storage tokens that are really battery mAh (e.g. smartwatch "174 GB")
//    • ram tokens that are really storage / VRAM
//    • screen sizes out of plausible range
//    • battery capacities out of plausible range
//
//  Read-only — uses the public search key, touches nothing.
//  Usage:  node scripts/audit_filter_tokens.mjs
// ─────────────────────────────────────────────────────────────────────────────

const TS = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const K = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const HDR = { 'X-TYPESENSE-API-KEY': K };

// Plausible storage sizes (GB). Anything else in a storage token is suspicious.
const STD_STORAGE = new Set([
  1, 2, 4, 8, 16, 32, 48, 64, 96, 128, 192, 240, 250, 256, 320, 480, 500, 512,
  1024, 2048, // these appear as *_tb normally, kept for safety
]);
const STD_RAM = new Set([1, 2, 3, 4, 6, 8, 10, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128, 192, 256]);

async function tsGet(path, params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const r = await fetch(`${TS}${path}${qs ? `?${qs}` : ''}`, { headers: HDR, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`TS ${r.status}`);
  return r.json();
}

async function categories() {
  const d = await tsGet('/collections/products/documents/search', { q: '*', query_by: 'name', per_page: 0, facet_by: 'category', max_facet_values: 200 });
  return (d.facet_counts?.[0]?.counts || []).map((c) => ({ cat: c.value, count: c.count }));
}

function tokensByPrefix(facetCounts) {
  const groups = {};
  (facetCounts || []).forEach((c) => {
    const i = String(c.value).indexOf(':');
    if (i < 1) return;
    const prefix = c.value.slice(0, i);
    const val = c.value.slice(i + 1);
    (groups[prefix] = groups[prefix] || []).push({ val, count: c.count });
  });
  return groups;
}

async function numericRange(cat, field) {
  // Min / max of a numeric field, ignoring zeros.
  const filt = '`' + cat + '`';
  const asc = await tsGet('/collections/products/documents/search', {
    q: '*', query_by: 'name', filter_by: `category:=${filt} && ${field}:>0`,
    sort_by: `${field}:asc`, per_page: 1, include_fields: `id,${field}`,
  }).catch(() => null);
  const desc = await tsGet('/collections/products/documents/search', {
    q: '*', query_by: 'name', filter_by: `category:=${filt} && ${field}:>0`,
    sort_by: `${field}:desc`, per_page: 1, include_fields: `id,${field}`,
  }).catch(() => null);
  const lo = asc?.hits?.[0]?.document?.[field];
  const hi = desc?.hits?.[0]?.document?.[field];
  const n = asc?.found || 0;
  return { lo, hi, n };
}

async function main() {
  const cats = await categories();
  console.log(`Auditing ${cats.length} categories\n`);
  const problems = [];

  for (const { cat, count } of cats) {
    const filt = '`' + cat + '`';
    let facet;
    try {
      facet = await tsGet('/collections/products/documents/search', {
        q: '*', query_by: 'name', filter_by: `category:=${filt}`,
        per_page: 0, facet_by: 'filterTokens', max_facet_values: 500,
      });
    } catch (e) { console.log(`${cat}: facet error ${e.message}`); continue; }
    const groups = tokensByPrefix(facet.facet_counts?.[0]?.counts || []);

    const flags = [];

    // storage anomalies
    const storage = groups.storage || [];
    if (storage.length) {
      const gb = storage.filter((s) => s.val.endsWith('_gb')).map((s) => ({ n: parseInt(s.val, 10), count: s.count, val: s.val }));
      const bad = gb.filter((g) => !STD_STORAGE.has(g.n));
      const badProducts = bad.reduce((a, b) => a + b.count, 0);
      const totalStorage = storage.reduce((a, b) => a + b.count, 0);
      if (badProducts > 0 && (badProducts / Math.max(1, totalStorage)) > 0.05) {
        flags.push(`STORAGE: ${bad.length} non-standard GB values across ${badProducts}/${totalStorage} products — e.g. ${bad.slice(0, 8).map((b) => b.n).sort((a, b) => a - b).join(',')}`);
      }
    }

    // ram anomalies
    const ram = groups.ram || [];
    if (ram.length) {
      const bad = ram.map((s) => ({ n: parseInt(s.val, 10), count: s.count })).filter((g) => !STD_RAM.has(g.n));
      const badProducts = bad.reduce((a, b) => a + b.count, 0);
      const total = ram.reduce((a, b) => a + b.count, 0);
      if (badProducts > 0 && (badProducts / Math.max(1, total)) > 0.05) {
        flags.push(`RAM: ${bad.length} non-standard values across ${badProducts}/${total} — e.g. ${bad.slice(0, 8).map((b) => b.n).sort((a, b) => a - b).join(',')}`);
      }
    }

    // screen size range
    const sc = await numericRange(cat, 'screenSizeValue');
    if (sc.n > 0 && (sc.hi > 110 || sc.lo < 0.4)) {
      flags.push(`SCREEN: range ${sc.lo}"–${sc.hi}" over ${sc.n}`);
    }
    // battery range (mAh) — phones up to ~7000, tablets ~13000, laptops Wh small
    const bt = await numericRange(cat, 'batteryCapacityValue');
    if (bt.n > 0 && bt.hi > 25000) {
      flags.push(`BATTERY: up to ${bt.hi} mAh over ${bt.n}`);
    }

    const groupSummary = Object.entries(groups).map(([p, arr]) => `${p}(${arr.length})`).join(' ');
    if (flags.length) {
      problems.push({ cat, count });
      console.log(`⚠ ${cat} [${count}] ${groupSummary}`);
      flags.forEach((f) => console.log(`    ${f}`));
    } else {
      console.log(`✓ ${cat} [${count}] ${groupSummary}`);
    }
  }
  console.log(`\n${problems.length} categories flagged: ${problems.map((p) => p.cat).join(', ')}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
