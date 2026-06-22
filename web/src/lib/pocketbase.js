// ═══════════════════════════════════════════════════════════════
//  PocketBase — auth, reviews, Qor Coin balance
//  Same backend the Flutter app uses. The website shares the
//  `users` collection, so accounts and coin balance stay in sync.
// ═══════════════════════════════════════════════════════════════

import PocketBase from 'pocketbase';
import { detectCountry } from './geo';

export const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

export function currentUser() {
  return pb.authStore.isValid ? pb.authStore.model : null;
}

export function onAuthChange(cb) {
  cb(currentUser());
  return pb.authStore.onChange(() => cb(currentUser()));
}

export async function signIn(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

// Mirrors the mobile app's signUpWithEmail body exactly (auth_repo.dart):
// email, password, passwordConfirm, name + optional birthDate / gender.
export async function register({ email, password, name, birthDate, gender }) {
  // Detect the signup country up-front (Cloudflare /cdn-cgi/trace, then ipwho.is)
  // so the admin panel shows where the account was created — and tag the source
  // as the website. The signup bonus is intentionally NOT set here: the
  // server-side hook grants the admin-configured amount on create (single source
  // of truth) so it always matches the value set in the admin panel.
  let country = '';
  try { country = await detectCountry(); } catch { /* geo is best-effort */ }
  const body = {
    email,
    password,
    passwordConfirm: password,
    name: name || email.split('@')[0],
    dailyAiCreditsUsed: 0,
    platform: 'web',
  };
  if (country) body.country = country;
  if (birthDate) body.birthDate = birthDate;
  if (gender) body.gender = gender;
  await pb.collection('users').create(body);
  const auth = await pb.collection('users').authWithPassword(email, password);
  // Pull the canonical record so the server-granted welcome bonus is reflected.
  try {
    const fresh = await pb.collection('users').authRefresh();
    if (fresh?.record) pb.authStore.save(pb.authStore.token, fresh.record);
  } catch { /* keep the create-time record if refresh fails */ }
  // Fire off the verification email — never block sign-in if it fails.
  try { await pb.collection('users').requestVerification(email); } catch { /* noop */ }
  return auth;
}

// Google sign-in via PocketBase's OAuth2 (provider must be enabled in the
// PocketBase admin → users collection → OAuth2 settings).
export async function signInWithGoogle() {
  const auth = await pb.collection('users').authWithOAuth2({ provider: 'google' });
  // OAuth signups don't go through register(). The server-side hook grants the
  // admin-configured welcome bonus on create, so we don't touch the balance here.
  // We DO tag the source as the website and backfill the signup country (the
  // OAuth2 create can't carry these), so the admin panel knows where/how the
  // account was created.
  try {
    const rec = auth?.record;
    const createdMs = rec?.created ? Date.parse(rec.created) : NaN;
    const isFresh = auth?.meta?.isNew === true
      || (Number.isFinite(createdMs) && Date.now() - createdMs < 120000);
    if (rec) {
      const patch = {};
      if (!rec.platform) patch.platform = 'web';
      if (!rec.country) {
        try { const cc = await detectCountry(); if (cc) patch.country = cc; } catch { /* best-effort */ }
      }
      if (Object.keys(patch).length) {
        const updated = await pb.collection('users').update(rec.id, patch);
        pb.authStore.save(pb.authStore.token, updated);
      } else if (isFresh) {
        // Fresh account with everything already set — refresh to reflect the
        // server-granted bonus in the auth store.
        const fresh = await pb.collection('users').authRefresh();
        if (fresh?.record) pb.authStore.save(pb.authStore.token, fresh.record);
      }
    }
  } catch { /* never block sign-in on profile enrichment */ }
  return auth;
}

export function signOut() {
  pb.authStore.clear();
}

// Sends a password-reset email. The link inside points to the
// PocketBase-hosted reset page (see pb_hooks/password_reset_page.pb.js).
export async function requestPasswordReset(email) {
  return pb.collection('users').requestPasswordReset(email);
}

// Re-sends the address verification email for the given account.
export async function requestVerification(email) {
  return pb.collection('users').requestVerification(email);
}

// Pulls a fresh copy of the signed-in user (coin balance, verified flag,
// history arrays) and writes it back into the auth store.
export async function refreshUser() {
  if (!pb.authStore.isValid) return null;
  try {
    const res = await pb.collection('users').authRefresh();
    return res.record;
  } catch {
    return currentUser();
  }
}

// Updates the signed-in user's record and keeps the auth store in sync
// so the header / profile re-render immediately.
export async function updateProfile(data) {
  const user = currentUser();
  if (!user) throw new Error('auth required');
  const rec = await pb.collection('users').update(user.id, data);
  pb.authStore.save(pb.authStore.token, rec);
  return rec;
}

// Starts the email-confirmed account deletion flow. The backend
// (pb_hooks/delete_account.pb.js) emails a signed confirmation link;
// the account is only erased once the user clicks it.
export async function requestAccountDeletion() {
  return pb.send('/api/users/request-delete', { method: 'POST' });
}

// Returns an i18n string key for the given auth error. Inspects both the
// top-level message and PocketBase's per-field validation errors.
export function authErrorKey(error) {
  const fields = error?.data?.data || error?.response?.data || {};
  const fieldText = Object.entries(fields)
    .map(([k, v]) => `${k} ${(v && v.code) || ''} ${(v && v.message) || ''}`)
    .join(' ');
  const msg = `${error?.message || ''} ${error?.data?.message || ''} ${fieldText}`.toLowerCase();

  if (msg.includes('invalid credentials') || msg.includes('failed to authenticate'))
    return 'auth.errCreds';
  if (msg.includes('not unique') || msg.includes('already exists') || msg.includes('validation_not_unique'))
    return 'auth.errExists';
  if (msg.includes('email') && (msg.includes('invalid') || msg.includes('valid')))
    return 'auth.errEmail';
  if (msg.includes('password')) return 'auth.errPassword';
  if (msg.includes('validation_required') || msg.includes('cannot be blank'))
    return 'auth.errFields';
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('aborted'))
    return 'auth.errNetwork';
  return 'auth.errGeneric';
}

// Build the PocketBase file URL manually — pb.files.getUrl() returned '' on this
// SDK build, so construct the documented /api/files path directly.
export function fileUrl(record, filename) {
  if (!record || !filename) return '';
  const coll = record.collectionId || record.collectionName || 'articles';
  return `${PB_URL}/api/files/${coll}/${record.id}/${filename}`;
}
