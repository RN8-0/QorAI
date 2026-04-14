// ═══════════════════════════════════════════════════════════════
//  COMPAIR WEBSITE — PocketBase Client
//  Public website data/auth client backed by PocketBase
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

// ─── PB AUTH (Google popup removed) ──────────────────────────────
// The public website now uses plain email/password via PocketBase.
// Google sign-in is disabled until PB native OAuth2 is wired up on
// an HTTPS PB server. Keep the function name so callers don't break.

async function pbSignInWithGoogle() {
  throw new Error('Google sign-in is temporarily unavailable. Please use email and password.');
}

async function pbSignInWithEmail(email, password) {
  return await getPb().collection('users').authWithPassword(email, password);
}

async function pbSignUpWithEmail(email, password, name) {
  await getPb().collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: name || email.split('@')[0],
    emailVisibility: true,
  });
  return await getPb().collection('users').authWithPassword(email, password);
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
