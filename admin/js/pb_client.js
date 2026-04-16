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
    if (!_gisInitialized) _initGIS();
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

function _initGIS() {
  google.accounts.id.initialize({
    client_id: GOOGLE_WEB_CLIENT_ID,
    callback: handleGoogleCredential,
    cancel_on_tap_outside: true,
    auto_select: false,
    use_fedcm_for_prompt: true,
  });

  // Render official Google button — uses FedCM in Chrome 115+, no JS Origin needed
  const slot = document.getElementById('googleSignInButton');
  if (slot) {
    google.accounts.id.renderButton(slot, {
      type: 'standard',
      shape: 'pill',
      theme: 'outline',
      text: 'continue_with',
      size: 'large',
      logo_alignment: 'left',
      width: 280,
      locale: 'tr',
    });
  }

  // Also init token client as fallback
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

// Called via onload on the GIS script tag
function gisOnLoad() {
  _initGIS();
  setLoginButtonDisabled(false);
}

function initGIS(callback) {
  _adminAuthCallback = callback;
  // If GIS library already loaded, initialize now
  if (window.google?.accounts?.oauth2 && !_gisInitialized) {
    _initGIS();
  }
  setLoginButtonDisabled(!_gisInitialized);
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

function gisSignIn() {
  setLoginError('');
  if (!_tokenClient) {
    // GIS not ready yet — show message and retry once it loads
    setLoginError('Google henuz yuklenmedi, lutfen saniye bekleyip tekrar dene.');
    return;
  }
  setLoginButtonDisabled(true);
  setLoginLoading(true);
  // Call requestAccessToken DIRECTLY (no await) to preserve user gesture
  _tokenClient.requestAccessToken({ prompt: 'select_account' });
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

async function loginWithPbEmail(event) {
  if (event) event.preventDefault();
  const email = document.getElementById('pbEmail')?.value?.trim();
  const password = document.getElementById('pbPassword')?.value;
  if (!email || !password) {
    setLoginError('E-posta ve sifre gerekli.');
    return;
  }
  setLoginError('');
  setLoginLoading(true);
  const btn = document.getElementById('pbLoginBtn');
  if (btn) btn.disabled = true;
  try {
    const authData = await getPb().collection('_superusers').authWithPassword(email, password);
    const user = {
      email: authData.record.email,
      name: authData.record.email.split('@')[0],
      picture: '',
      uid: authData.record.id,
    };
    if (_adminAuthCallback) _adminAuthCallback(user, null);
  } catch (error) {
    try { getPb().authStore.clear(); } catch (_) {}
    setLoginLoading(false);
    if (btn) btn.disabled = false;
    const msg = error?.message || 'Giris basarisiz. E-posta veya sifre hatali.';
    setLoginError(msg);
    if (_adminAuthCallback) _adminAuthCallback(null, msg);
  }
}
