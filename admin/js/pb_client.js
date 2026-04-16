// ═══════════════════════════════════════════════════════════════
//  COMPAIR ADMIN — PocketBase Client
//  Static admin client backed by PocketBase
// ═══════════════════════════════════════════════════════════════

const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const GOOGLE_WEB_CLIENT_ID = '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com';
const ALLOWED_ADMIN_EMAILS = Object.freeze([
  'arainunger@gmail.com',
  'araingamex@gmail.com',
]);

let _pb = null;
let _adminAuthCallback = null;
let _gisInitialized = false;
let _tokenClient = null;

function getPb() {
  if (!_pb) _pb = new PocketBase(PB_URL);
  return _pb;
}

function normalizeAdminEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAllowedAdminEmail(email) {
  return ALLOWED_ADMIN_EMAILS.includes(normalizeAdminEmail(email));
}

async function pbEnsureAuth() {
  const pb = getPb();
  const record = pb.authStore.record;
  if (pb.authStore.isValid && record?.collectionName === '_superusers') return;
  throw new Error('Admin authentication required');
}

// ─── FIRESTORE-COMPATIBLE HELPERS ───────────────────────────────

// Read single doc by ID
async function pbGetDoc(collection, id) {
  await pbEnsureAuth();
  try {
    const item = await getPb().collection(collection).getOne(id, { $autoCancel: false });
    return { exists: true, id: item.id, data: () => _strip(item) };
  } catch (e) {
    if (e.status === 404) {
      // Try filter by 'key' field fallback
      try {
        const result = await getPb().collection(collection).getList(1, 1, {
          filter: `key="${id}"`, $autoCancel: false
        });
        if (result.items.length > 0) {
          const doc = result.items[0];
          return { exists: true, id: doc.id, data: () => _strip(doc) };
        }
      } catch {}
      return { exists: false, id, data: () => null };
    }
    throw e;
  }
}

// Upsert doc by ID (set with merge)
async function pbSetDoc(collection, id, data) {
  await pbEnsureAuth();
  const clean = _clean(data);
  try {
    return await getPb().collection(collection).update(id, clean, { $autoCancel: false });
  } catch (e) {
    if (e.status === 404) {
      return await getPb().collection(collection).create({ id, ...clean }, { $autoCancel: false });
    }
    throw e;
  }
}

// Update existing doc
async function pbUpdateDoc(collection, id, data) {
  await pbEnsureAuth();
  return await getPb().collection(collection).update(id, _clean(data), { $autoCancel: false });
}

// Create new doc (auto-ID)
async function pbAddDoc(collection, data) {
  await pbEnsureAuth();
  return await getPb().collection(collection).create(_clean(data), { $autoCancel: false });
}

// Delete doc
async function pbDeleteDoc(collection, id) {
  await pbEnsureAuth();
  return await getPb().collection(collection).delete(id, { $autoCancel: false });
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

// ─── GOOGLE ADMIN AUTH ────────────────────────────────────────────

function setLoginLoading(visible) {
  const el = document.getElementById('loginLoading');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

function setLoginError(message = '') {
  const el = document.getElementById('loginError');
  if (el) el.textContent = message;
}

function setLoginButtonDisabled(disabled) {
  const button = document.getElementById('loginGoogleBtn');
  if (!button) return;
  button.disabled = !!disabled;
}

function ensureGoogleClients(retryCount = 0) {
  if (window.google?.accounts?.id && window.google?.accounts?.oauth2) {
    if (!_gisInitialized) {
      google.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        callback: handleGoogleCredential,
        cancel_on_tap_outside: true,
        auto_select: false,
      });
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_WEB_CLIENT_ID,
        scope: 'openid email profile',
        callback: handleGoogleAccessToken,
        error_callback: (error) => {
          setLoginLoading(false);
          setLoginButtonDisabled(false);
          const message = error?.message || error?.type || 'Google girisi baslatilamadi.';
          setLoginError(message);
        },
      });
      _gisInitialized = true;
    }
    return Promise.resolve();
  }

  if (retryCount >= 30) {
    setLoginButtonDisabled(false);
    setLoginError('Google girisi yuklenemedi. Sayfayi yenileyip tekrar dene.');
    return Promise.reject(new Error('google_unavailable'));
  }

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      ensureGoogleClients(retryCount + 1).then(resolve).catch(reject);
    }, 250);
  });
}

function initGIS(callback) {
  _adminAuthCallback = callback;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setLoginButtonDisabled(false);
      ensureGoogleClients().catch(() => {});
    }, { once: true });
    return;
  }
  ensureGoogleClients().catch(() => {});
}

async function completeGoogleAdminLogin({ idToken = '', accessToken = '' } = {}) {
  const res = await fetch(`${PB_URL}/api/admin/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      accessToken,
      audience: GOOGLE_WEB_CLIENT_ID,
    }),
  });

  let payload = {};
  try { payload = await res.json(); } catch (_) {}

  if (!res.ok) {
    if (payload?.error === 'admin_not_allowed') {
      throw new Error('Bu Google hesabi admin paneline yetkili degil.');
    }
    if (payload?.error === 'invalid_token') {
      throw new Error('Google kimlik dogrulamasi basarisiz oldu.');
    }
    if (payload?.error === 'missing_superuser_env' || payload?.error === 'superuser_not_found') {
      throw new Error('PocketBase admin oturumu sunucuda hazir degil.');
    }
    throw new Error(payload?.error || 'Admin girisi basarisiz oldu.');
  }

  if (!isAllowedAdminEmail(payload.adminEmail)) {
    throw new Error('Bu Google hesabi admin paneline yetkili degil.');
  }

  const authRecord = {
    id: payload.record?.id,
    email: payload.record?.email,
    collectionName: '_superusers',
  };
  getPb().authStore.save(payload.token, authRecord);
  return payload;
}

async function handleGoogleAccessToken(response) {
  setLoginError('');
  setLoginLoading(true);
  try {
    if (!response?.access_token) {
      throw new Error('Google erisim anahtari alinamadi.');
    }
    const payload = await completeGoogleAdminLogin({
      accessToken: response.access_token,
    });
    const user = {
      email: normalizeAdminEmail(payload.adminEmail),
      name: payload.adminName || normalizeAdminEmail(payload.adminEmail).split('@')[0],
      picture: payload.picture || '',
      uid: payload.record?.id || '',
    };
    if (_adminAuthCallback) _adminAuthCallback(user, null);
  } catch (error) {
    try { getPb().authStore.clear(); } catch (_) {}
    setLoginLoading(false);
    setLoginButtonDisabled(false);
    const message = error?.message || 'Admin girisi basarisiz oldu.';
    setLoginError(message);
    if (_adminAuthCallback) _adminAuthCallback(null, message);
  }
}

async function handleGoogleCredential(response) {
  setLoginError('');
  setLoginLoading(true);
  try {
    if (!response?.credential) {
      throw new Error('Google kimlik bilgisi alinamadi.');
    }
    const payload = await completeGoogleAdminLogin({
      idToken: response.credential,
    });
    const user = {
      email: normalizeAdminEmail(payload.adminEmail),
      name: payload.adminName || normalizeAdminEmail(payload.adminEmail).split('@')[0],
      picture: payload.picture || '',
      uid: payload.record?.id || '',
    };
    if (_adminAuthCallback) _adminAuthCallback(user, null);
  } catch (error) {
    try { getPb().authStore.clear(); } catch (_) {}
    setLoginLoading(false);
    setLoginButtonDisabled(false);
    const message = error?.message || 'Admin girisi basarisiz oldu.';
    setLoginError(message);
    if (_adminAuthCallback) _adminAuthCallback(null, message);
  }
}

async function gisSignIn() {
  setLoginError('');
  setLoginButtonDisabled(true);
  setLoginLoading(true);
  try {
    await ensureGoogleClients();
    if (_tokenClient) {
      _tokenClient.requestAccessToken({ prompt: 'consent' });
      return;
    }
    window.google?.accounts?.id?.prompt();
  } catch (_) {
    setLoginLoading(false);
    setLoginButtonDisabled(false);
  }
}

function gisRevoke(_email) {
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch (_) {}
  try { getPb().authStore.clear(); } catch (_) {}
}

function loginWithGoogle() {
  return gisSignIn();
}

function loginWithPb() {
  return gisSignIn();
}
