// ═══════════════════════════════════════════════════════════════════════════
//  ABONELIK / MARKA LOGOLARI — TEK KAYNAK
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
//  Dosyalar: assets/icons/quiz_logos/ -> yayinda /assets/subscriptions/
//  (kopyalamayi web/scripts/postbuild.mjs yapar ve DIZININ TAMAMINI kopyalar).
//
//  OLCULDU 2026-08-28 — "bazi aboneliklerde logo yok" bildiriminin UC ayagi:
//    1. Bu tablo 103 dosyanin yalnizca ~40'ini adlandiriyordu; duz "HBO"
//       karsiligi YOKTU (yalnizca "hbo max" ve "max" vardi) ve arayuz harf
//       rozetine dusuyordu — ekran goruntusundeki bos "H" tam olarak buydu.
//    2. postbuild 29 dosyalik ELLE yazilmis bir liste kopyaliyordu; eslesme
//       tutsa bile kalan 74 dosya yayinda 404 donuyordu.
//    3. Hicbir seyin tutmadigi ad icin elle gorsel verecek bir yol yoktu ->
//       asagidaki GECERSIZ KILMA katmani (PB `brand_logos`).
// ═══════════════════════════════════════════════════════════════════════════
(function (root) {
'use strict';

// Anahtar: normalize edilmis ad. Deger: assets/icons/quiz_logos/ altindaki dosya.
const LOCAL_LOGOS = {
  // ── video ──────────────────────────────────────────────────────────────
  'netflix': 'netflix.svg',
  'disney+': 'disney_plus.png',
  'disney plus': 'disney_plus.png',
  'disney': 'disney_plus.png',
  'amazon prime': 'prime_video.png',
  'amazon prime video': 'prime_video.png',
  'prime video': 'prime_video.png',
  'prime': 'prime_video.png',
  'apple tv+': 'apple_tv_plus.svg',
  'apple tv': 'apple_tv_plus.svg',
  'appletv': 'apple_tv_plus.svg',
  // "HBO" tek basina EN SIK yazilan hali; yoklugu bildirilen hatanin kendisiydi.
  'hbo': 'max.svg',
  'hbo max': 'max.svg',
  'max': 'max.svg',
  'hulu': 'hulu.png',
  'paramount+': 'paramount_plus.svg',
  'paramount plus': 'paramount_plus.svg',
  'paramount': 'paramount_plus.svg',
  'peacock': 'peacock.png',
  'discovery+': 'discovery_plus.png',
  'discovery plus': 'discovery_plus.png',
  'discovery': 'discovery_plus.png',
  'mubi': 'mubi.svg',
  'dazn': 'dazn.svg',
  'espn+': 'espn_plus.png',
  'espn plus': 'espn_plus.png',
  'espn': 'espn_plus.png',
  'nba league pass': 'nba_league_pass.svg',
  'nfl+': 'nfl_plus.png',
  'nfl plus': 'nfl_plus.png',
  'crunchyroll': 'crunchyroll.svg',
  'youtube premium': 'youtube_premium.svg',
  'youtube': 'youtube_premium.svg',
  'twitch': 'twitch.svg',

  // ── muzik / ses ────────────────────────────────────────────────────────
  'spotify': 'spotify.svg',
  'apple music': 'apple_music.svg',
  'youtube music': 'youtube_music.svg',
  'amazon music': 'amazon_music.png',
  'amazon music unlimited': 'amazon_music.png',
  'tidal': 'tidal.svg',
  'deezer': 'deezer.svg',
  'soundcloud': 'soundcloud_go.svg',
  'soundcloud go': 'soundcloud_go.svg',
  'audible': 'audible.svg',

  // ── yapay zeka ─────────────────────────────────────────────────────────
  'chatgpt': 'chatgpt_plus.png',
  'chatgpt plus': 'chatgpt_plus.png',
  'openai': 'chatgpt_plus.png',
  'claude': 'claude.svg',
  'claude pro': 'claude.svg',
  'anthropic': 'claude.svg',
  'gemini': 'gemini.svg',
  'gemini advanced': 'gemini.svg',
  'google gemini': 'gemini.svg',
  'perplexity': 'perplexity.svg',
  'midjourney': 'midjourney.png',
  'deepseek': 'deepseek.png',
  'elevenlabs': 'elevenlabs.svg',
  'runway': 'runway.png',
  'suno': 'suno.svg',
  'openrouter': 'openrouter.svg',
  'github copilot': 'github_copilot.svg',
  'copilot': 'github_copilot.svg',
  'cursor': 'cursor.svg',

  // ── oyun ───────────────────────────────────────────────────────────────
  'xbox game pass': 'game_pass.png',
  'game pass': 'game_pass.png',
  'xbox': 'game_pass.png',
  'playstation plus': 'ps_plus.svg',
  'ps plus': 'ps_plus.svg',
  'playstation': 'ps_plus.svg',
  'geforce now': 'geforce_now.svg',
  'nvidia geforce now': 'geforce_now.svg',
  'nintendo switch online': 'switch_online.png',
  'nintendo online': 'switch_online.png',
  'nintendo': 'switch_online.png',
  'discord nitro': 'discord_nitro.svg',
  'discord': 'discord_nitro.svg',

  // ── depolama / ofis ────────────────────────────────────────────────────
  'dropbox': 'dropbox.svg',
  'microsoft 365': 'microsoft_365.png',
  'office 365': 'microsoft_365.png',
  'google one': 'google_one.png',
  'icloud+': 'icloud.svg',
  'icloud': 'icloud.svg',
  'onedrive': 'onedrive.png',
  'mega': 'mega.svg',
  'box': 'box.svg',
  'proton': 'proton.svg',
  'proton drive': 'proton.svg',
  'proton mail': 'proton.svg',

  // ── tasarim / uretkenlik ───────────────────────────────────────────────
  'adobe creative cloud': 'adobe_cc.png',
  'adobe': 'adobe_cc.png',
  'notion': 'notion.svg',
  'canva': 'canva.png',
  'figma': 'figma.svg',
  'miro': 'miro.svg',
  'linear': 'linear.svg',
  'clickup': 'clickup.svg',
  'asana': 'asana.svg',
  'monday': 'monday.png',
  'monday.com': 'monday.png',
  'trello': 'trello.svg',
  'jira': 'jira.svg',
  'slack': 'slack.png',
  'zoom': 'zoom.svg',
  'picsart': 'picsart.svg',
  'capcut': 'capcut.png',
  'grammarly': 'grammarly.svg',

  // ── sosyal ─────────────────────────────────────────────────────────────
  'x premium': 'x_premium.svg',
  'twitter blue': 'x_premium.svg',
  'x': 'x_premium.svg',
  'telegram premium': 'telegram_premium.svg',
  'telegram': 'telegram_premium.svg',
  'snapchat+': 'snapchat_plus.svg',
  'snapchat plus': 'snapchat_plus.svg',
  'snapchat': 'snapchat_plus.svg',
  'meta verified': 'meta_verified.svg',
  'reddit premium': 'reddit_premium.svg',
  'reddit': 'reddit_premium.svg',
  'linkedin premium': 'linkedin_premium.png',
  'linkedin': 'linkedin_premium.png',

  // ── egitim ─────────────────────────────────────────────────────────────
  'duolingo': 'duolingo.svg',
  'babbel': 'babbel.png',
  'coursera': 'coursera.svg',
  'udemy': 'udemy.svg',
  'skillshare': 'skillshare.svg',
  'masterclass': 'masterclass.png',
  'brilliant': 'brilliant.png',
  'pluralsight': 'pluralsight.svg',

  // ── saglik ─────────────────────────────────────────────────────────────
  'headspace': 'headspace.svg',
  'calm': 'calm.png',
  'strava': 'strava.svg',
  'myfitnesspal': 'myfitnesspal.png',
  'fitbit': 'fitbit.svg',

  // ── vpn / guvenlik ─────────────────────────────────────────────────────
  'nordvpn': 'nordvpn.svg',
  'expressvpn': 'expressvpn.svg',
  'surfshark': 'surfshark.svg',
  '1password': '1password.svg',
  'bitwarden': 'bitwarden.svg',

  // ── bulut / gelistirici ────────────────────────────────────────────────
  'aws': 'aws.png',
  'amazon web services': 'aws.png',
  'azure': 'azure.png',
  'microsoft azure': 'azure.png',
  'google cloud': 'google_cloud.svg',
  'vercel': 'vercel.svg',
  'cloudflare': 'cloudflare.svg',

  // ── marka geneli ───────────────────────────────────────────────────────
  'apple': 'apple.svg',
  'google': 'google.svg',
  'amazon': 'amazon.png',
  'samsung': 'samsung.svg',
  'xiaomi': 'xiaomi.svg',
  'huawei': 'huawei.svg',
  'windows': 'windows.png',
  'microsoft': 'windows.png',
  'android': 'android.svg',
};

// Yayindaki mutlak adres. Admin kayda bunu yazar; site zaten kendi kokunden
// servis ettigi icin goreli yol da calisirdi, ama kayit APP tarafindan da
// okunabiliyor ve orada goreli yolun karsiligi yok.
var TABAN = 'https://qorai.net/assets/subscriptions/';

// Adin sonundaki plan/paket kelimeleri. "Netflix Premium", "Spotify Aile",
// "YouTube Premium Bireysel" gibi yazimlar tabloya birebir uymuyordu.
var PLAN_KELIMELERI = [
  'premium', 'plus', 'pro', 'max', 'ultimate', 'unlimited', 'standart',
  'standard', 'basic', 'temel', 'aile', 'family', 'bireysel', 'individual',
  'duo', 'student', 'ogrenci', 'öğrenci', 'abonelik', 'abonelii',
  'aboneligi', 'aboneliği', 'subscription', 'plan', 'paket', 'tier',
  'yillik', 'yıllık', 'aylik', 'aylık', 'annual', 'monthly',
];

function normalize(ad) {
  return String(ad || '')
    .toLowerCase()
    .replace(/İ/g, 'i')
    .trim()
    .replace(/\s{2,}/g, ' ');
}

/** Tabloda birebir yoksa plan kelimelerini SONDAN atarak yeniden dener.
 *  "Netflix Premium Aile" -> "netflix premium" -> "netflix".
 *  Kosul ATILAN token'a bakar, kalana degil; tek token'li ad hic kirpilmaz
 *  (yoksa "Max" bos dizeye inerdi). */
function planKelimeleriniAt(ad) {
  var parcalar = normalize(ad).split(' ').filter(Boolean);
  var adaylar = [];
  var i = parcalar.length;
  while (i > 1) {
    var atilan = parcalar[i - 1].replace(/[+]$/, '');
    if (PLAN_KELIMELERI.indexOf(atilan) < 0) break;
    i -= 1;
    adaylar.push(parcalar.slice(0, i).join(' '));
  }
  return adaylar;
}

/* ── ADMIN GECERSIZ KILMA ───────────────────────────────────────────────────
   AI hicbir logo bulamadiginda ya da bulunan logo yanlissa, admin panelinden
   ADA bagli bir gorsel yuklenir (PB `brand_logos`). Gorsel analiz kaydina
   DEGIL ada baglidir: "HBO" icin bir kez yuklenen logo her karsilastirmada,
   abonelik kartinda, gecmiste ve uygulamada gecerli olur.

   Harita disaridan doldurulur (site: SubLogo.jsx, admin: brand_logos.js) —
   bu dosya AG ISTEGI YAPMAZ, cunku hem derlenen site hem derlenmeyen admin
   tarafindan yukleniyor ve ikisinin istemcisi ayri. */
var OVERRIDES = Object.create(null);

function setOverrides(harita) {
  OVERRIDES = Object.create(null);
  if (!harita) return;
  Object.keys(harita).forEach(function (k) {
    var url = String(harita[k] || '').trim();
    if (url) OVERRIDES[normalize(k)] = url;
  });
}

/** Ada elle atanmis gorselin adresi ya da ''. Plan kelimeleri de denenir. */
function overrideFor(ad) {
  var n = normalize(ad);
  if (OVERRIDES[n]) return OVERRIDES[n];
  var adaylar = planKelimeleriniAt(ad);
  for (var i = 0; i < adaylar.length; i++) {
    if (OVERRIDES[adaylar[i]]) return OVERRIDES[adaylar[i]];
  }
  return '';
}

/** PB kaydini ({key, image, imageUrl}) tam adrese cevirir. */
function overrideUrlFromRecord(pbUrl, rec) {
  if (!rec) return '';
  if (rec.imageUrl) return String(rec.imageUrl);
  if (rec.image) {
    return String(pbUrl).replace(/\/+$/, '')
      + '/api/files/' + (rec.collectionId || 'brand_logos') + '/' + rec.id + '/' + rec.image;
  }
  return '';
}

/** Abonelik adindan yerel logo DOSYA ADI ('netflix.svg') ya da ''. */
function logoFile(ad) {
  var n = normalize(ad);
  if (LOCAL_LOGOS[n]) return LOCAL_LOGOS[n];
  var adaylar = planKelimeleriniAt(ad);
  for (var i = 0; i < adaylar.length; i++) {
    if (LOCAL_LOGOS[adaylar[i]]) return LOCAL_LOGOS[adaylar[i]];
  }
  return '';
}

/** Abonelik adindan yayindaki TAM adres ya da ''. Elle yuklenen gorsel ONCE
 *  gelir: admin bir logoyu ozellikle duzeltmisse tablo onu ezmemeli. */
function logoUrl(ad) {
  var elle = overrideFor(ad);
  if (elle) return elle;
  var f = logoFile(ad);
  return f ? TABAN + f : '';
}

root.QorSubLogos = {
  LOCAL_LOGOS: LOCAL_LOGOS,
  logoFile: logoFile,
  logoUrl: logoUrl,
  normalizeName: normalize,
  setOverrides: setOverrides,
  overrideFor: overrideFor,
  overrideUrlFromRecord: overrideUrlFromRecord,
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
