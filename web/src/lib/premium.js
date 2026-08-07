// Derives premium / subscription status from the PocketBase user record.
// Mirrors the mobile app's logic (subscription_service.dart): a user is
// premium when `isPremium` is true OR `userSubscriptionDetails.premium`
// carries an active product. Purchases happen in the app (Play Store) —
// the website only reflects the status, it cannot sell premium.

const EXPIRY_KEYS = ['expiresAt', 'expirationDate', 'renewalDate', 'renewsAt'];

export function premiumStatus(user) {
  if (!user) return { isPremium: false, productId: null, expiresAt: null };

  const flag = user.isPremium === true;
  const details = user.userSubscriptionDetails;
  let productId = null;
  let expiresAt = null;

  let source = null;
  if (details && typeof details === 'object'
      && details.premium && typeof details.premium === 'object') {
    const p = details.premium;
    productId = p.productId || p.activeProductId || null;
    // Aboneliğin NEREDEN alındığı, iptalin nereden yapılacağını belirler:
    // web (Polar müşteri portalı) ile Play Store iki AYRI faturalama sistemi ve
    // birini iptal etmek diğerini iptal etmez. Polar webhook'u `source:'polar'`
    // yazıyor; Play tarafı yazmıyor, bu yüzden yokluğu 'play' sayılmaz —
    // bilinmiyorsa profil ekranı iki yolu da gösterir.
    source = p.source ? String(p.source).toLowerCase() : null;
    if (!source && /^polar_/.test(String(productId || ''))) source = 'polar';
    for (const k of EXPIRY_KEYS) {
      if (p[k]) { expiresAt = p[k]; break; }
    }
  }

  return { isPremium: flag || Boolean(productId), productId, expiresAt, source };
}
