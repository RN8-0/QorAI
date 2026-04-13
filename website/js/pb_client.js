// ═══════════════════════════════════════════════════════════════
//  COMPAIR WEBSITE — PocketBase Client
//  Replaces Firebase Firestore + Auth for public website
// ═══════════════════════════════════════════════════════════════

const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

let _pb = null;

function getPb() {
  if (!_pb) _pb = new PocketBase(PB_URL);
  return _pb;
}

// Check if user is authenticated
function pbCurrentUser() {
  return getPb().authStore.isValid ? getPb().authStore.model : null;
}

// Load products (public read)
async function pbLoadProducts(limit = 500) {
  const result = await getPb().collection('products').getList(1, limit, {
    sort: '-techScore',
    $autoCancel: false
  });
  return result.items;
}

// Search products
async function pbSearchProducts(query, limit = 100) {
  const esc = query.replace(/"/g, '\\"');
  const slug = query.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const filter = `name~"${esc}" || brand~"${esc}" || category~"${esc}" || id~"${slug}"`;
  const result = await getPb().collection('products').getList(1, limit, {
    filter,
    sort: '-techScore',
    $autoCancel: false
  });
  return result.items;
}

// Get products by category
async function pbGetByCategory(category, limit = 50) {
  const result = await getPb().collection('products').getList(1, limit, {
    filter: `category="${category}"`,
    sort: '-techScore',
    $autoCancel: false
  });
  return result.items;
}

// ─── AUTH ───────────────────────────────────────────────────────

// Sign in with email/password
async function pbSignIn(email, password) {
  return await getPb().collection('users').authWithPassword(email, password);
}

// Register with email/password
async function pbRegister(email, password, name = '') {
  const user = await getPb().collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: name || email.split('@')[0],
    emailVisibility: true
  });
  // Auto sign in after register
  await getPb().collection('users').authWithPassword(email, password);
  return user;
}

// ─── FIREBASE AUTH ───────────────────────────────────────────────

const _FB_CONFIG = {
  apiKey: 'AIzaSyA_YqZli9PSPeCzYl2x9FBv5SYK-m0kpEg',
  appId: '1:510980756238:web:b21d1e3613561d7c69fd5f',
  messagingSenderId: '510980756238',
  projectId: 'compair-99b6e',
  authDomain: 'compair-99b6e.firebaseapp.com',
  storageBucket: 'compair-99b6e.firebasestorage.app',
};

let _wFbApp = null;
let _wFbAuth = null;

function _getWebFirebaseAuth() {
  if (_wFbAuth) return _wFbAuth;
  if (typeof firebase === 'undefined') throw new Error('Firebase SDK not loaded');
  if (!_wFbApp) {
    // Avoid duplicate app error if already initialized
    try { _wFbApp = firebase.app(); } catch (_) { _wFbApp = firebase.initializeApp(_FB_CONFIG); }
  }
  _wFbAuth = firebase.auth();
  return _wFbAuth;
}

// Sign in with Google — Firebase popup → auto create/login PocketBase user
async function pbSignInWithGoogle() {
  const auth = _getWebFirebaseAuth();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  const result = await auth.signInWithPopup(provider);
  const fbUser = result.user;

  const email = fbUser.email;
  const password = fbUser.uid; // deterministic, consistent across sessions
  const name = fbUser.displayName || email.split('@')[0];

  try {
    return await getPb().collection('users').authWithPassword(email, password);
  } catch (e) {
    if (e.status === 400 || e.status === 404) {
      await getPb().collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name,
        emailVisibility: true
      });
      return await getPb().collection('users').authWithPassword(email, password);
    }
    throw e;
  }
}

// Sign out
function pbSignOut() {
  getPb().authStore.clear();
}

// Auth state listener
function pbOnAuthChange(callback) {
  callback(pbCurrentUser()); // call immediately with current state
  return getPb().authStore.onChange(() => {
    callback(pbCurrentUser());
  });
}
