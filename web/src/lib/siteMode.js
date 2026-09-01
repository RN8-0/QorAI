// ═══════════════════════════════════════════════════════════════
//  SİTE MODU — ziyaretçiye dönük AI yüzeylerinin TEK anahtarı
// ═══════════════════════════════════════════════════════════════
//
// KAPANAN ŞEY ANALİZ ÜRETİMİ DEĞİL. Analizler admin panelinde
// üretilip yayınlanmaya devam eder; `/analiz`, `/analiz/<slug>`,
// `/blog`, ürün ve karşılaştırma sayfaları hiçbir şekilde
// etkilenmez — sitenin SEO yüzeyi olduğu gibi durur. Kapanan
// yalnızca ZİYARETÇİNİN kendi AI işini başlatabildiği yüzeyler ve
// premium satış girişi.
//
// HİÇBİR ŞEY SİLİNMEDİ. Rotalar, sayfa bileşenleri, `isPremium`,
// `userSubscriptionDetails`, Q Coin defteri ve Play Billing
// altyapısı yerinde duruyor. Geri açmak = aşağıdaki satırı `true`
// yapıp deploy etmek.
//
// ── NEDEN PocketBase AYARI DEĞİL ───────────────────────────────
// `store_settings` kalıbı (bkz. lib/offers.js → hiddenStores) bir
// mağazayı gizlemek için doğru araç: o karar yalnız çalışma anını
// ilgilendirir. Burada değil. Ürün, blog ve analiz sayfaları
// ÖN-RENDER ediliyor (scripts/seo.mjs) ve Google'ın okuduğu HTML
// build anında yazılıyor. Çalışma anında okunan bir PB bayrağı o
// HTML'e yetişemez: premium ve sohbet linkleri ön-render'da kalır,
// crawler onları görmeye devam ederdi. Bayrak build zamanında
// bilinmek ZORUNDA.
//
// Düz sabit olmasının ikinci faydası: SPA ile `seo.mjs` AYNI
// dosyayı import eder, dolayısıyla kullanıcının gördüğü gezinme
// ile sitemap asla ayrışamaz.

export const SITE_MODE = {
  /**
   * Ziyaretçinin KENDİ analizini başlatması: ürün analizi,
   * karşılaştırma analizi, link analizi, abonelik analizi.
   * `useAiAccess` tek geçiş noktası olduğu için buradaki tek
   * bayrak dört akışı birden kapatır.
   */
  userAi: false,

  /**
   * `/premium` sayfası, üst bardaki Premium linki ve "Premium'a
   * geç" çağrıları. Satın alma altyapısı (Polar, Play Billing)
   * sökülmedi — yalnız girişler gizli.
   */
  premium: false,

  /** Sağ alttaki Qor AI balonu ve `/ai-chat` sayfası. */
  chat: false,

  /**
   * Girişte dayatılan profil quizi (`/quiz`). Kapalıyken yeni
   * kullanıcı quize yönlendirilmez ve AI kapısı quiz şartı aramaz.
   */
  quiz: false,
};

/**
 * Rota → onu açan mod anahtarı. Header, Footer, BottomNav, App ve
 * `seo.mjs` AYNI tablodan okur; biri diğerinden ayrışamaz.
 * Burada olmayan rota daima açıktır.
 */
export const ROUTE_MODE = {
  '/premium': 'premium',
  '/ai-chat': 'chat',
  '/quiz': 'quiz',
  '/link-analysis': 'userAi',
  '/subscriptions': 'userAi',
};

/** Bu mod açık mı? Bilinmeyen anahtar kapalı sayılır. */
export function modeOn(key) {
  return SITE_MODE[key] === true;
}

/** Rota şu an ziyaretçiye açık mı? */
export function routeOpen(path) {
  const key = ROUTE_MODE[path];
  return !key || SITE_MODE[key] === true;
}

/** Kapalı rotaların yolları — sitemap ve noindex kararı için. */
export function closedRoutes() {
  return Object.keys(ROUTE_MODE).filter((p) => !routeOpen(p));
}
