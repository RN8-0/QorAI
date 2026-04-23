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
function _flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) return ks.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)).join(' ');
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
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
    specsCount: pb.specsCount || 0,
    keySpecsText: _flattenKeySpecs(pb.keySpecs),
    tags: Array.isArray(pb.tags) ? pb.tags : [],
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

// Public surface
window.TsClient = {
  upsertDoc: tsUpsertDoc,
  patchDoc: tsPatchDoc,
  bulkUpsert: tsBulkUpsert,
  buildDoc: tsBuildDoc,
  request: tsRequest,
  COLLECTION: TS_COLLECTION,
  URL: TS_URL,
};
