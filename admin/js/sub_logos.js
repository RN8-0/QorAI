// ═══════════════════════════════════════════════════════════════════════════
//  ABONELIK LOGOLARI — TEK KAYNAK
//
//  Ad -> yerel logo dosyasi eslemesi. IKI tarafin da ayni logoyu bulmasi
//  gerekiyor: site (SubLogo.jsx, abonelik kartlari) ve ADMIN (analiz
//  yayinlarken kaydin gorselini doldurur). Ikinci bir kopya kacinilmaz olarak
//  ayrisirdi — spec_i18n.js ile ayni gerekce.
//
//  Dosya neden admin/ altinda: admin DERLENMEYEN statik bir site, tarayici
//  yalnizca kendi kok dizinindeki dosyayi cekebiliyor. Site ise derleme
//  aninda ice aktardigi icin calisma zamaninda admin'e BAGIMLI DEGIL.
//
//  Dosyalar: web/assets/icons/quiz_logos/ -> yayinda /assets/subscriptions/
// ═══════════════════════════════════════════════════════════════════════════
(function (root) {
'use strict';

const LOCAL_LOGOS = {
  'netflix': 'netflix.svg',
  'disney+': 'disney_plus.png',
  'disney plus': 'disney_plus.png',
  'amazon prime': 'prime_video.png',
  'amazon prime video': 'prime_video.png',
  'prime video': 'prime_video.png',
  'apple tv+': 'apple_tv_plus.svg',
  'apple tv': 'apple_tv_plus.svg',
  'hbo max': 'max.svg',
  'max': 'max.svg',
  'youtube premium': 'youtube_premium.svg',
  'youtube': 'youtube_premium.svg',
  'crunchyroll': 'crunchyroll.svg',
  'spotify': 'spotify.svg',
  'apple music': 'apple_music.svg',
  'youtube music': 'youtube_music.svg',
  'tidal': 'tidal.svg',
  'chatgpt': 'chatgpt_plus.png',
  'chatgpt plus': 'chatgpt_plus.png',
  'claude': 'claude.svg',
  'claude pro': 'claude.svg',
  'gemini': 'gemini.svg',
  'gemini advanced': 'gemini.svg',
  'perplexity': 'perplexity.svg',
  'midjourney': 'midjourney.png',
  'xbox game pass': 'game_pass.png',
  'xbox': 'game_pass.png',
  'playstation plus': 'ps_plus.svg',
  'playstation': 'ps_plus.svg',
  // Yeni varsayılan kutular (2026-08-08) — hepsinin YEREL logosu var, uzak
  // CDN'e düşmesinler (Amazon Music aksi hâlde jenerik Amazon logosu oluyordu).
  'amazon music': 'amazon_music.png',
  'amazon music unlimited': 'amazon_music.png',
  'deezer': 'deezer.svg',
  'geforce now': 'geforce_now.svg',
  'nvidia geforce now': 'geforce_now.svg',
  'nintendo switch online': 'switch_online.png',
  'nintendo online': 'switch_online.png',
  'dropbox': 'dropbox.svg',
  'microsoft 365': 'microsoft_365.png',
  'google one': 'google_one.png',
  'icloud+': 'icloud.svg',
  'icloud': 'icloud.svg',
  'adobe creative cloud': 'adobe_cc.png',
  'adobe': 'adobe_cc.png',
  'notion': 'notion.svg',
  'canva': 'canva.png',
};

// Yayindaki mutlak adres. Admin kayda bunu yazar; site zaten kendi kokunden
// servis ettigi icin goreli yol da calisirdi, ama kayit APP tarafindan da
// okunabiliyor ve orada goreli yolun karsiligi yok.
var TABAN = 'https://qorai.net/assets/subscriptions/';

function normalize(ad) {
  return String(ad || '').toLowerCase().trim();
}

/** Abonelik adindan yerel logo DOSYA ADI ('netflix.svg') ya da ''. */
function logoFile(ad) {
  return LOCAL_LOGOS[normalize(ad)] || '';
}

/** Abonelik adindan yayindaki TAM adres ya da ''. */
function logoUrl(ad) {
  var f = logoFile(ad);
  return f ? TABAN + f : '';
}

root.QorSubLogos = {
  LOCAL_LOGOS: LOCAL_LOGOS,
  logoFile: logoFile,
  logoUrl: logoUrl,
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
