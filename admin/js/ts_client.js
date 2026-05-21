// ═══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Typesense Client (browser)
//  Mirrors techScore + other indexed fields from PocketBase to
//  the Typesense `products` collection so the Flutter app shows
//  the same value everywhere.
// ═══════════════════════════════════════════════════════════════

const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
// Admin-side API key (full read/write). Admin panel itself is
// auth-protected, so embedding the key here is acceptable.
const TS_KEY = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';

function _tsHeaders() {
  return {
    'X-TYPESENSE-API-KEY': TS_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

async function tsRequest(method, path, body) {
  const res = await fetch(`${TS_URL}${path}`, {
    method,
    headers: _tsHeaders(),
    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch {}
  if (!res.ok) {
    const err = new Error(`Typesense ${method} ${path} → ${res.status}: ${typeof parsed === 'string' ? parsed.slice(0, 200) : (parsed.message || JSON.stringify(parsed))}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

// Build the same shape used by migration/ts_index.js so the
// document stays compatible with the existing schema.
// Currency conversion table (mirrored from scripts/fx_rates.js — keep in sync).
// Browser bundle has no Node `require`, so the table is duplicated inline.
const FX_TO_USD = Object.freeze({
  US: 1.00, USD: 1.00,
  CA: 0.73, CAD: 0.73, MX: 0.058, MXN: 0.058,
  DE: 1.08, AT: 1.08, NL: 1.08, BE: 1.08, FR: 1.08, IT: 1.08, ES: 1.08,
  PT: 1.08, IE: 1.08, FI: 1.08, GR: 1.08, EU: 1.08, EUR: 1.08,
  UK: 1.27, GB: 1.27, GBP: 1.27,
  PL: 0.25, PLN: 0.25, CH: 1.13, CHF: 1.13,
  SE: 0.094, SEK: 0.094, NO: 0.092, NOK: 0.092, DK: 0.145, DKK: 0.145,
  TR: 0.0286, TRY: 0.0286, AE: 0.272, AED: 0.272, SA: 0.267, SAR: 0.267,
  IN: 0.0120, INR: 0.0120, JP: 0.0067, JPY: 0.0067, CN: 0.14, CNY: 0.14,
  KR: 0.00072, KRW: 0.00072, SG: 0.74, SGD: 0.74, HK: 0.128, HKD: 0.128,
  AU: 0.65, AUD: 0.65, NZ: 0.60, NZD: 0.60,
  BR: 0.20, BRL: 0.20, AR: 0.0011, ARS: 0.0011,
});

function _lowestPriceUsd(prices) {
  if (!prices || typeof prices !== 'object') return 0;
  let lowest = Infinity;
  for (const [rawKey, rawValue] of Object.entries(prices)) {
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) continue;
    const fx = FX_TO_USD[String(rawKey || '').toUpperCase()];
    if (!fx) continue;
    const usd = value * fx;
    if (usd < lowest) lowest = usd;
  }
  return lowest === Infinity ? 0 : Math.round(lowest * 100) / 100;
}

function _flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) return ks.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)).join(' ');
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

function _normalizeSocketToken(value) {
  let socket = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/SOCKET/g, '')
    .replace(/FCLGA/g, 'LGA')
    .replace(/[^A-Z0-9]/g, '');
  if (/^STR\d+$/.test(socket)) socket = socket.slice(1);
  return socket;
}

function _socketAliases(socket) {
  const normalized = _normalizeSocketToken(socket);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  if (normalized === 'TRX50' || normalized === 'WRX90') aliases.add('TR5');
  if (normalized === 'TRX40' || normalized === 'WRX80') aliases.add('TR4');
  return Array.from(aliases);
}

function _extractSocketTokens(pb) {
  const texts = [pb?.name || ''];
  const pushMapValues = (value) => {
    if (!value || typeof value !== 'object') return;
    Object.values(value).forEach(v => {
      if (v && typeof v === 'object' && !Array.isArray(v)) pushMapValues(v);
      else if (v !== null && v !== undefined) texts.push(String(v));
    });
  };
  pushMapValues(pb?.specs || {});
  pushMapValues(pb?.keySpecs || {});
  pushMapValues(pb?.specSections || {});

  const tokens = new Set();
  texts.forEach(text => {
    const matches = String(text || '').toUpperCase().match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || [];
    matches.flatMap(_socketAliases).forEach(token => tokens.add(`socket:${token.toLowerCase()}`));
  });
  return Array.from(tokens);
}

function tsBuildDoc(pb) {
  const raw = JSON.stringify(pb);
  return {
    id: pb.id,
    slug: pb.slug || '',
    name: pb.name || '',
    brand: pb.brand || '',
    category: pb.category || '',
    subcategory: pb.subcategory || '',
    source: pb.source || '',
    imageUrl: pb.imageUrl || pb.imageURL || '',
    techScore: typeof pb.techScore === 'number' ? pb.techScore : 0,
    trendScore: typeof pb.trendScore === 'number' ? pb.trendScore : 0,
    price_segment: pb.price_segment || '',
    lowestPriceUSD: _lowestPriceUsd(pb.prices),
    specsCount: pb.specsCount || 0,
    keySpecsText: _flattenKeySpecs(pb.keySpecs),
    tags: Array.isArray(pb.tags) ? pb.tags : [],
    filterTokens: _extractSocketTokens(pb),
    _raw: raw,
  };
}

// Upsert a single full document (use after big edits / first scrape).
async function tsUpsertDoc(pbRecord) {
  if (!pbRecord || !pbRecord.id) return false;
  const doc = tsBuildDoc(pbRecord);
  try {
    await tsRequest('POST', `/collections/${TS_COLLECTION}/documents?action=upsert`, doc);
    return true;
  } catch (e) {
    console.warn('[ts] upsert failed', pbRecord.id, e.message);
    return false;
  }
}

// Patch only specific fields on an existing TS document.
// Falls back to full upsert when the doc isn't there yet.
async function tsPatchDoc(id, partial, fallbackPbRecord) {
  if (!id || !partial) return false;
  try {
    await tsRequest('PATCH', `/collections/${TS_COLLECTION}/documents/${encodeURIComponent(id)}`, partial);
    return true;
  } catch (e) {
    if (e.status === 404 && fallbackPbRecord) {
      return tsUpsertDoc(fallbackPbRecord);
    }
    console.warn('[ts] patch failed', id, e.message);
    return false;
  }
}

// Bulk import: array of full PB records → JSONL upsert.
// Returns { ok, fail } counts. Chunked at 500 docs per request.
async function tsBulkUpsert(pbRecords, onProgress) {
  const out = { ok: 0, fail: 0 };
  const CHUNK = 500;
  for (let i = 0; i < pbRecords.length; i += CHUNK) {
    const slice = pbRecords.slice(i, i + CHUNK);
    const jsonl = slice.map(p => JSON.stringify(tsBuildDoc(p))).join('\n');
    try {
      const res = await fetch(`${TS_URL}/collections/${TS_COLLECTION}/documents/import?action=upsert`, {
        method: 'POST',
        headers: { ...(_tsHeaders()), 'Content-Type': 'text/plain' },
        body: jsonl,
      });
      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        try { const j = JSON.parse(line); j.success ? out.ok++ : out.fail++; }
        catch { out.fail++; }
      }
    } catch (e) {
      out.fail += slice.length;
      console.warn('[ts] bulk chunk failed:', e.message);
    }
    if (typeof onProgress === 'function') onProgress(Math.min(i + CHUNK, pbRecords.length), pbRecords.length);
  }
  return out;
}

// Full-text search — fast and typo-tolerant. Returns the raw Typesense
// response ({ found, hits:[{document}], … }); each document carries `_raw`
// (the full PocketBase record JSON) so callers get complete product objects.
async function tsSearch(query, opts = {}) {
  const params = new URLSearchParams({
    q: String(query || '').trim() || '*',
    query_by: 'name,brand,category,keySpecsText',
    query_by_weights: '5,3,2,1',
    sort_by: opts.sortBy || (String(query || '').trim() ? '_text_match:desc,techScore:desc' : 'techScore:desc'),
    per_page: String(Math.min(250, Math.max(1, opts.perPage || 100))),
    page: String(opts.page || 1),
    num_typos: '2',
    typo_tokens_threshold: '1',
    drop_tokens_threshold: '2',
    prefix: 'true',
  });
  if (opts.filterBy) params.set('filter_by', opts.filterBy);
  if (opts.includeFields) params.set('include_fields', opts.includeFields);
  return tsRequest('GET', `/collections/${TS_COLLECTION}/documents/search?${params.toString()}`);
}

// Public surface
window.TsClient = {
  upsertDoc: tsUpsertDoc,
  patchDoc: tsPatchDoc,
  bulkUpsert: tsBulkUpsert,
  buildDoc: tsBuildDoc,
  search: tsSearch,
  request: tsRequest,
  COLLECTION: TS_COLLECTION,
  URL: TS_URL,
};
