// ═══════════════════════════════════════════════════════════════
//  COMPAIR ADMIN — PocketBase Client
//  Static admin client backed by PocketBase
// ═══════════════════════════════════════════════════════════════

const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const CONFIG_COLLECTIONS = new Set(['app_config', 'public_config']);

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

async function _findRecord(collection, identifier, data = {}) {
  const id = String(identifier || '').trim();
  const filters = [];

  if (_isPocketBaseRecordId(id)) {
    try {
      return await getPb().collection(collection).getOne(id, { $autoCancel: false });
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

  if (!filters.length) return null;

  const result = await getPb().collection(collection).getList(1, 1, {
    filter: filters.join(' || '),
    $autoCancel: false
  });
  return result.items[0] || null;
}

function _prepareCreateData(collection, identifier, data) {
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
  await pbEnsureAuth();
  try {
    const item = await _findRecord(collection, id);
    if (item) return { exists: true, id: item.id, data: () => _strip(item) };
    return { exists: false, id, data: () => null };
  } catch (e) {
    throw e;
  }
}

// Upsert doc by ID (set with merge)
async function pbSetDoc(collection, id, data) {
  await pbEnsureAuth();
  const clean = _clean(data);
  const existing = await _findRecord(collection, id, clean);
  let record;
  if (existing) {
    record = await getPb().collection(collection).update(existing.id, clean, { $autoCancel: false });
  } else {
    record = await getPb().collection(collection).create(_prepareCreateData(collection, id, clean), { $autoCancel: false });
  }
  _syncToTypesense(collection, record);
  return record;
}

// Update existing doc
async function pbUpdateDoc(collection, id, data) {
  await pbEnsureAuth();
  const record = await getPb().collection(collection).update(id, _clean(data), { $autoCancel: false });
  _syncToTypesense(collection, record);
  return record;
}

// Create new doc (auto-ID)
async function pbAddDoc(collection, data) {
  await pbEnsureAuth();
  const record = await getPb().collection(collection).create(_clean(data), { $autoCancel: false });
  _syncToTypesense(collection, record);
  return record;
}

// Delete doc
async function pbDeleteDoc(collection, id) {
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
  await pbEnsureAuth();
  const items = await getPb().collection(collection).getFullList({
    sort: options.sort || 'id',
    filter: options.filter || '',
    $autoCancel: false
  });
  return items.map(item => ({ id: item.id, exists: true, data: () => _strip(item) }));
}

// Paginated list
async function pbGetList(collection, page, perPage, options = {}) {
  await pbEnsureAuth();
  const result = await getPb().collection(collection).getList(page, perPage, {
    sort: options.sort || 'id',
    filter: options.filter || '',
    $autoCancel: false
  });
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

// Get total count for a collection + filter (efficient — only fetches 1 record)
async function pbCountWhere(collection, filter) {
  await pbEnsureAuth();
  const result = await getPb().collection(collection).getList(1, 1, {
    filter: filter || '',
    $autoCancel: false
  });
  return result.totalItems;
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
  // Remove undefined values
  for (const [k, v] of Object.entries(clean)) {
    if (v === undefined) delete clean[k];
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

