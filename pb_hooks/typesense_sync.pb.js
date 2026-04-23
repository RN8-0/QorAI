/// pb_hooks/typesense_sync.pb.js
/// PocketBase server-side hook: keeps Typesense `products` index in sync
/// with PocketBase `products` collection.
///
/// Fires on every create / update / delete — even when the change is made
/// directly in PocketBase's built-in admin UI (/_/), not just via the
/// Qor AI admin web panel.

const TS_URL        = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY        = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';

// ─── helpers ────────────────────────────────────────────────────────────────

function _tsHeaders() {
  return {
    'X-TYPESENSE-API-KEY': TS_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function _flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) {
    return ks
      .map(function(x) { return typeof x === 'object' ? Object.values(x).join(' ') : String(x); })
      .join(' ');
  }
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

// Returns null if the field value can't be JSON-parsed — returns raw string.
function _parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

/// Build a Typesense document from a PocketBase record.
/// Must match the shape produced by admin/js/ts_client.js :: tsBuildDoc().
function buildTsDoc(record) {
  var keySpecs = _parseJson(record.get('keySpecs'));
  var tags     = _parseJson(record.get('tags'));
  if (!Array.isArray(tags)) tags = [];

  var techScore  = parseFloat(record.get('techScore'))  || 0;
  var trendScore = parseFloat(record.get('trendScore')) || 0;
  var specsCount = parseInt(record.get('specsCount'), 10) || 0;

  // Build a minimal _raw snapshot (same approach as the admin JS client)
  var pbData = {
    id:           record.id,
    slug:         record.get('slug')         || '',
    name:         record.get('name')         || '',
    brand:        record.get('brand')        || '',
    category:     record.get('category')     || '',
    subcategory:  record.get('subcategory')  || '',
    source:       record.get('source')       || '',
    imageUrl:     record.get('imageUrl') || record.get('imageURL') || '',
    techScore:    techScore,
    trendScore:   trendScore,
    price_segment: record.get('price_segment') || '',
    specsCount:   specsCount,
    keySpecs:     keySpecs,
    tags:         tags,
  };

  return {
    id:            record.id,
    slug:          pbData.slug,
    name:          pbData.name,
    brand:         pbData.brand,
    category:      pbData.category,
    subcategory:   pbData.subcategory,
    source:        pbData.source,
    imageUrl:      pbData.imageUrl,
    techScore:     techScore,
    trendScore:    trendScore,
    price_segment: pbData.price_segment,
    specsCount:    specsCount,
    keySpecsText:  _flattenKeySpecs(keySpecs),
    tags:          tags,
    _raw:          JSON.stringify(pbData),
  };
}

/// Upsert a document to Typesense.
function tsUpsert(record) {
  try {
    var doc  = buildTsDoc(record);
    var resp = $http.send({
      method:  'POST',
      url:     TS_URL + '/collections/' + TS_COLLECTION + '/documents?action=upsert',
      headers: _tsHeaders(),
      body:    JSON.stringify(doc),
      timeout: 15,
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      console.log('[typesense_sync] upsert OK — id=' + record.id);
    } else {
      console.log('[typesense_sync] upsert WARN ' + resp.statusCode + ' — id=' + record.id + ' body=' + resp.raw.slice(0, 200));
    }
  } catch (err) {
    console.log('[typesense_sync] upsert ERROR — id=' + record.id + ':', err);
  }
}

/// Delete a document from Typesense.
function tsDelete(recordId) {
  try {
    var resp = $http.send({
      method:  'DELETE',
      url:     TS_URL + '/collections/' + TS_COLLECTION + '/documents/' + encodeURIComponent(recordId),
      headers: _tsHeaders(),
      timeout: 10,
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      console.log('[typesense_sync] delete OK — id=' + recordId);
    } else if (resp.statusCode === 404) {
      console.log('[typesense_sync] delete SKIP (not found) — id=' + recordId);
    } else {
      console.log('[typesense_sync] delete WARN ' + resp.statusCode + ' — id=' + recordId);
    }
  } catch (err) {
    console.log('[typesense_sync] delete ERROR — id=' + recordId + ':', err);
  }
}

// ─── hooks ──────────────────────────────────────────────────────────────────

onRecordAfterCreateSuccess(function (e) {
  try { tsUpsert(e.record); } catch (err) {
    console.log('[typesense_sync] create hook error:', err);
  }
}, 'products');

onRecordAfterUpdateSuccess(function (e) {
  try { tsUpsert(e.record); } catch (err) {
    console.log('[typesense_sync] update hook error:', err);
  }
}, 'products');

onRecordAfterDeleteSuccess(function (e) {
  try { tsDelete(e.record.id); } catch (err) {
    console.log('[typesense_sync] delete hook error:', err);
  }
}, 'products');
