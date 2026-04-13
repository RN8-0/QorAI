// ═══════════════════════════════════════════════════════════════
//  COMPAIR ADMIN — PocketBase Client
//  Replaces Firebase Firestore + Auth
// ═══════════════════════════════════════════════════════════════

const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
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

// ─── FIREBASE AUTH (replaces GIS) ───────────────────────────────

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA_YqZli9PSPeCzYl2x9FBv5SYK-m0kpEg',
  appId: '1:510980756238:web:b21d1e3613561d7c69fd5f',
  messagingSenderId: '510980756238',
  projectId: 'compair-99b6e',
  authDomain: 'compair-99b6e.firebaseapp.com',
  storageBucket: 'compair-99b6e.firebasestorage.app',
};

let _fbApp = null;
let _fbAuth = null;
let _adminAuthCallback = null;

function _getFirebaseAuth() {
  if (_fbAuth) return _fbAuth;
  if (typeof firebase === 'undefined') throw new Error('Firebase SDK not loaded');
  if (!_fbApp) _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  _fbAuth = firebase.auth();
  return _fbAuth;
}

// Backward-compatible initGIS — stores the callback
function initGIS(callback) {
  _adminAuthCallback = callback;
}

// Backward-compatible gisSignIn — opens Firebase popup
function gisSignIn() {
  const auth = _getFirebaseAuth();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  auth.signInWithPopup(provider).then(result => {
    const u = result.user;
    if (_adminAuthCallback) _adminAuthCallback({
      email: u.email,
      name: u.displayName,
      picture: u.photoURL,
      uid: u.uid
    }, null);
  }).catch(err => {
    const code = err.code || err.message || 'sign_in_failed';
    const mapped = code === 'auth/popup-closed-by-user' ? 'popup_closed_by_user'
                 : code === 'auth/user-cancelled'       ? 'access_denied'
                 : code;
    if (_adminAuthCallback) _adminAuthCallback(null, mapped);
  });
}

function gisRevoke(email) {
  try { _getFirebaseAuth().signOut(); } catch (_) {}
}
