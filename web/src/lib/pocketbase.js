// ═══════════════════════════════════════════════════════════════
//  PocketBase — auth, reviews, Qor Coin balance
//  Same backend the Flutter app uses. The website shares the
//  `users` collection, so accounts and coin balance stay in sync.
// ═══════════════════════════════════════════════════════════════

import PocketBase from 'pocketbase';

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
  const body = {
    email,
    password,
    passwordConfirm: password,
    name: name || email.split('@')[0],
    bonusQCoins: 20,
    dailyAiCreditsUsed: 0,
  };
  if (birthDate) body.birthDate = birthDate;
  if (gender) body.gender = gender;
  await pb.collection('users').create(body);
  const auth = await pb.collection('users').authWithPassword(email, password);
  // The 20-coin signup bonus must land on EVERY account. Some records came back
  // with 0 (the create-time value didn't stick), so once we're authenticated as
  // the owner, top the balance up to 20 if it isn't already positive. This makes
  // the welcome bonus reliable regardless of the create path.
  if (!(Number(auth?.record?.bonusQCoins) > 0)) {
    try {
      const topped = await pb.collection('users').update(auth.record.id, { bonusQCoins: 20 });
      pb.authStore.save(pb.authStore.token, topped);
    } catch { /* don't block sign-in on a bonus top-up */ }
  }
  // Fire off the verification email — never block sign-in if it fails.
  try { await pb.collection('users').requestVerification(email); } catch { /* noop */ }
  return auth;
}

// Google sign-in via PocketBase's OAuth2 (provider must be enabled in the
// PocketBase admin → users collection → OAuth2 settings).
export async function signInWithGoogle() {
  const auth = await pb.collection('users').authWithOAuth2({ provider: 'google' });
  // OAuth signups never go through register(), and the server-side welcome_bonus
  // hook isn't live, so the 20-coin bonus has to be granted here too — otherwise
  // every Google signup lands on 0 coins. Gate it on a genuinely fresh account
  // (meta.isNew, or a record created seconds ago) so a user who has spent their
  // balance down to 0 doesn't get re-granted every time they sign back in.
  try {
    const rec = auth?.record;
    const createdMs = rec?.created ? Date.parse(rec.created) : NaN;
    const isFresh = auth?.meta?.isNew === true
      || (Number.isFinite(createdMs) && Date.now() - createdMs < 120000);
    if (rec && isFresh && !(Number(rec.bonusQCoins) > 0)) {
      const topped = await pb.collection('users').update(rec.id, {
        bonusQCoins: 20,
        dailyAiCreditsUsed: 0,
      });
      pb.authStore.save(pb.authStore.token, topped);
    }
  } catch { /* never block sign-in on a bonus top-up */ }
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

export function fileUrl(record, filename) {
  if (!record || !filename) return '';
  return pb.files.getUrl(record, filename);
}
