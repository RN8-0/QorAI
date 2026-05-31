// ═══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — PocketBase Client
//  Static admin client backed by PocketBase
// ═══════════════════════════════════════════════════════════════

const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const CONFIG_COLLECTIONS = new Set(['app_config', 'public_config']);

// Legacy collection aliases (older code paths reference removed collection names).
// Map them to existing collections to avoid 404 noise in console / dashboard.
const COLLECTION_ALIASES = {
  admin_logs: 'scraper_logs',
};

function _resolveCollection(name) {
  return COLLECTION_ALIASES[name] || name;
}

let _pb = null;

function getPb() {
  if (!_pb) _pb = new PocketBase(PB_URL);
  return _pb;
}

function _isPocketBaseRecordId(value) {
  return /^[a-z0-9]{15}$/.test(String(value || '').trim());
}

function _escapeFilterValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function _normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function pbEnsureAuth() {
  const pb = getPb();
  if (pb.authStore.isValid) return;
  throw new Error('Admin authentication required');
}

function _pbRequestOptions(options = {}) {
  const out = { $autoCancel: false };
  if (options.signal) out.signal = options.signal;
  return out;
}

async function _findRecord(collection, identifier, data = {}, options = {}) {
  collection = _resolveCollection(collection);
  const id = String(identifier || '').trim();
  const filters = [];

  if (_isPocketBaseRecordId(id)) {
    try {
      return await getPb().collection(collection).getOne(id, _pbRequestOptions(options));
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  if (data.key || CONFIG_COLLECTIONS.has(collection)) {
    const key = String(data.key || id).trim();
    if (key) filters.push(`key="${_escapeFilterValue(key)}"`);
  }

  if (data.slug || collection === 'products') {
    const slug = String(data.slug || id).trim();
    if (slug) filters.push(`slug="${_escapeFilterValue(slug)}"`);
  }

  if (collection === 'products') {
    const sourceUrl = String(data.sourceUrl || '').trim();
    // Product records are SKU/source-page records. Variants can share a model
    // family, configKey, name, MPN, or GTIN-like values and still must remain
    // visible as separate Products rows. Only the stable source identity should
    // turn a save into an update; variant grouping is handled separately via
    // variantGroup and the modal.
    if (sourceUrl) filters.push(`sourceUrl="${_escapeFilterValue(sourceUrl)}"`);
  }

  if (!filters.length) return null;

  const result = await getPb().collection(collection).getList(1, 1, {
    filter: filters.join(' || '),
    ..._pbRequestOptions(options),
  });
  return result.items[0] || null;
}

function _prepareCreateData(collection, identifier, data) {
  collection = _resolveCollection(collection);
  const clean = { ...data };
  const id = String(identifier || '').trim();

  if ((CONFIG_COLLECTIONS.has(collection) || clean.key !== undefined) && !clean.key && id) {
    clean.key = id;
  }

  if ((collection === 'products' || clean.slug !== undefined) && !clean.slug && id) {
    clean.slug = id;
  }

  return clean;
}

// ─── FIRESTORE-COMPATIBLE HELPERS ───────────────────────────────

// Read single doc by ID
async function pbGetDoc(collection, id) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  try {
    const item = await _findRecord(collection, id);
    if (item) return { exists: true, id: item.id, data: () => _strip(item) };
    return { exists: false, id, data: () => null };
  } catch (e) {
    if (e && (e.status === 404 || /missing collection/i.test(e.message || ''))) {
      return { exists: false, id, data: () => null };
    }
    throw e;
  }
}

// Upsert doc by ID (set with merge)
async function pbSetDoc(collection, id, data, options = {}) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  const clean = _clean(data);
  let existing;
  try {
    existing = await _findRecord(collection, id, clean, options);
  } catch (e) {
    console.error('[pbSetDoc] _findRecord failed:', { collection, id, error: e.message, status: e.status, data: e.data });
    throw e;
  }
  let record;
  try {
    if (existing) {
      record = await getPb().collection(collection).update(existing.id, clean, _pbRequestOptions(options));
    } else {
      const createData = _prepareCreateData(collection, id, clean);
      // New product: flag it as the variant-group primary unless its family
      // already has one, so the grouped product list stays consistent across
      // every writer (scraper, manual create…).
      if (collection === 'products' && createData.variantGroup && createData.variantPrimary === undefined) {
        try {
          const fam = await getPb().collection('products').getList(1, 1, {
            filter: `variantGroup = "${_escapeFilterValue(createData.variantGroup)}" && category = "${_escapeFilterValue(createData.category || '')}" && variantPrimary = true`,
            ..._pbRequestOptions(options), fields: 'id',
          });
          createData.variantPrimary = !(fam.items && fam.items.length);
        } catch (_) {
          createData.variantPrimary = true;
        }
        if (createData.variantPrimary && createData.variantCount === undefined) createData.variantCount = 1;
      }
      record = await getPb().collection(collection).create(createData, _pbRequestOptions(options));
    }
  } catch (e) {
    // Log full error details for debugging
    console.error('[pbSetDoc] Save failed:', {
      collection,
      id,
      isUpdate: !!existing,
      status: e.status,
      message: e.message,
      data: e.data,
      responseData: e.response?.data,
      sentFields: Object.keys(clean).join(', '),
      sentSizes: Object.entries(clean).map(([k,v]) => `${k}:${typeof v === 'string' ? v.length : typeof v === 'object' ? JSON.stringify(v).length : String(v).length}`).join(' | '),
    });
    throw e;
  }
  _syncToTypesense(collection, record);
  return record;
}

function _isUniqueViolation(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  if (status !== 400) return false;
  const data = error?.data || error?.response?.data || {};
  const flat = JSON.stringify(data || {}).toLowerCase();
  return /validation_not_unique|must be unique|already exists|not_unique/.test(flat);
}

// ── PB write resilience (single RAM-bound host) ─────────────────
// On the shared single-host PocketBase the bulk scraper + translator
// can saturate the box. Under that pressure three failure classes show up:
//   • 500 "Something went wrong while processing your request" (overloaded)
//   • 408 / 502 / 503 / 504 / network resets (timeouts)
//   • 403 "Only superusers can perform this action" / 401 — the auth
//     middleware momentarily fails to validate the token under load (or the
//     superuser token actually expired during a multi-hour run), so the write
//     is processed as a guest and the collection rule rejects it.
// All three are *recoverable*: transient ones via backoff, auth ones via a
// single token refresh + immediate retry. Without this every saturated write
// was counted as a permanent "fail" and thousands of products silently lost
// their translation patch.

function _pbErrorFlat(e) {
  try {
    return JSON.stringify({
      m: e?.message || '',
      d: e?.data || e?.response?.data || {},
    }).toLowerCase();
  } catch (_) {
    return String(e?.message || e || '').toLowerCase();
  }
}

function _pbStatus(e) {
  return Number(e?.status || e?.response?.status || 0);
}

// Transient = worth a backoff retry (server overloaded / timed out / network).
function _isTransientPbError(e) {
  const status = _pbStatus(e);
  if (status === 0) return true; // network error / reset / abort with no status
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    if (status === 500) {
      // Only "something went wrong" style 500s are transient; a 500 that carries
      // a real validation payload should surface immediately.
      const flat = _pbErrorFlat(e);
      return /something went wrong|processing your request|failed to/.test(flat) || !/validation/.test(flat);
    }
    return true;
  }
  return false;
}

// Auth degradation = a single re-auth + retry should fix it.
function _isAuthError(e) {
  const status = _pbStatus(e);
  if (status === 401) return true;
  if (status === 403) {
    const flat = _pbErrorFlat(e);
    return /superuser|only superusers|not authorized|unauthorized|forbidden|missing or invalid|auth/.test(flat);
  }
  return false;
}

// De-duped admin token refresh. Many concurrent writes can fail at once; we
// only want ONE refresh in flight so we don't stampede the bridge endpoint.
let _adminAuthRefreshInFlight = null;
async function _refreshAdminAuth() {
  if (_adminAuthRefreshInFlight) return _adminAuthRefreshInFlight;
  _adminAuthRefreshInFlight = (async () => {
    const pb = getPb();
    const hadToken = !!pb.authStore?.token;
    // 1) Standard PocketBase token refresh on the stored auth collection
    //    (the GitHub→superuser bridge mints a real _superusers auth token, so
    //    authRefresh re-issues a fresh one while the current one is still valid).
    const coll = pb.authStore?.record?.collectionName || '_superusers';
    try {
      await pb.collection(coll).authRefresh({ $autoCancel: false });
      if (pb.authStore.isValid) return true;
    } catch (_) { /* fall through to the bridge re-exchange */ }
    // 2) Fall back to re-running the GitHub→superuser exchange. Only meaningful
    //    while a token still exists for the Authorization header.
    try {
      if (hadToken && pb.authStore?.token) {
        await exchangeGitHubAdminSession();
        if (pb.authStore.isValid) return true;
      }
    } catch (_) { /* unrecoverable without an interactive re-login */ }
    return false;
  })().finally(() => { _adminAuthRefreshInFlight = null; });
  return _adminAuthRefreshInFlight;
}

// Wraps a single PB write so transient overload retries with jittered backoff
// and an auth lapse triggers exactly one token refresh before retrying.
async function _withPbWriteRetry(label, fn, attempts = 6) {
  let delay = 700;
  let triedReauth = false;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const authErr = _isAuthError(e);
      if (authErr && !triedReauth) {
        triedReauth = true;
        const ok = await _refreshAdminAuth();
        if (ok) continue; // fresh token → retry immediately, no backoff
      }
      const transient = authErr || _isTransientPbError(e);
      if (!transient || attempt >= attempts) throw e;
      const jitter = Math.floor(Math.random() * 300);
      if (typeof console !== 'undefined') {
        console.warn(`[pb-write] ${label} attempt ${attempt} failed (${_pbStatus(e)} ${e?.message || e}); retrying in ${delay + jitter}ms`);
      }
      await new Promise(r => setTimeout(r, delay + jitter));
      delay = Math.min(delay * 2, 8000);
    }
  }
}

// ── Fast create path for the bulk scraper ────────────────────────
// The scraper's skip-existing preload (when it completes) already holds EVERY
// existing record for the category, so the per-save `_findRecord` round-trip is
// pure waste here. Each `pbSetDoc` does 2-3 PB requests (find + variant-primary
// lookup + write); on the RAM-constrained single host that request
// amplification at 8-way concurrency is what floods PocketBase and triggers the
// 500 "Something went wrong" storm that collapses save throughput to ~200/hour.
//
// `pbCreateProductFast` issues a single create. variantPrimary is pre-computed
// by the caller (the scraper claims the first product of each new variantGroup
// synchronously), so no lookup is needed. Belt-and-suspenders: if the create
// still collides with an existing row (a unique-constraint violation — e.g. the
// preload somehow missed it), we reconcile via find+update so NO duplicate is
// ever created. Net effect: 1 light write per save instead of 2-3 → saves
// outrun the scraper and the 500 storm disappears, with zero duplicate risk.
async function pbCreateProductFast(id, data, options = {}) {
  await pbEnsureAuth();
  const clean = _clean(data);
  const createData = _prepareCreateData('products', id, clean);
  try {
    // Unique-violation is NOT transient → it throws straight out of the retry
    // wrapper into the reconcile path below; only overload/auth lapses retry.
    const record = await _withPbWriteRetry(`create products/${id}`, () =>
      getPb().collection('products').create(createData, _pbRequestOptions(options))
    );
    _syncToTypesense('products', record);
    return record;
  } catch (e) {
    if (_isUniqueViolation(e)) {
      // A record slipped past the preload — reconcile via update, never duplicate.
      try {
        const existing = await _findRecord('products', id, clean, options);
        if (existing) {
          const record = await _withPbWriteRetry(`reconcile products/${existing.id}`, () =>
            getPb().collection('products').update(existing.id, clean, _pbRequestOptions(options))
          );
          _syncToTypesense('products', record);
          return record;
        }
      } catch (reconcileErr) {
        console.warn('[pbCreateProductFast] unique-violation reconcile failed:', reconcileErr.message);
      }
    }
    throw e;
  }
}

// Update existing doc
async function pbUpdateDoc(collection, id, data) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  const clean = _clean(data);
  const record = await _withPbWriteRetry(`update ${collection}/${id}`, () =>
    getPb().collection(collection).update(id, clean, { $autoCancel: false })
  );
  _syncToTypesense(collection, record);
  return record;
}

// Create new doc (auto-ID)
async function pbAddDoc(collection, data) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  const record = await getPb().collection(collection).create(_clean(data), { $autoCancel: false });
  _syncToTypesense(collection, record);
  return record;
}

// Delete doc
async function pbDeleteDoc(collection, id) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  const result = await getPb().collection(collection).delete(id, { $autoCancel: false });
  _syncDeleteFromTypesense(collection, id);
  return result;
}

// ── Typesense mirror ─────────────────────────────────────────
// Every successful mutation on `products` is mirrored to the
// Typesense `products` collection so that search/list endpoints
// reflect the new value immediately. Failures are non-fatal and
// surface only as console warnings.
function _syncToTypesense(collection, record) {
  if (collection !== 'products' || !record || !record.id) return;
  if (typeof window === 'undefined' || !window.TsClient) return;
  try {
    // fire-and-forget — don't block the PB call site
    window.TsClient.upsertDoc(record).catch(() => {});
  } catch (e) {
    console.warn('[pb→ts] sync failed', e.message);
  }
}

function _syncDeleteFromTypesense(collection, id) {
  if (collection !== 'products' || !id) return;
  if (typeof window === 'undefined' || !window.TsClient) return;
  try {
    window.TsClient.request('DELETE', `/collections/${window.TsClient.COLLECTION}/documents/${encodeURIComponent(id)}`).catch(() => {});
  } catch (e) {
    console.warn('[pb→ts] delete sync failed', e.message);
  }
}

// Get all docs matching filter
async function pbGetAll(collection, options = {}) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  try {
    const listOpts = {
      sort: options.sort || 'id',
      filter: options.filter || '',
      $autoCancel: false,
    };
    // `fields` projection keeps huge collections from timing out — only the
    // requested columns are transferred. `batch` tunes the per-request page.
    if (options.fields) listOpts.fields = options.fields;
    if (options.batch) listOpts.batch = options.batch;
    if (options.skipTotal !== undefined) listOpts.skipTotal = !!options.skipTotal;
    const items = await getPb().collection(collection).getFullList(listOpts);
    return items.map(item => ({ id: item.id, exists: true, data: () => _strip(item) }));
  } catch (e) {
    if (e && (e.status === 404 || /missing collection/i.test(e.message || ''))) return [];
    throw e;
  }
}

// Paginated list
async function pbGetList(collection, page, perPage, options = {}) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  try {
    const listOpts = {
      sort: options.sort || 'id',
      filter: options.filter || '',
      fields: options.fields || undefined,
      $autoCancel: false
    };
    if (options.skipTotal !== undefined) listOpts.skipTotal = !!options.skipTotal;
    const result = await getPb().collection(collection).getList(page, perPage, listOpts);
    return {
      items: result.items,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      page: result.page,
      size: result.items.length,
      empty: result.items.length === 0,
      docs: result.items.map(item => ({ id: item.id, exists: true, data: () => _strip(item) }))
    };
  } catch (e) {
    const shouldRetryWithoutSort =
      !!options.sort &&
      e &&
      e.status === 400 &&
      /something went wrong while processing your request/i.test(e.message || '');
    if (shouldRetryWithoutSort) {
      const retryOptions = {
        filter: options.filter || '',
        fields: options.fields || undefined,
        $autoCancel: false
      };
      if (options.skipTotal !== undefined) retryOptions.skipTotal = !!options.skipTotal;
      const result = await getPb().collection(collection).getList(page, perPage, retryOptions);
      return {
        items: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        page: result.page,
        size: result.items.length,
        empty: result.items.length === 0,
        docs: result.items.map(item => ({ id: item.id, exists: true, data: () => _strip(item) }))
      };
    }
    if (e && (e.status === 404 || /missing collection/i.test(e.message || ''))) {
      return { items: [], totalItems: 0, totalPages: 0, page: 1, size: 0, empty: true, docs: [] };
    }
    throw e;
  }
}

// Get total count for a collection + filter (efficient — only fetches 1 record)
async function pbCountWhere(collection, filter) {
  collection = _resolveCollection(collection);
  await pbEnsureAuth();
  try {
    const result = await getPb().collection(collection).getList(1, 1, {
      filter: filter || '',
      $autoCancel: false
    });
    return result.totalItems;
  } catch (e) {
    if (e && (e.status === 404 || /missing collection/i.test(e.message || ''))) return 0;
    throw e;
  }
}

// Server timestamp replacement
function serverTimestamp() {
  return new Date().toISOString();
}

// ─── INTERNAL HELPERS ───────────────────────────────────────────

function _strip(item) {
  const { id, collectionId, collectionName, expand, ...rest } = item;
  return rest;
}

function _clean(data) {
  const clean = { ...data };
  for (const key of ['id', 'collectionId', 'collectionName', 'expand']) {
    delete clean[key];
  }
  // Remove undefined/null values (PocketBase rejects null on most field types)
  for (const [k, v] of Object.entries(clean)) {
    if (v === undefined || v === null) delete clean[k];
    // Remove empty strings from URL fields (PocketBase rejects empty URL)
    if (v === '' && (k === 'imageUrl' || k === 'sourceUrl' || k === 'imageURL' || k === 'websiteUrl' || k === 'website' || k === 'logo' || k === 'affiliateUrl')) {
      delete clean[k];
    }
    // Convert FieldValue sentinels
    if (v && v._methodName === 'serverTimestamp') clean[k] = new Date().toISOString();
  }
  return clean;
}

// ─── ADMIN AUTH (GitHub OAuth -> Superuser bridge) ────────────────

const ADMIN_AUTH_COLLECTION = 'admins';
const ADMIN_GITHUB_EXCHANGE_PATH = '/api/admin/auth/github/exchange';

function setLoginLoading(visible) {
  const el = document.getElementById('loginLoading');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

function setLoginError(message = '') {
  const el = document.getElementById('loginError');
  if (el) el.textContent = message;
}

function setLoginButtonState(disabled) {
  const el = document.getElementById('loginBtn');
  if (!el) return;
  el.disabled = !!disabled;
  el.setAttribute('aria-busy', disabled ? 'true' : 'false');
}

async function exchangeGitHubAdminSession() {
  const pb = getPb();
  const response = await fetch(`${PB_URL}${ADMIN_GITHUB_EXCHANGE_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: '{}',
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      'GitHub admin oturumu dogrulanamadi.';
    throw new Error(message);
  }

  if (!payload?.token || !payload?.record) {
    throw new Error('Sunucudan gecersiz admin oturumu dondu.');
  }

  pb.authStore.save(payload.token, payload.record);
  return payload;
}

async function finalizeGitHubLogin(authData) {
  if (!authData?.record) {
    throw new Error('GitHub oturumu alinamadi.');
  }

  const payload = await exchangeGitHubAdminSession();
  const user = {
    email: _normalizeEmail(payload.adminEmail || payload.record.email),
    name: payload.adminName || authData.record.name || 'admin',
    uid: payload.record.id,
  };
  if (window._adminLoginCallback) window._adminLoginCallback(user, null);
}

function handleGitHubLogin() {
  setLoginError('');
  setLoginLoading(true);
  setLoginButtonState(true);

  const pb = getPb();
  try { pb.authStore.clear(); } catch (_) {}

  pb.collection(ADMIN_AUTH_COLLECTION)
    .authWithOAuth2({ provider: 'github' })
    .then((authData) => finalizeGitHubLogin(authData))
    .catch((error) => {
      try { pb.authStore.clear(); } catch (_) {}
      setLoginLoading(false);
      setLoginButtonState(false);
      const message = error?.message || 'GitHub girisi basarisiz oldu.';
      setLoginError(message);
    });
}

function logoutAdmin() {
  try { getPb().authStore.clear(); } catch (_) {}
}
