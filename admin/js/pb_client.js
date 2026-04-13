// ═══════════════════════════════════════════════════════════════
//  COMPAIR ADMIN — PocketBase Client
//  Replaces Firebase Firestore + Auth
// ═══════════════════════════════════════════════════════════════

const PB_URL = 'http://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const GOOGLE_CLIENT_ID = '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com';
const PB_ADMIN_EMAIL = 'admin@compair.local';
const PB_ADMIN_PASS = 'mx6I0zPE3HSaqbjlAY0p';

let _pb = null;
let _pbAuthed = false;

function getPb() {
  if (!_pb) _pb = new PocketBase(PB_URL);
  return _pb;
}

async function pbEnsureAuth() {
  if (_pbAuthed) return;
  await getPb().collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASS);
  _pbAuthed = true;
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

// ─── GOOGLE IDENTITY SERVICES (GIS) ────────────────────────────

let _gisTokenClient = null;
let _gisCallback = null;

// Call once at init with callback(userInfo: {email, name, picture})
function initGIS(callback) {
  _gisCallback = callback;
  if (typeof google !== 'undefined' && google.accounts) {
    _setupGIS();
  } else {
    // GIS script not yet loaded — set up onload handler
    window._onGISLoad = _setupGIS;
  }
}

function _setupGIS() {
  _gisTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'openid email profile',
    callback: async (response) => {
      if (response.error) {
        if (_gisCallback) _gisCallback(null, response.error);
        return;
      }
      try {
        // Fetch user info from Google
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${response.access_token}` }
        });
        const info = await res.json();
        if (_gisCallback) _gisCallback(info, null);
      } catch (e) {
        if (_gisCallback) _gisCallback(null, e.message);
      }
    }
  });
}

function gisSignIn() {
  if (!_gisTokenClient) {
    _setupGIS();
    setTimeout(() => {
      if (_gisTokenClient) _gisTokenClient.requestAccessToken({ prompt: 'select_account' });
    }, 200);
    return;
  }
  _gisTokenClient.requestAccessToken({ prompt: 'select_account' });
}

function gisRevoke(email) {
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.oauth2.revoke(email, () => {});
  }
}
