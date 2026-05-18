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

export async function register(email, password, name = '') {
  await pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: name || email.split('@')[0],
    emailVisibility: true,
  });
  return pb.collection('users').authWithPassword(email, password);
}

export function signOut() {
  pb.authStore.clear();
}

// Friendly, localized auth error messages.
export function authErrorMessage(error) {
  const msg = (error?.message || error?.data?.message || '').toLowerCase();
  if (msg.includes('invalid credentials') || msg.includes('failed to authenticate'))
    return 'E-posta veya şifre hatalı.';
  if (msg.includes('already exists') || msg.includes('unique') || msg.includes('validation_not_unique'))
    return 'Bu e-posta ile zaten bir hesap var.';
  if (msg.includes('password')) return 'Şifre en az 8 karakter olmalı.';
  if (msg.includes('email')) return 'Geçerli bir e-posta adresi gir.';
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'Bağlantı hatası. İnternetini kontrol et.';
  return 'Bir hata oluştu. Lütfen tekrar dene.';
}

export function fileUrl(record, filename) {
  if (!record || !filename) return '';
  return pb.files.getUrl(record, filename);
}
