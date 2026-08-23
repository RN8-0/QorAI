/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════
//  QOR AI — LINK & ABONELIK ANALIZ MOTORU · TEK KAYNAK
//
//  Bu dosya web/src/lib/linkAnalysis.js'ten TASINDI (kopyalanmadi). Admin
//  paneli de link ve abonelik analizi URETIYOR; iki ayri motor tutmak, iki
//  ayri analiz demek olurdu.
//
//  Prompt'lar burada YASIYOR (analyzeLink, enhancedAnalysis, compareAnalysis,
//  subscriptionAnalysis ve arastirma prompt'lari). Quiz prompt'lari ve urun
//  rapor prompt'lari komsu dosyada: admin/js/qor_ai_prompts.js.
//
//  TASIMA KATMANI ENJEKTE EDILIR. Site kendi `web/src/lib/ai.js`ini, admin
//  kendi proxy istemcisini verir; motor hangi saglayiciya gittigini BILMEZ:
//    QorAiLink.configure({ askJson, askGrounded, adminPrompt })
//
//  YUKLEME SIRASI: qor_ai_prompts.js'ten SONRA (buradaki quiz cagrilari
//  oradaki prompt'lari kullaniyor).
// ═══════════════════════════════════════════════════════════════════════════
(function (root) {
'use strict';

var P = root.QorAiPrompts;
var languageName = P.languageName;
var quizGenerationPrompt = P.quizGenerationPrompt;
var compareQuizGenerationPrompt = P.compareQuizGenerationPrompt;
var subscriptionQuizPrompt = P.subscriptionQuizPrompt;
var productQuizCount = P.productQuizCount;
var compareQuizCount = P.compareQuizCount;
var subscriptionQuizCount = P.subscriptionQuizCount;
var variationSeed = P.variationSeed;

// Tasima katmani — configure() ile doldurulur. Cagrilmadan kullanilirsa
// SESSIZ KALMAZ: sebebi gorunmeyen bir "analiz basarisiz" yerine acik hata.
var _ai = null;
function configure(deps) { _ai = deps || null; }
function need() {
  if (!_ai) throw new Error('[QorAiLink] configure({askJson, askGrounded, adminPrompt}) cagrilmadi');
  return _ai;
}
function askQorAiJson(o) { return need().askJson(o); }
function askQorAiGrounded(p, o) { return need().askGrounded(p, o); }
function adminPrompt(key, fallback) { return need().adminPrompt(key, fallback); }

function compareFactorLabels(language) {
  const lang = String(language || 'en').slice(0, 2).toLowerCase();
  if (lang === 'tr') {
    return [
      'Kullanım Uyumu',
      'Performans',
      'Kalite Uyumu',
      'Özellik Seti',
      'Ergonomi ve Taşınabilirlik',
      'Güvenilirlik ve Risk',
      'Topluluk Sinyali',
      'Uzun Vadeli Değer',
    ];
  }
  
  return [
    'Usage Fit',
    'Performance',
    'Quality Fit',
    'Feature Set',
    'Ergonomics and Portability',
    'Reliability and Risk',
    'Community Signal',
    'Long-term Value',
  ];
}

function subscriptionFactorDefinitions(language) {
  const lang = String(language || 'en').slice(0, 2).toLowerCase();
  if (lang === 'tr') {
    return [
      { key: 'usage_fit', label: 'Kullanım Uyumu', emoji: '🎯' },
      { key: 'content_match', label: 'İçerik Uyumu', emoji: '🎬' },
      { key: 'feature_depth', label: 'Özellik Derinliği', emoji: '🧩' },
      { key: 'ecosystem_fit', label: 'Ekosistem Uyumu', emoji: '🔗' },
      { key: 'lifestyle_match', label: 'Yaşam Tarzı Uyumu', emoji: '🏠' },
      { key: 'community_signal', label: 'Topluluk Sinyali', emoji: '🌐' },
      { key: 'retention_value', label: 'Uzun Vadeli Tutma Değeri', emoji: '🚀' },
      { key: 'risk_balance', label: 'Risk Dengesi', emoji: '🛡' },
    ];
  }
  
  return [
    { key: 'usage_fit', label: 'Usage Fit', emoji: '🎯' },
    { key: 'content_match', label: 'Content Match', emoji: '🎬' },
    { key: 'feature_depth', label: 'Feature Depth', emoji: '🧩' },
    { key: 'ecosystem_fit', label: 'Ecosystem Fit', emoji: '🔗' },
    { key: 'lifestyle_match', label: 'Lifestyle Match', emoji: '🏠' },
    { key: 'community_signal', label: 'Community Signal', emoji: '🌐' },
    { key: 'retention_value', label: 'Long-term Retention', emoji: '🚀' },
    { key: 'risk_balance', label: 'Risk Balance', emoji: '🛡' },
  ];
}

// ── Step 1: product identification + base analysis ────────────────
function linkAnalysisSystemPrompt(language) {
  const langName = languageName(language);
  return `You are Qor AI's link analysis engine. You receive a product URL, optional metadata, optional web research data, and a user profile. Your job is to identify the EXACT product and analyze it for the user.

CRITICAL — PRODUCT IDENTIFICATION (PRIORITY ORDER):
1. "webResearch" — If provided, this contains VERIFIED current web data (Google Search grounding) about the URL. This is your MOST RELIABLE source for product identification. USE IT.
2. The "productMetadata.title" field is your next most trusted source. If it contains a clear product name, YOU MUST USE IT as the product title. Do NOT override it with a different product.
3. The URL path segments (slugs, IDs, brand names) are your TERTIARY source.
4. ABSOLUTELY NEVER substitute, replace, or hallucinate a different product than what the research/metadata/URL indicates. This is the #1 unbreakable rule.
5. If productMetadata.title looks like a domain name (e.g. "trendyol.com"), ignore it and rely on webResearch or URL structure.
6. For Amazon ISBNs (all-numeric 10-digit IDs), this is a BOOK. Category = "books".
7. For Amazon ASINs (alphanumeric starting with 'B'): if webResearch is available, use its product name; otherwise, if NOT certain, set is_product to false rather than guessing.
8. If you cannot determine the product, set is_product to false. NEVER fabricate.
9. NON-PRODUCT PAGES: if the URL is a social-media post, a forum / Q&A thread (Quora, Reddit…), a video, a news article, a blog post, search results, or a store homepage / category listing rather than ONE specific product, set is_product to false and do NOT invent a product. A real product link points to a single purchasable item.

CATEGORY DETECTION:
- Detect the REAL category: books, smartphones, laptops, tablets, headphones, monitors, keyboards, clothing, home-appliances, gaming, toys, beauty, sports, furniture, kitchen, pet-supplies, etc.
- Do NOT default to "smartphones". Read the URL and metadata carefully.
- Products can be ANY category — not just technology. Books, clothing, kitchen items are all valid.

CATEGORY-AWARE ANALYSIS:
- For TECH products (smartphones, laptops, tablets, headphones): discuss specs, ecosystem compatibility, performance.
- For BOOKS: discuss content, author, genre, reading value. Do NOT mention "ecosystem compatibility" or "tech specs".
- For CLOTHING/FASHION: discuss material, style, sizing, brand quality. Do NOT mention tech specs.
- For HOME/KITCHEN: discuss functionality, durability, design. Do NOT force tech terminology.
- Adapt your analysis language to the product category naturally.

LANGUAGE: Write the "analysis" field in ${langName}.

SCORING RULES:
- Score reflects how well this product fits the user (range: 20-95)
- For tech: consider ecosystem, budget, priorities
- For non-tech: consider budget, lifestyle, stated interests, practical value

Return valid JSON:
{
  "is_product": true,
  "score": 20-95,
  "analysis": "Detailed category-appropriate analysis in ${langName}",
  "category": "product category in English lowercase",
  "title": "EXACT product name from metadata/URL — NEVER invented or substituted",
  "image_url": null,
  "price": "Price with currency if known, else null",
  "site_name": "Store name from URL domain"
}`;
}

// Derive a readable product title from the URL slug (free, no API) — used as a
// trusted fallback so the AI cannot drift to a different product.
// URL yolunda ürün ADI TAŞIMAYAN yapısal segmentler. "detay" burada YOKTU:
// sahibinden.com/ilan/<gerçek-ürün-slug'ı>-123456/detay bağlantısında en son
// harfli segment "detay" olduğu için ürün adı "Detay" çıkıyordu — ve tüm akış
// (kategori "general", quiz, rapor) o boş isim üzerine kuruluyordu.
const URL_JUNK_SEGMENTS = new Set([
  'p', 'dp', 'pd', 'gp', 'aw', 'd', 'product', 'products', 'urun', 'urunler',
  'item', 'items', 'ref', 'detay', 'detail', 'details', 'ilan', 'ilanlar',
  'listing', 'listings', 'ad', 'ads', 'offer', 'offers', 'sayfa', 'page',
  'satilik', 'kiralik', 'sahibinden', 'index', 'default', 'view', 'show',
]);

// Ürün adı yerine geçemeyecek "isim". Böyle bir başlık geldiğinde ürünü
// TANIMADIK demektir → grounded arama şart.
function isJunkProductTitle(title) {
  const t = String(title || '').trim().toLowerCase();
  if (!t || t.length < 4) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.every((w) => URL_JUNK_SEGMENTS.has(w))) return true;
  // "Detay", "Ilan", "Urun", "Product Page" gibi tek/iki kelimelik yapısal adlar
  if (words.length <= 2 && words.some((w) => URL_JUNK_SEGMENTS.has(w))) return true;
  // Sadece rakam/kod
  if (!/[a-zçğıöşü]{3,}/i.test(t)) return true;
  return false;
}

function titleFromUrl(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').map((s) => s.trim()).filter(Boolean);
    let slug = '';
    if (/amazon\./i.test(u.hostname)) {
      const dpIndex = segs.findIndex((s) => /^(dp|product)$/i.test(s));
      if (dpIndex > 0) slug = segs[dpIndex - 1];
    }
    const ignore = (s) => URL_JUNK_SEGMENTS.has(String(s).toLowerCase())
      || /^(ref|psc|qid|sr)[=_-]/i.test(s);
    const idLike = /^(?:[a-z0-9]{10}|[a-f0-9]{16,}|[0-9]{8,})$/i;
    if (!slug) {
      // EN AÇIKLAYICI segmenti seç (en son değil): mağazalar ürün adını uzun
      // slug'da taşır, sonraki segmentler ("detay", "p", id) yapısaldır.
      const candidates = segs.filter((s) => /[a-zçğıöşü]{3,}/i.test(s) && !ignore(s) && !idLike.test(s));
      slug = candidates.sort((a, b) => b.replace(/[^a-zçğıöşü]/gi, '').length - a.replace(/[^a-zçğıöşü]/gi, '').length)[0] || '';
    }
    if (!slug) slug = [...segs].reverse().find((s) => /[a-z]/i.test(s) && !ignore(s)) || '';
    slug = slug.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ');
    slug = slug.replace(/\b(p|dp|pd|product|urun|item|ref|detay|ilan)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    // Sondaki ilan numarasını / mağaza stok kodunu at
    // ("... ecoboost 1234567", "... g6 irl HBCV00004ABCDE" → temiz ad).
    slug = slug.replace(/\s+\d{5,}$/, '').trim();
    slug = slug.replace(/\s+[A-Za-z]{2,}\d[A-Za-z0-9]{5,}$/, '').trim();
    if (slug.length < 3) return '';
    return slug.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
  } catch {
    return '';
  }
}

// Kategori çıkarımı. ARAÇLAR YOKTU: bir araba ilanı "general" olarak
// etiketleniyor ve quiz motoru elinde kategori olmayınca telefon senaryolarına
// kayıyordu. Liste artık teknoloji dışını da kapsıyor.
function inferCategoryFromUrl(url, title) {
  const haystack = `${url || ''} ${title || ''}`.toLowerCase();
  if (/(vasita|otomobil|arac|araba|\bauto\b|automobil|car|suv|pickup|kamyonet|motosiklet|motorcycle|ecoboost|tdi|tsi|dizel|benzin|hybrid|4x4|ranger|raptor|hilux|amarok)/.test(haystack)) return 'cars';
  if (/(emlak|konut|daire|villa|arsa|real-?estate|apartment|kiralik-?ev)/.test(haystack)) return 'real-estate';
  if (/(laptop|notebook|macbook|thinkpad|thinkbook|vivobook|zenbook|ultrabook|chromebook|legion|rog|tuf|omen|victus|ideapad|nebula)/.test(haystack)) return 'laptops';
  if (/(headphone|headset|kulaklik|earbud|airpods|buds|wh-|quietcomfort)/.test(haystack)) return 'headphones';
  if (/(tablet|ipad|galaxy-?tab|mediapad|matepad)/.test(haystack)) return 'tablets';
  if (/(phone|iphone|galaxy|pixel|xiaomi|redmi|smartphone|telefon)/.test(haystack)) return 'smartphones';
  if (/(monitor|display|oled|qled|ultrawide)/.test(haystack)) return 'monitors';
  if (/(keyboard|mouse|klavye|fare)/.test(haystack)) return 'keyboards';
  if (/(camera|kamera|objektif|lens|dslr|mirrorless)/.test(haystack)) return 'cameras';
  // book: "thinkbook / macbook / chromebook" kitap DEĞİLDİR.
  if (/(book|books|isbn|kindle|kitap)/.test(haystack)) return 'books';
  if (/(shoe|shirt|dress|jacket|pantolon|ayakkabi|giyim|tekstil)/.test(haystack)) return 'clothing';
  if (/(bisiklet|bicycle|scooter|skuter)/.test(haystack)) return 'bikes';
  if (/(kitchen|vacuum|robot|coffee|airfryer|home|mutfak|beyaz-?esya|buzdolabi|camasir)/.test(haystack)) return 'home-appliances';
  if (/(game|gaming|ps5|xbox|switch|konsol)/.test(haystack)) return 'gaming';
  return 'general';
}

function fallbackBaseAnalysis({ url, title, siteName, language }) {
  const lang = String(language || 'en').slice(0, 2).toLowerCase();
  const name = title || siteName || url;
  if (lang === 'tr') {
    return `"${name}" bağlantısı ürün sayfası olarak işlendi. Qor AI ürün adını bağlantı ve site bilgisinden çıkardı; canlı sayfa verisi alınamadığında değerlendirme, ürün adı/kategori sinyalleri ve profil cevapların üzerinden hazırlanır. Satın almadan önce satıcı sayfasındaki güncel fiyat, garanti ve teknik özellikleri de kontrol et.`;
  }
  
  return `"${name}" was processed as a product link. Qor AI identified it from the URL and store signal; when live page data is unavailable, the recommendation is built from the title, category signals, and your answers. Check the seller page for current price, warranty, and specs before buying.`;
}

// Hosts that are never product pages — social, Q&A/forums, video, search,
// encyclopedias, messaging, streaming. Pasting these should warn, not analyze.
const NON_PRODUCT_HOSTS = [
  'quora.com', 'reddit.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
  'facebook.com', 'fb.com', 'fb.watch', 'instagram.com', 'tiktok.com', 'threads.net',
  'wikipedia.org', 'fandom.com', 'medium.com', 'substack.com', 'linkedin.com',
  'pinterest.com', 'github.com', 'gitlab.com', 'stackoverflow.com', 'stackexchange.com',
  'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'yandex.com',
  'whatsapp.com', 't.me', 'telegram.org', 'discord.com', 'discord.gg',
  'twitch.tv', 'spotify.com', 'soundcloud.com', 'netflix.com', 'wikihow.com',
];

// True only if `url` could plausibly be a product page. A clearly non-product
// link (social/forum/video/search) or a bare store homepage returns false; the
// AI still makes the final call on anything that passes here.
function looksLikeProductUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (NON_PRODUCT_HOSTS.some((d) => host === d || host.endsWith('.' + d))) return false;
  const path = u.pathname.replace(/\/+$/, '');
  if (!path && !u.search) return false; // bare homepage, not a product
  return true;
}

async function analyzeLink(url, language, userProfile = {}) {
  const fallbackTitle = titleFromUrl(url);
  let siteName = '';
  try { siteName = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  // Obvious non-product links never reach the AI — warn the user instead.
  if (!looksLikeProductUrl(url)) {
    return { url, title: fallbackTitle || siteName || url, score: 0, analysis: '', category: '', siteName, price: null, isProduct: false };
  }
  // ── Product verification (app parity) ─────────────────────────────
  // Mirror the app's GeminiService.analyzeLink research step: when the URL has
  // no readable product slug, or it's an Amazon page (ASINs have no human
  // title), confirm the EXACT product with Google Search grounding. Optional —
  // on any failure we proceed without it, exactly like the app.
  let webResearch = '';
  // "Detay" gibi YAPISAL bir slug da tanınmamış sayılır: eskiden 5 harf olduğu
  // için araştırma atlanıyor, ürün adı "Detay" / kategori "general" kalıyor ve
  // quiz motoru elinde bağlam olmadığı için telefon senaryolarına kayıyordu
  // (araba ilanına telefon soruları). Artık junk başlık = araştırma ŞART.
  const needsResearch =
    isJunkProductTitle(fallbackTitle) || /amazon\./i.test(siteName);
  if (needsResearch) {
    try {
      const researchPrompt =
        `Identify the EXACT product sold at this URL using Google Search.\n` +
        `URL: ${url}\n` +
        (fallbackTitle ? `Possible title from URL slug: ${fallbackTitle}\n` : '') +
        (siteName ? `Store: ${siteName}\n` : '') +
        `Return the exact product name (brand + model + key variant), its category, ` +
        `and the current price with currency if visible. If you cannot confirm ONE ` +
        `specific product, say so explicitly — do not guess.`;
      webResearch = await askQorAiGrounded(researchPrompt, {
        language,
        maxOutputTokens: 768,
        timeoutMs: 25000,
      });
    } catch { /* research is optional — proceed without it */ }
  }

  let res = null;
  try {
    const userPayload = {
      url,
      productMetadata: fallbackTitle ? { title: fallbackTitle, siteName } : { siteName },
      userProfile,
    };
    if (webResearch) userPayload.webResearch = webResearch;
    res = await askQorAiJson({
      // Shared admin override key with the mobile app — admin panel can update
      // this prompt for BOTH web and app without a new build.
      system: await adminPrompt('gemini_link_analysis_system', linkAnalysisSystemPrompt(language)),
      user: JSON.stringify(userPayload),
      maxOutputTokens: 1536,
    });
  } catch {
    res = {
      title: fallbackTitle || siteName || url,
      score: 60,
      analysis: fallbackBaseAnalysis({ url, title: fallbackTitle, siteName, language }),
      category: inferCategoryFromUrl(url, fallbackTitle),
      site_name: siteName,
      price: null,
      is_product: true,
    };
  }
  const aiTitle = String(res.title || '').trim();
  const bad = !aiTitle
    || /erişim|hata|error|unknown|bilinmeyen/i.test(aiTitle)
    || isJunkProductTitle(aiTitle);
  const title = bad
    ? (!isJunkProductTitle(fallbackTitle) ? fallbackTitle : (aiTitle || siteName || url))
    : aiTitle;
  return {
    url,
    title,
    score: Number(res.score) || 0,
    analysis: String(res.analysis || fallbackBaseAnalysis({ url, title, siteName, language })),
    // AI "general" derse çıkarıma düş: boş kategori quiz motorunu kör bırakıyor.
    category: (() => {
      const aiCat = String(res.category || '').toLowerCase().trim();
      if (aiCat && aiCat !== 'general' && aiCat !== 'other') return aiCat;
      const guess = inferCategoryFromUrl(url, `${title} ${res.analysis || ''}`);
      return guess !== 'general' ? guess : (aiCat || 'general');
    })(),
    siteName: String(res.site_name || siteName || ''),
    price: res.price || null,
    isProduct: res.is_product !== false,
  };
}

// ── Step 2: personalized quiz ─────────────────────────────────────
async function generateQuiz({
  category, productTitle, url, language, userProfile = {}, productContext = '', siteName = '',
}) {
  const count = productQuizCount(category);
  const res = await askQorAiJson({
    system: quizGenerationPrompt(language, count),
    // Ürün BAĞLAMI da gidiyor: kategori zayıfsa ("general") model ürünün ne
    // olduğunu ad + baz analiz metninden çıkarabilsin.
    user: JSON.stringify({
      category: category || 'unknown',
      productTitle,
      url,
      store: siteName,
      productContext: String(productContext || '').slice(0, 1200),
      userProfile,
      variationSeed: variationSeed(),
    }),
    maxOutputTokens: 3072,
    temperature: 0.95,
  });
  const questions = (Array.isArray(res.questions) ? res.questions : [])
    .map((q, i) => ({
      id: `q${i}`,
      text: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    }))
    .filter((q) => q.text && q.options.length >= 2)
    .slice(0, count);
  return questions;
}

async function generateCompareQuiz({ products, language, userProfile = {} }) {
  const count = compareQuizCount(products);
  const res = await askQorAiJson({
    system: compareQuizGenerationPrompt(language, count),
    user: JSON.stringify({
      products: (products || []).map((p) => ({
        title: p.title,
        url: p.url,
        category: p.category || 'unknown',
        store: p.siteName,
        initialScore: p.score,
        productContext: String(p.analysis || '').slice(0, 900),
      })),
      userProfile,
      variationSeed: variationSeed(),
    }),
    maxOutputTokens: 8192,
    temperature: 0.95,
  });
  return (Array.isArray(res.questions) ? res.questions : [])
    .map((q, i) => ({
      id: `cq${i}`,
      text: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    }))
    .filter((q) => q.text && q.options.length >= 2)
    .slice(0, count);
}

// ── Subscription quiz (same engine, subscription wording) ─────────
async function generateSubscriptionQuiz({ subscriptionNames, language, userProfile = {} }) {
  const isCompare = subscriptionNames.length > 1;
  const count = subscriptionQuizCount(subscriptionNames);
  const res = await askQorAiJson({
    system: subscriptionQuizPrompt(subscriptionNames.join(', '), isCompare, language, count),
    user: JSON.stringify({
      subscriptions: subscriptionNames,
      mode: isCompare ? 'compare' : 'single',
      userProfile,
      variationSeed: variationSeed(),
    }),
    maxOutputTokens: 8192,
    temperature: 0.95,
  });
  const questions = (Array.isArray(res.questions) ? res.questions : [])
    .map((q, i) => ({
      id: `sq${i}`,
      text: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    }))
    .filter((q) => q.text && q.options.length >= 2)
    .slice(0, count);
  return questions;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DERİN ANALİZ KATMANI (2026-08-08)
//  Link ve abonelik raporları "çok kısa" idi: tek AI çağrısı, sığ şema, hiç
//  gerçek internet taraması yok. Yeni akış app'in ai_report_service'i gibi:
//    1) GROUNDED ARAŞTIRMA  → Google Search ile gerçek yorum/şikâyet taraması
//    2) İKİ PARALEL RAPOR ÇAĞRISI → (A) kişisel karar, (B) topluluk + pazar
//  Araştırma, kullanıcı QUIZ'İ ÇÖZERKEN arka planda koşar (jobs katmanı onu
//  erken başlatır), böylece derinlik bedavaya gelir — bekleme süresi artmaz.
// ═══════════════════════════════════════════════════════════════════════════

// Yorum taraması her yerde aynı şeyi istesin diye tek yerde duruyor.
function communityResearchChecklist(langName) {
  return `Cover ALL of the following, as compact notes:
1) IDENTITY: what this exactly is (edition/variant), current market status, and the headline specs or plan details that actually matter.
2) COMMUNITY SENTIMENT — THE MAIN JOB: scan real user discussion (Reddit threads, YouTube review takeaways and their comment sections, retailer review patterns such as Amazon/Trendyol/Best Buy, specialist review sites, forums, app-store reviews). Extract the RECURRING THEMES, not one-off opinions. For each theme note: the theme, whether it is praise / complaint / mixed, and roughly how dominant it is (e.g. "mentioned in most threads" vs "occasional").
3) CHRONIC PROBLEMS — SEARCH FOR THESE ON PURPOSE: the failures owners report AFTER months of use, not the drawbacks visible on the spec sheet. Look for threads titled around a defect, "is anyone else having…", warranty/RMA experiences, a batch or production run with a known fault, a firmware/driver/app update that broke something and whether it was fixed. For each: what fails, how long into ownership it appears, whether a fix or workaround exists, and roughly how widespread it is (widespread / common / occasional). If you genuinely find none, say so — an absent problem is a real finding, an invented one is not.
4) OTHER COMPLAINTS: the remaining repeated negatives, regrets and after-sales/support problems, and whether they hit everyone or only a specific use case. Never soften them.
5) MOST-LOVED FEATURES: what owners bring up unprompted as the best part, and why it keeps coming up.
6) WHO LOVES IT vs WHO REGRETS IT: the usage profiles behind each side.
7) DEAL-BREAKERS: the things a buyer would be angry about not knowing beforehand.
8) ALTERNATIVES people actually compare it against, and why they switch.
9) VALUE / TIMING signal: discount cadence, a newer model or plan change on the horizon, or long-term cost drift. No invented exact prices.
Write in ${langName}. Do NOT invent direct quotes, exact review counts, or exact prices. Where evidence is thin, say plainly that it is thin.`;
}

// Tek ürün için derin yorum araştırması. Başarısız olursa '' döner — rapor
// yine yazılır (araştırma bir ZENGİNLEŞTİRME katmanıdır, zorunlu değil).
async function researchProductCommunity({ title, category, url, siteName, language }) {
  const langName = languageName(language);
  const name = String(title || '').trim();
  if (!name) return '';
  try {
    return await askQorAiGrounded(
      `Research the product "${name}"${category ? ` (category: ${category})` : ''} for a Qor AI buyer report.\n`
      + (url ? `Product URL: ${url}\n` : '')
      + (siteName ? `Store: ${siteName}\n` : '')
      + `\n${communityResearchChecklist(langName)}`,
      { language, maxOutputTokens: 3072, timeoutMs: 45000 },
    );
  } catch {
    return '';
  }
}

// Karşılaştırma: tek grounded çağrıda TÜM ürünler (ayrı ayrı çağrı kotayı
// gereksiz yakıyordu ve ürünler arası farkı hiçbir çağrı görmüyordu).
async function researchProductsCommunity({ bases = [], language }) {
  const langName = languageName(language);
  const rows = bases.filter((b) => b && b.title);
  if (!rows.length) return '';
  const list = rows
    .map((b, i) => `${i + 1}. ${b.title}${b.category ? ` (${b.category})` : ''}${b.siteName ? ` — ${b.siteName}` : ''}`)
    .join('\n');
  try {
    return await askQorAiGrounded(
      `Research these products for a Qor AI head-to-head comparison report:\n${list}\n\n`
      + `${communityResearchChecklist(langName)}\n\n`
      + `8) HEAD-TO-HEAD: after covering each product, state the decisive real-world differences between them and which owner profile ends up happier with which one.`,
      { language, maxOutputTokens: 4096, timeoutMs: 50000 },
    );
  } catch {
    return '';
  }
}

// Abonelikler: içerik/özellik değişimi, zam ve iptal sebepleri gerçek
// kullanıcı tartışmasından gelir — bu yüzden burada da grounded tarama var.
async function researchSubscriptionsCommunity({ names = [], language }) {
  const langName = languageName(language);
  const rows = names.filter(Boolean);
  if (!rows.length) return '';
  try {
    return await askQorAiGrounded(
      `Research these subscription services for a Qor AI subscription report: ${rows.join(', ')}.\n\n`
      + `${communityResearchChecklist(langName)}\n\n`
      + `8) SUBSCRIPTION SPECIFICS: recent catalogue/feature/plan changes, ad tiers, sharing and device limits, regional content gaps, app quality and reliability complaints, support quality, and the most common reasons people cancel or come back.`
      + `\n9) If several services are listed, end with the decisive differences between them for everyday use.`,
      { language, maxOutputTokens: 4096, timeoutMs: 50000 },
    );
  } catch {
    return '';
  }
}

// ── Katalog eşleşmesi ─────────────────────────────────────────────────────
// Kullanıcının yapıştırdığı ürün BİZDE de varsa raporun onu göstermesi ve o
// sayfaya bağlanması gerekiyor (fiyat, tech score, karşılaştırma). Aksi hâlde
// kullanıcı kendi kataloğumuzda duran ürünü dışarıya tıklayarak arıyor.
const CATALOG_STOP = new Set([
  'ile', 'için', 'and', 'the', 'with', 'for', 'gb', 'tb', 'mb', 'inch', 'inç',
  'akıllı', 'telefon', 'cep', 'kablosuz', 'siyah', 'beyaz', 'gri', 'mavi',
]);
function catalogTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()[\]{}",]/g, ' ')
    .split(/[\s/_-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !CATALOG_STOP.has(t));
}

// İki ad arasındaki örtüşme oranı (0-1). Marka + model kodu tuttuğunda yüksek.
function nameOverlap(a, b) {
  const ta = catalogTokens(a);
  const tb = new Set(catalogTokens(b));
  if (!ta.length || !tb.size) return 0;
  const hit = ta.filter((t) => tb.has(t)).length;
  return hit / ta.length;
}

// Katalogda bu ürünü ara. Eşleşme ZAYIFSA null döner — yanlış ürüne bağlamak,
// hiç bağlamamaktan kötüdür.
async function findCatalogMatch(title, { searchProducts, minScore = 0.55 } = {}) {
  const name = String(title || '').trim();
  if (!name || typeof searchProducts !== 'function') return null;
  let hits = [];
  try {
    hits = await searchProducts(name, 8);
  } catch {
    return null;
  }
  let best = null;
  for (const p of Array.isArray(hits) ? hits : []) {
    if (!p?.id || !p?.name) continue;
    // İki yönlü örtüşme: aday adı sorguyu, sorgu da aday adını karşılamalı.
    const score = Math.min(nameOverlap(name, p.name), nameOverlap(p.name, name) + 0.15);
    if (!best || score > best.score) best = { score, product: p };
  }
  return best && best.score >= minScore ? best.product : null;
}

// Araştırma quiz sırasında arka planda koşar; kullanıcı quizi ÇOK hızlı
// geçerse rapor onu bekler. Grounded arama takılırsa rapor sonsuza kadar
// beklemesin diye üst sınır koyuyoruz — araştırma zaten opsiyonel katman.
function awaitResearch(promise, ms = 75000) {
  if (!promise) return Promise.resolve('');
  return Promise.race([
    Promise.resolve(promise).then((v) => String(v || '')).catch(() => ''),
    new Promise((resolve) => { setTimeout(() => resolve(''), ms); }),
  ]);
}

// ── Şema normalleştiricileri ───────────────────────────────────────────────
// AI bazen düz string, bazen nesne döndürür; render tarafı tek şekil bekler.
function bulletList(v, max = 8) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return { title: x.trim(), detail: '' };
      if (x && typeof x === 'object') {
        return {
          title: String(x.title || x.label || x.point || '').trim(),
          detail: String(x.detail || x.impact || x.why || x.comment || '').trim(),
        };
      }
      return null;
    })
    .filter((x) => x && (x.title || x.detail))
    .map((x) => (x.title ? x : { title: x.detail, detail: '' }))
    .slice(0, max);
}

const SEVERITIES = new Set(['high', 'medium', 'low']);
function criticalList(v, max = 5) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return { severity: 'medium', title: x.trim(), detail: '' };
      if (!x || typeof x !== 'object') return null;
      const sev = String(x.severity || x.level || 'medium').toLowerCase();
      return {
        severity: SEVERITIES.has(sev) ? sev : 'medium',
        title: String(x.title || x.label || '').trim(),
        detail: String(x.detail || x.why || x.impact || '').trim(),
      };
    })
    .filter((x) => x && (x.title || x.detail))
    .slice(0, max);
}

const SENTIMENTS = new Set(['positive', 'negative', 'mixed']);
function themeList(v, max = 8) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const s = String(x.sentiment || x.tone || 'mixed').toLowerCase();
      return {
        label: String(x.label || x.theme || x.title || '').trim(),
        sentiment: SENTIMENTS.has(s) ? s : 'mixed',
        strength: Math.max(0, Math.min(100, Math.round(num(x.strength ?? x.share ?? x.weight)))),
        detail: String(x.detail || x.note || x.summary || '').trim(),
      };
    })
    .filter((x) => x && x.label)
    .map((x) => (x.strength > 0 ? x : { ...x, strength: 45 }))
    .slice(0, max);
}

/**
 * QUIZ KUNYESI YEDEGI — model uretmezse CEVAPLARDAN kurar.
 *
 * Abonelik raporunda `quiz_insights` AYRI bir "verdict" cagrisindan geliyor ve
 * o cagri `try/catch -> {}` ile sarili: patlarsa sessizce bos donuyor. Canli
 * ornek: Netflix analizinin TURKCESINDE 5 kunye satiri vardi, INGILIZCESINDE
 * hic yoktu — okuyucu "bu analiz hangi cevaplara gore yapildi" sorusunun
 * yanitini goremiyordu.
 *
 * Soru ve cevaplar ZATEN elimizde (`qaPairs`). Modelin katkisi `impact` ve
 * `note`; onlar yoksa da kunyenin KENDISI gosterilebilir. Bos bolum yerine
 * eksik bolum.
 */
function withFallback(liste, qaPairs) {
  return (liste && liste.length) ? liste : insightFallback(qaPairs);
}

function insightFallback(qaPairs) {
  return (Array.isArray(qaPairs) ? qaPairs : [])
    .map((qa) => ({
      topic: String((qa && (qa.question || qa.topic)) || '').trim().slice(0, 120),
      answer: String((qa && (qa.answer || qa.choice)) || '').trim(),
      impact: 0,   // model vermedi; sifir "etki bilinmiyor" demek, uydurma degil
      note: '',
    }))
    .filter((x) => x.topic && x.answer);
}

function insightList(v, max = 7) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const impact = Math.max(-100, Math.min(100, Math.round(num(x.impact ?? x.effect ?? x.delta))));
      return {
        topic: String(x.topic || x.question || x.about || '').trim(),
        answer: String(x.answer || x.choice || '').trim(),
        impact,
        note: String(x.note || x.detail || x.why || '').trim(),
      };
    })
    .filter((x) => x && (x.answer || x.note))
    .slice(0, max);
}

function sourceList(v, max = 10) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return { name: x.trim(), note: '' };
      if (x && typeof x === 'object') {
        return { name: String(x.name || x.source || x.type || '').trim(), note: String(x.note || x.detail || '').trim() };
      }
      return null;
    })
    .filter((x) => x && x.name)
    .slice(0, max);
}

function featureMatchList(v, max = 10) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      return {
        label: String(x.label || x.feature || '').trim(),
        productValue: String(x.productValue || x.value || '').trim(),
        userNeed: String(x.userNeed || x.need || '').trim(),
        score: Math.max(0, Math.min(100, Math.round(num(x.score)))),
        comment: String(x.comment || x.detail || '').trim(),
      };
    })
    .filter((x) => x && x.label)
    .slice(0, max);
}

// En yüksek ile en düşük puan arasındaki gerçek fark.
function computeScoreGap(scores) {
  const nums = (Array.isArray(scores) ? scores : []).map((x) => Number(x) || 0).filter((x) => x > 0);
  if (nums.length < 2) return 0;
  return Math.round(Math.max(...nums) - Math.min(...nums));
}

const DECISIONS = new Set(['buy', 'consider', 'skip']);
function decisionOf(v, score) {
  const d = String(v || '').toLowerCase().trim();
  if (DECISIONS.has(d)) return d;
  const s = Number(score) || 0;
  return s >= 70 ? 'buy' : s >= 50 ? 'consider' : 'skip';
}

// HİTAP BİRLİĞİ. Arayüzün tamamı "sen" diyor ("cevapların", "sana uyumu"),
// ama rapor metinleri "siz" ile geliyordu ("alışkanlıklarınızla", "abone
// olun") — aynı ekranda iki ayrı ses. Tek kural, tüm rapor promptlarında.
function addressRule(language) {
  const lang = String(language || 'en').slice(0, 2).toLowerCase();
  if (lang === 'tr') {
    return 'ADDRESS FORM — HARD RULE: address the reader informally in Turkish, in the "sen" form ("senin için", "alışkanlıklarına göre", "bunu al", "geç"). NEVER use the formal "siz" forms (no "-ınız/-iniz" possessives, no "olun/edersiniz/olmalısınız"). The whole interface speaks in "sen"; the report must match it.';
  }
  
  return 'ADDRESS FORM — HARD RULE: address the reader directly as "you"; never write "the user" or "the buyer" when you mean the reader.';
}

// Quiz etkisi puanlarının gerçekçi dağılması için ortak kural. İlk sürümde
// model her cevaba +90/+95 veriyordu; hepsi güçlü pozitif olunca bölüm hiçbir
// şey anlatmıyor.
const IMPACT_RULE = 'IMPACT VALUES: use the full range honestly. A typical answer nudges the verdict (|impact| 10-45); only an answer that genuinely decides the outcome earns |impact| above 70. Any answer that works AGAINST this choice MUST get a NEGATIVE impact, and a realistic quiz almost always has at least one. A list where every answer is a strong positive is not credible and is forbidden.';

// Araştırma notlarını prompt'a eklerken tek yerden geçir (boşsa "yok" de,
// böylece model uydurmak yerine belirsizliği yazar).
function researchBlock(research, langName) {
  const notes = String(research || '').trim();
  return notes
    ? `\n\nLIVE WEB / COMMUNITY RESEARCH NOTES (grounded Google Search, written in ${langName} — treat as the CURRENT truth and build the community sections on it):\n${notes.slice(0, 14000)}`
    : `\n\nLIVE WEB / COMMUNITY RESEARCH NOTES: none were available. Base the community sections on well-established, widely reported patterns only, and say plainly where the evidence is thin. Do NOT fabricate specific findings.`;
}

// ── Step 3: enhanced personalized analysis ────────────────────────
function enhancedAnalysisPrompt(language) {
  const langName = languageName(language);
  const isTr = String(language || '').slice(0, 2) === 'tr';
  const usageFit = isTr ? 'Kullanım Uyumu' : 'Usage Fit';
  const budgetMatch = isTr ? 'Bütçe Uyumu' : 'Budget Match';
  const qualityFit = isTr ? 'Kalite Uyumu' : 'Quality Fit';
  const futureProofing = isTr ? 'Uzun Vadeli Değer' : 'Long-term Value';
  const lifestyleMatch = isTr ? 'Yaşam Tarzı Uyumu' : 'Lifestyle Match';
  const featureFit = isTr ? 'Özellik Seti' : 'Feature Set';
  const reliabilityRisk = isTr ? 'Güvenilirlik ve Risk' : 'Reliability and Risk';
  const communitySignal = isTr ? 'Topluluk Sinyali' : 'Community Signal';
  return `You are Qor AI's senior product analyst. Given a product, the user's quiz answers, the user profile and live web/community research notes, produce the PERSONAL DECISION half of a comprehensive match report.

LANGUAGE: Write ALL text in ${langName}. Factor labels must also be in ${langName}.
${addressRule(language)}

CRITICAL — CATEGORY-AWARE ANALYSIS:
- The product can be ANY category: tech, books, clothing, home, sports, beauty, etc.
- For TECH products: analyze specs deeply — cite performance numbers, thermal behavior, software longevity, benchmark context.
- For BOOKS: discuss writing quality, pacing, reader reception, author credentials, genre positioning.
- For CLOTHING/HOME: discuss material science, build quality, brand heritage, durability.
- NEVER force tech terminology onto non-tech products.
- Adapt factor meanings and labels to the product category:
  • "${qualityFit}" = build/material/content quality (as appropriate)
  • "${futureProofing}" = durability/longevity/re-read value (as appropriate)

SCORING RULES:
- Score must reflect how well THIS SPECIFIC product matches THIS SPECIFIC user's exact needs.
- Scores MUST be realistic and differentiated. Never give identical scores.
- Poor match: 20-45. Average: 46-65. Good: 66-80. Excellent: 81-95.
- ANTI-INFLATION (critical): do NOT cluster scores near the top. Use the FULL range honestly. Every real product has genuine weak spots — AT LEAST 2 of the factor scores MUST fall below 65, and at least one below 55, unless this is a rare near-flawless fit for THIS user. Reserve 85+ only for true standout strengths, never as a default. If most factors land in 75-95 you are inflating — spread them out and score weak areas honestly. The enhancedScore must reflect this honest spread, not drift upward.

EVIDENCE RULES:
- The research notes are the CURRENT truth. Ground every concrete claim (weak spots, reliability, real-world behavior) in them where they cover it.
- Never invent direct quotes, exact review counts or exact live prices. Where evidence is thin, say so in the relevant field instead of guessing.

${IMPACT_RULE}

WRITING QUALITY REQUIREMENTS:
- Professional, tech-journalist level language. Specific over generic: cite real characteristics, measured behavior, ownership realities.
- Every "detail" field must add NEW information — never restate the label or the score in words.
- verdict = 3 paragraphs (~65 words each): what this product actually is, how it behaves in real use, and the ownership/value picture.
- personaAnalysis = 3 paragraphs (~55 words each) built strictly on the quiz answers and profile signals — never list the user's attributes back to them.
- Bullets are one tight sentence in "title" plus one concrete consequence in "detail".

Return valid JSON (all text in ${langName}):
{
  "enhancedScore": <0-100>,
  "confidence": <0-100 — how solid the evidence behind this verdict is; low when research was thin>,
  "decision": "buy | consider | skip",
  "headline": "ONE punchy sentence in ${langName} that answers 'should I get this?' for THIS user",
  "factors": [
    {"label": "${usageFit}", "score": <0-100>, "emoji": "🎯", "detail": "1 evidence-based sentence in ${langName} explaining WHY this score"},
    {"label": "${budgetMatch}", "score": <0-100>, "emoji": "💰", "detail": "1 sentence"},
    {"label": "${qualityFit}", "score": <0-100>, "emoji": "⭐", "detail": "1 sentence"},
    {"label": "${featureFit}", "score": <0-100>, "emoji": "🧩", "detail": "1 sentence"},
    {"label": "${reliabilityRisk}", "score": <0-100>, "emoji": "🛡", "detail": "1 sentence"},
    {"label": "${communitySignal}", "score": <0-100>, "emoji": "🌐", "detail": "1 sentence"},
    {"label": "${futureProofing}", "score": <0-100>, "emoji": "🚀", "detail": "1 sentence"},
    {"label": "${lifestyleMatch}", "score": <0-100>, "emoji": "🏠", "detail": "1 sentence"}
  ],
  "verdict": "3 paragraphs in ${langName} as described above. NO user attribute lists.",
  "prosForUser": [{"title": "short concrete strength", "detail": "1 sentence on what it changes in daily use for THIS user"}, "... 4-5 items total"],
  "consForUser": [{"title": "short concrete weakness", "detail": "1 sentence on the real-world impact and how often it bites"}, "... 3-4 items total"],
  "criticalPoints": [{"severity": "high|medium|low", "title": "the thing they would be angry not to know", "detail": "1-2 sentences: what happens, and who it actually affects"}, "... 3-4 items, at least one 'high' if a genuine deal-breaker exists"],
  "quizInsights": [{"topic": "2-4 word label of what the question probed, in ${langName}", "answer": "the option the user picked, shortened", "impact": <-100..100 — how much this answer pushed the score up or down>, "note": "1 sentence linking that answer to a concrete property of this product"}, "... one per meaningful quiz answer, 4-6 items"],
  "featureMatches": [{"label": "feature/spec in ${langName}", "productValue": "what this product offers", "userNeed": "what the quiz/profile implies they need", "score": <0-100>, "comment": "1 sentence"}, "... 5-7 items"],
  "personaScore": <0-100>,
  "personaAnalysis": "3 paragraphs in ${langName} — how this product fits their real life from the quiz answers. Reference the answers concretely. NEVER list user attributes by name.",
  "bestFor": "1-2 sentences in ${langName} describing the person this is genuinely great for",
  "notFor": "1-2 sentences in ${langName} describing who should walk away",
  "overallVerdict": "1 paragraph in ${langName} plus ONE final decisive sentence that clearly says buy, consider, or skip (with a concrete alternative if skip). NEVER mention user attributes by name."
}`;
}

// (B) Topluluk + pazar yarısı — GERÇEK internet taramasının döküldüğü yer.
// Ayrı çağrı olmasının sebebi: tek çağrıda bu derinlik JSON'u kesiliyordu
// (DeepSeek yedeği 8192 token'da kırpıyor) ve topluluk bölümü hep ilk feda
// edilen bölüm oluyordu.
function enhancedCommunityPrompt(language) {
  const langName = languageName(language);
  return `You are Qor AI's community-research analyst. You receive a product, the user's quiz answers, and live web/community research notes gathered with Google Search. Produce the COMMUNITY & MARKET half of the report.

LANGUAGE: Write ALL text in ${langName}.
${addressRule(language)}

RULES:
- Build EVERYTHING on the research notes when they cover it; they are the current truth. Where they are thin, say plainly that the evidence is limited — never fabricate findings, quotes, review counts or exact prices.
- A praise-only summary is FORBIDDEN. Recurring complaints must be stated as plainly as the praise.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH: "no complaints found" or "limited information" must never be presented as a positive theme or used to raise a score — say the evidence is thin and lower the confidence instead.
- FACTS ONLY FROM RESEARCH: availability, versions and plan details must come from the research notes; if they are not covered, omit them rather than recalling them from memory.
- "themes" are the topics people keep coming back to (battery, noise, sizing, support, ads, price hikes…), NOT one-off opinions. "strength" is roughly how dominant that theme is in the discussion (0-100).
- "chronicIssues" are what owners keep reporting AFTER living with it: failures that appear over months, a batch with a known defect, a firmware/driver issue that keeps returning, support that keeps disappointing. They are NOT the drawbacks anyone can read off the spec sheet or the price — those belong to the decision half of the report. If the research shows no recurring problem, return an empty array and say so in verificationNotes rather than promoting a spec-sheet drawback into this list.
- Sentiment percentages must be realistic and consistent with the themes: if half the themes are complaints, the split cannot be 90% positive.

Return valid JSON (all text in ${langName}):
{
  "communityScore": <0-100 — overall owner satisfaction>,
  "communityAnalysis": "3 paragraphs in ${langName}: (1) how it is received overall and what earns the praise, (2) the recurring complaints stated plainly with who they hit, (3) what long-term owners say after months of use. IGNORE the user profile here — this is about everyone.",
  "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>},
  "communityThemes": [{"label": "theme in ${langName}", "sentiment": "positive|negative|mixed", "strength": <0-100>, "detail": "1 sentence with the concrete substance of that theme"}, "... 5-7 themes, a realistic mix of positive and negative"],
  "lovedFeatures": [{"title": "what owners single out unprompted as the best part", "detail": "1 sentence on WHY it keeps coming up"}, "... 3-5 items"],
  "chronicIssues": [{"title": "recurring, well-documented problem", "detail": "1 sentence: what fails, when it shows up, whether there is a fix or workaround", "frequency": "widespread|common|occasional"}, "... 3-5 items, or an empty array when the research genuinely shows none"],
  "reliabilityNotes": ["1 sentence each in ${langName} on durability, failures, warranty/support experience — 2-3 items"],
  "sources": [{"name": "source or source type (Reddit, YouTube reviews, retailer reviews, specialist sites…)", "note": "what it contributed"}, "... 4-6 items — only source TYPES you actually relied on"],
  "alternatives": [{"name": "exact competing product name", "why": "1 sentence on who should take this instead"}, "... 3 items"],
  "priceOutlook": {"trend": "up|down|stable|unknown", "bestTime": "when it is smart to buy, in ${langName}", "note": "1-2 sentences on discount cadence, refresh cycle or long-term cost — no invented exact prices"},
  "verificationNotes": ["1 sentence each in ${langName}: what is well-evidenced vs what stayed uncertain — 2-3 items"]
}`;
}

function num(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// AI'dan gelen sentiment dağılımını {positive, neutral, negative} olarak okur;
// alan yok/bozuksa null döner (render tarafı satisfaction'dan türetir).
// Kronik sorun listesi — bulletList ile ayni, ama `frequency` KORUNUR
// (yayginlik rozeti onunla ciziliyor).
function issueList(raw, max) {
  return bulletList(raw, max).map((x, i) => {
    const ham = Array.isArray(raw) ? raw[i] : null;
    const f = String((ham && ham.frequency) || '').toLowerCase().trim();
    return {
      ...x,
      frequency: ['widespread', 'common', 'occasional'].includes(f) ? f : '',
    };
  });
}

function parseSentimentBreakdown(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const positive = Math.max(0, Math.round(num(raw.positive)));
  const neutral = Math.max(0, Math.round(num(raw.neutral)));
  const negative = Math.max(0, Math.round(num(raw.negative)));
  if (positive + neutral + negative <= 0) return null;
  return { positive, neutral, negative };
}

async function enhancedAnalysis({ base, answers, language, userProfile = {}, research = '' }) {
  const langName = languageName(language);
  const qaPairs = answers
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  const productPayload = {
    url: base.url,
    title: base.title,
    category: base.category,
    siteName: base.siteName,
    initialScore: base.score,
    initialAnalysis: base.analysis,
  };
  const userJson = JSON.stringify({ product: productPayload, quizAnswers: qaPairs, userProfile });

  // İki yarı PARALEL koşar: karar yarısı kritik (hata → analiz başarısız),
  // topluluk yarısı zenginleştirme (hata → rapor yine çıkar, sadece daha sade).
  const corePromise = (async () => askQorAiJson({
    // Shared admin override key with the app (graceful fallback if unset).
    system: (await adminPrompt('gemini_enhanced_link_analysis_system', enhancedAnalysisPrompt(language)))
      + researchBlock(research, langName),
    user: userJson,
    maxOutputTokens: 8192,
  }))();
  const communityPromise = (async () => {
    try {
      return await askQorAiJson({
        system: enhancedCommunityPrompt(language) + researchBlock(research, langName),
        user: userJson,
        maxOutputTokens: 8192,
      });
    } catch {
      return {};
    }
  })();
  const [res, com] = await Promise.all([corePromise, communityPromise]);

  const factors = (Array.isArray(res.factors) ? res.factors : [])
    .map((f) => ({
      label: String(f.label || f.name || ''),
      score: num(f.score ?? f.value),
      emoji: String(f.emoji || f.icon || '📊'),
      detail: String(f.detail || f.comment || ''),
    }))
    .filter((f) => f.label);
  const enhancedScore = num(res.enhancedScore ?? res.enhanced_score ?? res.score);
  const score = enhancedScore > 0 ? enhancedScore : base.score;
  const alternatives = Array.isArray(com.alternatives) && com.alternatives.length
    ? com.alternatives
    : res.alternatives;
  const priceOutlook = com.priceOutlook && typeof com.priceOutlook === 'object' ? {
    trend: String(com.priceOutlook.trend || 'unknown').toLowerCase(),
    bestTime: String(com.priceOutlook.bestTime || ''),
    note: String(com.priceOutlook.note || ''),
  } : null;
  return {
    base,
    enhancedScore: score,
    confidence: Math.max(0, Math.min(100, Math.round(num(res.confidence)))) || (research ? 78 : 58),
    decision: decisionOf(res.decision, score),
    headline: String(res.headline || ''),
    factors,
    verdict: String(res.verdict || res.detailed_verdict || res.analysis || base.analysis || ''),
    prosForUser: bulletList(res.prosForUser || res.pros, 6),
    consForUser: bulletList(res.consForUser || res.cons, 5),
    criticalPoints: criticalList(res.criticalPoints, 5),
    quizInsights: withFallback(insightList(res.quizInsights, 7), qaPairs),
    featureMatches: featureMatchList(res.featureMatches, 8),
    alternatives: bulletList(
      Array.isArray(alternatives)
        ? alternatives.map((a) => (a && typeof a === 'object' ? { title: a.name || a.title, detail: a.why || a.detail } : a))
        : [],
      4,
    ),
    bestFor: String(res.bestFor || ''),
    notFor: String(res.notFor || ''),
    personaScore: num(res.personaScore) || null,
    personaAnalysis: res.personaAnalysis ? String(res.personaAnalysis) : '',
    communityScore: num(com.communityScore ?? res.communityScore) || null,
    communityAnalysis: String(com.communityAnalysis || res.communityAnalysis || ''),
    sentimentBreakdown: parseSentimentBreakdown(
      com.sentimentBreakdown || com.sentiment_breakdown || res.sentimentBreakdown || res.sentiment_breakdown,
    ),
    communityThemes: themeList(com.communityThemes, 8),
    // Forum bulgulari. `praisePoints`/`complaintPoints` ESKI adlar — artik
    // uretilmiyorlar ama eski kayitlar hala tasiyor, o yuzden okunuyorlar.
    // Yeni adlar ayirt edici: "loved" = sahiplerin one cikardigi, "chronic" =
    // sahiplik sonrasi TEKRAR EDEN sorun (spec sayfasindan okunabilen eksi
    // degil — o zaten raporun karar yarisinda).
    lovedFeatures: bulletList(com.lovedFeatures || com.praisePoints, 5),
    chronicIssues: issueList(com.chronicIssues || com.complaintPoints, 5),
    reliabilityNotes: bulletList(com.reliabilityNotes, 4),
    sources: sourceList(com.sources, 8),
    verificationNotes: bulletList(com.verificationNotes, 4),
    priceOutlook,
    researched: Boolean(String(research || '').trim()),
    overallVerdict: res.overallVerdict ? String(res.overallVerdict) : '',
  };
}

function compareAnalysisPrompt(language) {
  const langName = languageName(language);
  const factorLabels = compareFactorLabels(language);
  const factorEmojis = ['🎯', '⚡', '⭐', '🧩', '🧭', '🛡', '🌐', '🚀'];
  const factorSchema = factorLabels
    .map((label, i) => `        {"label": "${label}", "score": 0, "emoji": "${factorEmojis[i] || '📊'}", "detail": "1 sentence"}`)
    .join(',\n');
  return `You are Qor AI's senior product comparison analyst. Produce the PER-PRODUCT half of a head-to-head comparison report.

LANGUAGE: Write ALL text fields in ${langName}. Keep official product names as-is.
${addressRule(language)}

You will receive exact products identified from pasted URLs, the user's comparison quiz answers, and live web/community research notes.

Rules:
- Never replace the products with nearby models. Use the exact product titles and URLs given to you.
- Judge every product AGAINST THE OTHERS, not in isolation: the same trait can be a strength here and a weakness there.
- Ground concrete claims in the research notes. Never invent quotes, review counts or live prices. Where evidence is thin, say so.
- NEVER paste raw long URLs in text fields. Use product names and site domains only.
- Scores must be realistic, varied and driven by THIS user's quiz answers. Two products must NEVER get the same score.
- ANTI-INFLATION: every product has real weak spots — at least 2 factors per product below 65, and reserve 85+ for genuine standouts.
- Every product must have factor scores for: ${factorLabels.join(', ')}.
- A praise-only community section is FORBIDDEN — state the recurring complaints plainly.

Return ONLY valid JSON with this exact structure:
{
  "products": [
    {
      "name": "exact product title",
      "url": "exact input url",
      "siteName": "domain or store",
      "score": 0,
      "rank": 1,
      "bestFor": "2 sentences in ${langName} on the person this one is genuinely for",
      "summary": "3 sentences in ${langName}: what it is, how it behaves in real use, where it lands versus the others",
      "pros": [{"title": "short strength", "detail": "1 sentence on what it changes in daily use"}, "... 3-4 items"],
      "cons": [{"title": "short weakness", "detail": "1 sentence on the real-world impact"}, "... 3 items"],
      "risks": ["2-3 ownership/community risks in ${langName}, one sentence each"],
      "criticalPoints": [{"severity": "high|medium|low", "title": "what a buyer must know first", "detail": "1-2 sentences"}, "... 2-3 items"],
      "factors": [
${factorSchema}
      ],
      "specHighlights": [
        {"label": "short spec label in ${langName}", "value": "short known/inferred value or uncertainty note"}
      ],
      "community": "2 short paragraphs in ${langName}: reception and praise first, then the recurring complaints stated plainly",
      "communityThemes": [{"label": "theme in ${langName}", "sentiment": "positive|negative|mixed", "strength": <0-100>, "detail": "1 sentence"}, "... 3-5 themes"],
      "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}
    }
  ]
}

Rules for factors: 8 entries per product, each with a "detail" sentence that explains the score with evidence — never a restatement of the label. specHighlights: 4-6 entries.`;
}

// Karşılaştırmanın ikinci yarısı: kazanan + belirleyici farklar + quiz etkisi.
// Ayrı çağrı, çünkü ürün kartları + kapsamlı karşılaştırma metni tek JSON'a
// sığmıyor (DeepSeek yedeği 8192 token'da kesiyordu).
function compareVerdictPrompt(language, names = []) {
  const langName = languageName(language);
  return `You are Qor AI's senior comparison analyst. The per-product sections are already written. Produce ONLY the cross-product VERDICT half of the report.

LANGUAGE: Write ALL text fields in ${langName}. Keep official product names as-is.
${addressRule(language)}

Rules:
- "winner.best" MUST be exactly one of: ${names.join(' | ')}.
- ${IMPACT_RULE}
- Be decisive. Vague "both are good" answers are forbidden — name the winner and the exact conditions under which the other one wins instead.
- Ground concrete claims in the live research notes; never invent quotes, review counts or live prices.
- Tie every recommendation back to the user's quiz answers, without reading their profile back to them.

Return ONLY valid JSON:
{
  "winner": {
    "best": "exact product title",
    "reason": "3 sentences in ${langName} on why it wins FOR THIS USER",
    "scoreGap": <integer difference between best and weakest>,
    "runnerUpCase": "1-2 sentences in ${langName}: when the other product is the smarter buy instead"
  },
  "confidence": <0-100 — how solid the evidence behind this verdict is>,
  "decisiveDifferences": [{"title": "the difference in ${langName}", "detail": "1-2 sentences on which product wins it and what it changes in practice"}, "... 4-6 items"],
  "quizInsights": [{"topic": "2-4 word label of what the question probed", "answer": "the option the user picked, shortened", "impact": <-100..100 — how strongly it pushed the winner ahead (+) or held it back (-)>, "note": "1 sentence tying that answer to a concrete difference between the products"}, "... 4-6 items"],
  "detailed": {
    "fit": "2 paragraphs in ${langName} comparing quiz-based fit",
    "performance": "2 paragraphs in ${langName} comparing performance, specs and real-world behavior",
    "ownership": "2 paragraphs in ${langName} comparing durability, support, community risk and long-term cost",
    "community": "2 paragraphs in ${langName} comparing what owners of each actually report — complaints included",
    "recommendation": "2 paragraphs in ${langName} with the clear final decision and what to do if the winner is unavailable"
  },
  "recommendation": "3-4 sentence final summary in ${langName} ending with a plain instruction"
}`;
}

async function compareAnalysis({ bases, answers, language, userProfile = {}, research = '' }) {
  const langName = languageName(language);
  const factorLabels = compareFactorLabels(language);
  const factorEmojis = ['🎯', '⚡', '⭐', '🧩', '🧭', '🛡', '🌐', '🚀'];
  const qaPairs = (answers || [])
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  const names = (bases || []).map((p) => p.title).filter(Boolean);
  const userJson = JSON.stringify({
    products: (bases || []).map((p, i) => ({
      index: i + 1,
      url: p.url,
      title: p.title,
      category: p.category,
      siteName: p.siteName,
      initialScore: p.score,
      initialAnalysis: p.analysis,
    })),
    quizAnswers: qaPairs,
    userProfile,
  });
  // Ürün kartları (kritik) + karşılaştırma kararı (zenginleştirme) paralel.
  const [res, verdictRes] = await Promise.all([
    askQorAiJson({
      system: compareAnalysisPrompt(language) + researchBlock(research, langName),
      user: userJson,
      maxOutputTokens: 12288,
    }),
    (async () => {
      try {
        return await askQorAiJson({
          system: compareVerdictPrompt(language, names) + researchBlock(research, langName),
          user: userJson,
          maxOutputTokens: 8192,
        });
      } catch {
        return {};
      }
    })(),
  ]);
  const rawProducts = Array.isArray(res.products) ? res.products : [];
  const sourceProducts = (bases || []).length
    ? (bases || []).map((base, i) => rawProducts.find((p) => p?.url && p.url === base.url) || rawProducts[i] || {})
    : rawProducts;
  const products = sourceProducts
    .map((p, i) => {
      const base = (bases || [])[i] || {};
      const score = num(p.score) || num(base.score) || 50;
      const rawFactors = Array.isArray(p.factors) ? p.factors.map((f) => ({
        label: String(f?.label || ''),
        score: num(f?.score ?? f?.value),
        emoji: String(f?.emoji || '📊'),
        detail: String(f?.detail || ''),
      })).filter((f) => f.label) : [];
      const factors = rawFactors.length ? rawFactors : factorLabels.map((label, j) => ({
        label,
        score,
        emoji: factorEmojis[j] || '📊',
        detail: '',
      }));
      const specHighlights = Array.isArray(p.specHighlights) ? p.specHighlights.map((s) => ({
        label: String(s?.label || ''),
        value: String(s?.value || ''),
      })).filter((s) => s.label || s.value) : [];
      return {
        name: String(p.name || base.title || `Product ${i + 1}`),
        url: String(p.url || base.url || ''),
        siteName: String(p.siteName || base.siteName || ''),
        score,
        rank: num(p.rank) || i + 1,
        bestFor: String(p.bestFor || ''),
        summary: String(p.summary || base.analysis || ''),
        pros: bulletList(p.pros, 5),
        cons: bulletList(p.cons, 4),
        risks: bulletList(p.risks, 4),
        criticalPoints: criticalList(p.criticalPoints, 4),
        factors,
        specHighlights,
        community: String(p.community || ''),
        communityThemes: themeList(p.communityThemes, 6),
        sentiment: parseSentimentBreakdown(p.sentimentBreakdown || p.sentiment_breakdown),
      };
    });
  products.sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const rawWinner = (verdictRes.winner && typeof verdictRes.winner === 'object')
    ? verdictRes.winner
    : (res.winner && typeof res.winner === 'object' ? res.winner : null);
  const winner = rawWinner ? {
    best: String(rawWinner.best || products[0]?.name || ''),
    reason: String(rawWinner.reason || ''),
    scoreGap: computeScoreGap(products.map((x) => x.score)),
    runnerUpCase: String(rawWinner.runnerUpCase || ''),
  } : { best: products[0]?.name || '', reason: '', scoreGap: 0, runnerUpCase: '' };
  const rawDetailed = (verdictRes.detailed && typeof verdictRes.detailed === 'object')
    ? verdictRes.detailed
    : (res.detailed && typeof res.detailed === 'object' ? res.detailed : null);
  const detailed = rawDetailed ? {
    fit: String(rawDetailed.fit || ''),
    performance: String(rawDetailed.performance || ''),
    ownership: String(rawDetailed.ownership || ''),
    community: String(rawDetailed.community || ''),
    recommendation: String(rawDetailed.recommendation || ''),
  } : null;
  return {
    type: 'compare_structured',
    isCompare: true,
    bases,
    answers,
    winner,
    products,
    scores: Object.fromEntries(products.map((p) => [p.name, p.score])),
    detailed,
    decisiveDifferences: bulletList(verdictRes.decisiveDifferences, 6),
    quizInsights: withFallback(insightList(verdictRes.quizInsights, 7), qaPairs),
    confidence: Math.max(0, Math.min(100, Math.round(num(verdictRes.confidence)))) || (research ? 76 : 56),
    researched: Boolean(String(research || '').trim()),
    recommendation: String(verdictRes.recommendation || res.recommendation || detailed?.recommendation || winner.reason || ''),
  };
}

// ── Subscription analysis ─────────────────────────────────────────
// Mirrors the app's GeminiService.enhancedSubscriptionAnalysis structured
// schema (subscriptions / winner / recommendation). The app runs a googleSearch
// research pass first; the web proxy can't ground, so we analyze directly and
// let the model lean on its own knowledge.
function subscriptionAnalysisPrompt(names, count, isCompare, qaPairs, language) {
  const langName = languageName(language);
  const factorDefs = subscriptionFactorDefinitions(language);
  const factorSchema = factorDefs
    .map((f) => `        "${f.key}": {"score": "integer 0-100", "detail": "1 evidence-based sentence in ${langName} explaining this ${f.label} score"}`)
    .join(',\n');
  const quizText = qaPairs.length
    ? qaPairs.map((q) => `- ${q.question}: ${q.answer}`).join('\n')
    : '- (no quiz answers provided)';
  return `You are Qor AI's subscription intelligence analyst. Produce the PER-SERVICE half of a subscription report.
Analyze: ${names}

Quiz Answers:
${quizText}

CRITICAL RULES:
- ALL text values MUST be in ${langName} language
- ${addressRule(language)}
- The "subscriptions" object MUST contain exactly ${count} entries, one for EACH of: ${names}
- You MUST complete ALL ${count} service entries. Do not stop early or truncate.
- compatibility_score must be an integer 0-100 based on how well it fits THIS specific user${isCompare ? '. Two services must NEVER get the same score.' : ''}
- factors are 0-100 integers and MUST include every factor key shown in the schema, each with a one-sentence "detail" that explains the score with evidence — never a restatement of the label
- ANTI-INFLATION: do NOT cluster factor scores near the top. Each service has real weak spots — at least 2 factors per service should fall below 65, and reserve 85+ only for genuine standout strengths. Identical high scores across factors are unrealistic.

VENDOR NEUTRALITY — HARD RULE (this analysis runs on a model that may BE one of the compared services, or be made by the company that owns one):
- Your own identity, your maker, and how familiar a service feels to you must have ZERO effect on the scores. Judge every service against the same evidence bar.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH. "No complaints found", "limited community information" or "no known issues" must NEVER raise a score, appear as a positive theme, or justify a high risk/community score. When the research is thin for a service, say the evidence is thin, LOWER the confidence, and score that factor in the middle band — never at the top.
- Every service must get at least two genuinely weak factors stated as plainly as the leader's. A profile where one service is best on EVERY factor is a red flag: re-check it and correct the inflation.
- FACTS ONLY FROM RESEARCH: regional availability, plan names, model names/versions and pricing tiers change constantly. State them ONLY if the research notes cover them. If they do not, omit the claim entirely — never fill it from memory.

- COMMUNITY WORK IS THE CORE: build the community fields on the live research notes. Recurring complaints (price hikes, ad tiers, catalogue removals, sharing limits, app bugs, support) must be stated as plainly as the praise. A positives-only summary is FORBIDDEN.
- "themes" are topics people keep returning to, not one-off opinions; "strength" is roughly how dominant that topic is in the discussion.
- sentiment_breakdown values are integer percentages summing to ~100, realistic and consistent with the themes
- Never invent quotes, exact review counts or exact prices. Where the research is thin, say so.
- Be specific and personalized to the quiz answers and the user profile, not generic
- chronic_issues are what subscribers keep reporting over MONTHS — an app that keeps crashing on one platform, a library that keeps shrinking, streams that keep failing at peak, support tickets that keep going nowhere. They are NOT the same as "cons": a con is a design trade-off anyone can see on the plan page, a chronic issue only surfaces after living with the service. Never repeat a con here.
- NEVER mention price, cost, affordability, monthly fees, yearly fees, discounts, or billing

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
{
  "subscriptions": {
    "${isCompare ? '<service_name>' : names}": {
      "category": "string - service category label in ${langName}",
      "rank": "integer starting at 1",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 3 sentences on why this score, tied to the quiz answers",
      "pros": [{"title": "short strength", "detail": "1 sentence on what it changes in everyday use"}, "... 3-4 items"],
      "cons": [{"title": "short weakness", "detail": "1 sentence on the real-world impact"}, "... 3 items"],
      "risks": ["2-3 churn/ownership risk sentences in ${langName}"],
      "critical_points": [{"severity": "high|medium|low", "title": "what they must know before subscribing", "detail": "1-2 sentences"}, "... 2-3 items"],
      "notable_features": [{"label": "short feature label", "value": "short feature detail"}, "... 4-6 items"],
      "community_sentiment": "string - 3 short paragraphs of Reddit/forum/reviewer/app-store synthesis: reception, then the recurring complaints plainly, then what long-term subscribers say",
      "community_themes": [{"label": "theme in ${langName}", "sentiment": "positive|negative|mixed", "strength": "integer 0-100", "detail": "1 sentence"}, "... 4-6 themes with a realistic positive/negative mix"],
      "sentiment_breakdown": {"positive": "int", "neutral": "int", "negative": "int"},
      "sources": [{"name": "source type you relied on", "note": "what it contributed"}, "... 3-5 items"],
      "cancel_reasons": ["2-3 one-sentence reasons people actually cancel this, in ${langName}"],
      "loved_features": [{"title": "what subscribers single out unprompted as the best part", "detail": "1 sentence on why it keeps coming up"}, "... 3-4 items"],
      "chronic_issues": [{"title": "recurring, well-documented problem", "detail": "1 sentence: what keeps breaking or disappointing, and whether support fixes it", "frequency": "widespread|common|occasional"}, "... 2-4 items, or an empty array when the research genuinely shows none"],
      "best_for": "string - 2 sentences on the ideal subscriber and usage context",
      "not_for": "string - 1-2 sentences on who should skip it",
      "factors": {
${factorSchema}
      }
    }
  }
}`;
}

// Aboneliğin ikinci yarısı: kazanan + kullanım planı + quiz etkisi.
function subscriptionVerdictPrompt(names, isCompare, language) {
  const langName = languageName(language);
  return `You are Qor AI's subscription intelligence analyst. The per-service sections are already written. Produce ONLY the VERDICT half of the report for: ${names}.

LANGUAGE: ALL text values MUST be in ${langName}.
${addressRule(language)}


VENDOR NEUTRALITY — HARD RULE (this analysis runs on a model that may BE one of the compared services, or be made by the company that owns one):
- Your own identity, your maker, and how familiar a service feels to you must have ZERO effect on the scores. Judge every service against the same evidence bar.
- ABSENCE OF EVIDENCE IS NOT A STRENGTH. "No complaints found", "limited community information" or "no known issues" must NEVER raise a score, appear as a positive theme, or justify a high risk/community score. When the research is thin for a service, say the evidence is thin, LOWER the confidence, and score that factor in the middle band — never at the top.
- Every service must get at least two genuinely weak factors stated as plainly as the leader's. A profile where one service is best on EVERY factor is a red flag: re-check it and correct the inflation.
- FACTS ONLY FROM RESEARCH: regional availability, plan names, model names/versions and pricing tiers change constantly. State them ONLY if the research notes cover them. If they do not, omit the claim entirely — never fill it from memory.

Rules:
- ${IMPACT_RULE}
- Be decisive and personal: tie everything to the user's quiz answers without reading their profile back to them.
- ${isCompare ? `"winner.overall" MUST be exactly one of: ${names}.` : 'There is a single service — judge whether it is worth keeping/subscribing and under what conditions.'}
- Ground concrete claims in the live research notes. Never invent quotes, exact review counts or prices.
- NEVER mention price, cost, monthly/yearly fees, discounts or billing.

Return ONLY valid JSON:
{
  ${isCompare ? `"winner": {
    "best_content": "string - service name with the strongest catalogue/feature depth",
    "overall": "string - the service to actually pick",
    "reason": "string - 3 sentences on why it wins FOR THIS USER",
    "score_gap": "integer gap between strongest and weakest",
    "runner_up_case": "string - 1-2 sentences on when the other one is the smarter pick",
    "recommendation": "string - 2 short paragraphs with the final decision and trade-offs"
  },` : ''}
  "confidence": "integer 0-100 - how solid the evidence behind this verdict is",
  "decisive_differences": [{"title": "the difference in ${langName}", "detail": "1-2 sentences on who wins it and what it changes in practice"}, "... ${isCompare ? '4-6' : '3-4'} items"],
  "quiz_insights": [{"topic": "2-4 word label of what the question probed", "answer": "the option the user picked, shortened", "impact": "integer -100..100 - how strongly this answer pushed the verdict", "note": "1 sentence tying the answer to a concrete property of the service"}, "... 4-6 items"],
  "detailed_comparison": {
    "service_fit_summary": "string - 2 paragraphs on overall fit",
    "feature_comparison": "string - 2 paragraphs on features, catalogue and use cases",
    "user_experience": "string - 2 paragraphs on apps, reliability and everyday usage",
    "community_and_risk": "string - 2 paragraphs on review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS users report (ad tiers, catalogue removals, sharing limits, reliability, support) — never a positives-only summary.",
    "final_plan": "string - 2 paragraphs: a concrete usage plan for the coming months, including what to watch for and when to reconsider"
  },
  "recommendation": "string - 3-4 sentences of personalized final recommendation ending with a plain instruction"
}`;
}

async function subscriptionAnalysis({ subscriptionNames, answers, language, userProfile = {}, research = '' }) {
  const isCompare = subscriptionNames.length > 1;
  const names = subscriptionNames.join(', ');
  const langName = languageName(language);
  const factorDefs = subscriptionFactorDefinitions(language);
  const factorByKey = Object.fromEntries(factorDefs.map((f) => [f.key, f]));
  const qaPairs = (answers || [])
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  const userJson = JSON.stringify({
    subscriptions: subscriptionNames,
    mode: isCompare ? 'compare' : 'single',
    quizAnswers: qaPairs,
    userProfile,
  });
  // The AI request helper already backs off and retries on 429/5xx internally.
  // Servis kartları (kritik) + karar/plan (zenginleştirme) paralel koşar.
  const [res, verdictRes] = await Promise.all([
    (async () => askQorAiJson({
      // Shared admin override key with the app (graceful fallback if unset).
      system: (await adminPrompt(
        'gemini_subscription_analysis',
        subscriptionAnalysisPrompt(names, subscriptionNames.length, isCompare, qaPairs, language),
      )) + researchBlock(research, langName),
      user: userJson,
      maxOutputTokens: 12288,
    }))(),
    (async () => {
      try {
        return await askQorAiJson({
          system: subscriptionVerdictPrompt(names, isCompare, language) + researchBlock(research, langName),
          user: userJson,
          maxOutputTokens: 8192,
        });
      } catch {
        return {};
      }
    })(),
  ]);
  const subsRaw = res.subscriptions && typeof res.subscriptions === 'object' ? res.subscriptions : {};
  const lookup = new Map(Object.entries(subsRaw).map(([name, d]) => [String(name).toLowerCase(), { name, d }]));
  const services = (subscriptionNames || []).map((inputName, i) => {
    const found = lookup.get(String(inputName).toLowerCase())
      || [...lookup.values()].find((x) => String(x.name).toLowerCase().includes(String(inputName).toLowerCase()))
      || { name: inputName, d: {} };
    const d = found.d || {};
    const score = num(d?.compatibility_score) || 55;
    const rawFactors = d?.factors && typeof d.factors === 'object'
      ? Object.entries(d.factors).map(([key, v]) => {
        const def = factorByKey[key] || {};
        // Şema artık {score, detail} nesnesi istiyor; eski düz sayı formatı da
        // (ve admin panelinden gelen eski prompt override'ı da) çalışmaya devam eder.
        const obj = v && typeof v === 'object' ? v : null;
        return {
          key,
          label: def.label || String(key).replace(/_/g, ' '),
          emoji: def.emoji || '📊',
          score: num(obj ? (obj.score ?? obj.value) : v) || score,
          detail: obj ? String(obj.detail || obj.comment || '') : '',
        };
      })
      : [];
    const factors = rawFactors.length ? rawFactors : factorDefs.map((f) => ({
      key: f.key,
      label: f.label,
      emoji: f.emoji,
      score,
      detail: '',
    }));
    const features = Array.isArray(d?.notable_features) ? d.notable_features.map((x) => ({
      label: String(x?.label || ''),
      value: String(x?.value || ''),
    })).filter((x) => x.label || x.value) : [];
    return {
      name: String(found.name || inputName),
      category: String(d?.category || ''),
      score,
      rank: num(d?.rank) || i + 1,
      explanation: String(d?.compatibility_explanation || ''),
      pros: bulletList(d?.pros, 5),
      cons: bulletList(d?.cons, 4),
      risks: bulletList(d?.risks, 4),
      criticalPoints: criticalList(d?.critical_points || d?.criticalPoints, 4),
      features,
      community: String(d?.community_sentiment || ''),
      communityThemes: themeList(d?.community_themes || d?.communityThemes, 6),
      sources: sourceList(d?.sources, 6),
      cancelReasons: bulletList(d?.cancel_reasons || d?.cancelReasons, 4),
      // Forum bulgulari — abonelikte de ayni ayrim: `cons` plan
      // sayfasindan okunabilen takas, `chronicIssues` aylar sonra cikan
      // ve tekrar eden sorun.
      lovedFeatures: bulletList(d?.loved_features || d?.lovedFeatures, 5),
      chronicIssues: issueList(d?.chronic_issues || d?.chronicIssues, 5),
      sentiment: parseSentimentBreakdown(d?.sentiment_breakdown || d?.sentimentBreakdown),
      bestFor: String(d?.best_for || ''),
      notFor: String(d?.not_for || d?.notFor || ''),
      factors,
    };
  }).sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.score - a.score);
  const scores = {};
  services.forEach((s) => { scores[s.name] = s.score; });
  const bestByScore = [...services].sort((a, b) => b.score - a.score)[0]?.name || '';
  const rawWinner = (verdictRes.winner && typeof verdictRes.winner === 'object')
    ? verdictRes.winner
    : (res.winner && typeof res.winner === 'object' ? res.winner : null);
  const rawDetailed = (verdictRes.detailed_comparison && typeof verdictRes.detailed_comparison === 'object')
    ? verdictRes.detailed_comparison
    : (res.detailed_comparison && typeof res.detailed_comparison === 'object' ? res.detailed_comparison : null);
  return {
    isCompare,
    services,
    scores,
    winner: rawWinner ? {
      best: String(rawWinner.best_content || rawWinner.overall || bestByScore || ''),
      overall: String(rawWinner.overall || ''),
      reason: String(rawWinner.reason || ''),
      // Fark AI'dan DEĞİL veriden gelir: model "score_gap" alanına en düşük
      // puanı yazıp 92/80/70/60 için "70" döndürebiliyordu.
      scoreGap: computeScoreGap(services.map((x) => x.score)),
      runnerUpCase: String(rawWinner.runner_up_case || rawWinner.runnerUpCase || ''),
      recommendation: String(rawWinner.recommendation || ''),
    } : { best: bestByScore, overall: bestByScore, reason: '', scoreGap: 0, runnerUpCase: '', recommendation: '' },
    detailed: rawDetailed ? {
      fit: String(rawDetailed.service_fit_summary || ''),
      features: String(rawDetailed.feature_comparison || ''),
      ux: String(rawDetailed.user_experience || ''),
      community: String(rawDetailed.community_and_risk || ''),
      plan: String(rawDetailed.final_plan || ''),
    } : null,
    decisiveDifferences: bulletList(verdictRes.decisive_differences || verdictRes.decisiveDifferences, 6),
    quizInsights: withFallback(insightList(verdictRes.quiz_insights || verdictRes.quizInsights, 7), qaPairs),
    confidence: Math.max(0, Math.min(100, Math.round(num(verdictRes.confidence)))) || (research ? 76 : 56),
    researched: Boolean(String(research || '').trim()),
    recommendation: String(verdictRes.recommendation || res.recommendation || rawWinner?.recommendation || ''),
  };
}

// Same-category enforcement — only services of the same type can be compared,
// mirroring SubQuizNotifier.validateSubscriptionSelection in the app.
const SUB_CATEGORY = {
  netflix: 'video', 'disney+': 'video', 'disney plus': 'video', 'amazon prime': 'video',
  'prime video': 'video', hbo: 'video', 'hbo max': 'video', max: 'video', hulu: 'video',
  'apple tv+': 'video', 'apple tv plus': 'video', blutv: 'video', exxen: 'video', gain: 'video',
  mubi: 'video', 'youtube premium': 'video', crunchyroll: 'video', 'bein sports': 'video',
  tod: 'video', 'paramount+': 'video', 'paramount plus': 'video', peacock: 'video', tabii: 'video',
  'tv+': 'video',
  spotify: 'music', 'apple music': 'music', 'youtube music': 'music', tidal: 'music',
  deezer: 'music', 'amazon music': 'music', fizy: 'music', soundcloud: 'music', 'soundcloud go': 'music',
  'chatgpt plus': 'ai', 'chatgpt': 'ai', 'claude pro': 'ai', claude: 'ai', gemini: 'ai',
  'gemini advanced': 'ai', perplexity: 'ai', midjourney: 'ai', copilot: 'ai',
  'microsoft copilot': 'ai', grok: 'ai', deepseek: 'ai', poe: 'ai',
  icloud: 'cloud', 'icloud+': 'cloud', 'google one': 'cloud', dropbox: 'cloud', onedrive: 'cloud',
  pcloud: 'cloud', mega: 'cloud',
  // Creative/design/professional software lives under 'productivity' (app
  // parity — the app has no separate 'creative' bucket), so Adobe, Canva,
  // Figma, DaVinci etc. all compare against each other.
  'adobe creative cloud': 'productivity', canva: 'productivity', figma: 'productivity',
  'microsoft 365': 'productivity', 'office 365': 'productivity', notion: 'productivity',
  'google workspace': 'productivity',
  // Web hosting / domain / site services — ONE shared category so Hostinger,
  // Cloudflare, GoDaddy etc. compare against each other (app parity: 'web-hosting').
  // Previously hostinger was 'other' and Cloudflare was absent → mixed-category
  // rejection of an obviously valid comparison.
  hostinger: 'hosting', cloudflare: 'hosting', godaddy: 'hosting', namecheap: 'hosting',
  bluehost: 'hosting', siteground: 'hosting', hostgator: 'hosting', ionos: 'hosting',
  dreamhost: 'hosting', wix: 'hosting', squarespace: 'hosting', wordpress: 'hosting',
  'wordpress.com': 'hosting', vercel: 'hosting', netlify: 'hosting', digitalocean: 'hosting',
  kinsta: 'hosting', porkbun: 'hosting', wpengine: 'hosting', 'wp engine': 'hosting',
  'xbox game pass': 'gaming', 'playstation plus': 'gaming', 'ps plus': 'gaming',
  'ea play': 'gaming', 'geforce now': 'gaming', 'nintendo switch online': 'gaming',
  'ubisoft+': 'gaming', 'apple arcade': 'gaming',
};
function subscriptionCategory(name) {
  return SUB_CATEGORY[String(name || '').trim().toLowerCase()] || null;
}

// The AI validator returns app-style category labels; map them onto the local
// short keys used by SUB_CATEGORY so same-category checks compare like-for-like
// whether a chip came from the local catalog or the AI.
const AI_CAT_TO_LOCAL = {
  'video-streaming': 'video', 'music-streaming': 'music', gaming: 'gaming',
  'ai-tools': 'ai', 'cloud-storage': 'cloud', productivity: 'productivity',
  'web-hosting': 'hosting', hosting: 'hosting', vpn: 'vpn',
  bundles: 'bundles', news: 'news', fitness: 'fitness', education: 'education', other: 'other',
};
function normalizeSubscriptionCategoryKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return AI_CAT_TO_LOCAL[key] || key || null;
}
// Returns the conflicting category pair, or null when the selection is valid.
function subscriptionsMixCategories(names) {
  const cats = names.map(subscriptionCategory).filter(Boolean);
  const uniq = [...new Set(cats)];
  return uniq.length > 1;
}

// ── Subscription input validation — app parity ──────────────────────────────
// Mirrors SubQuizNotifier.validateSingleSubscriptionChip + GeminiService
// .resolveSubscriptionSelection in the Flutter app: known services resolve
// locally (no AI call); anything unknown is classified by the AI, so a random
// word / link / product / profanity is rejected instead of being treated as a
// real subscription.

// Canonical display names for the locally-known catalog, so a typed "netflix"
// becomes "Netflix" without an AI round-trip.
const SUB_DISPLAY = {
  netflix: 'Netflix', 'disney+': 'Disney+', 'disney plus': 'Disney+',
  'amazon prime': 'Amazon Prime', 'prime video': 'Amazon Prime', 'amazon prime video': 'Amazon Prime',
  hbo: 'HBO', 'hbo max': 'HBO Max', max: 'Max', hulu: 'Hulu',
  'apple tv+': 'Apple TV+', 'apple tv plus': 'Apple TV+', blutv: 'BluTV', exxen: 'Exxen', exen: 'Exxen',
  gain: 'Gain', mubi: 'MUBI', 'youtube premium': 'YouTube Premium', 'yt premium': 'YouTube Premium',
  crunchyroll: 'Crunchyroll', 'bein sports': 'beIN Sports', tod: 'TOD',
  'paramount+': 'Paramount+', 'paramount plus': 'Paramount+', peacock: 'Peacock', tabii: 'Tabii', 'tv+': 'Apple TV+',
  spotify: 'Spotify', 'apple music': 'Apple Music', 'youtube music': 'YouTube Music', 'yt music': 'YouTube Music',
  tidal: 'Tidal', deezer: 'Deezer', 'amazon music': 'Amazon Music', fizy: 'Fizy',
  soundcloud: 'SoundCloud', 'soundcloud go': 'SoundCloud Go',
  'chatgpt plus': 'ChatGPT Plus', chatgpt: 'ChatGPT Plus', 'claude pro': 'Claude Pro', claude: 'Claude Pro',
  gemini: 'Gemini Advanced', 'gemini advanced': 'Gemini Advanced', perplexity: 'Perplexity', midjourney: 'Midjourney',
  copilot: 'Microsoft Copilot', 'microsoft copilot': 'Microsoft Copilot', grok: 'Grok', deepseek: 'DeepSeek', poe: 'Poe',
  icloud: 'iCloud+', 'icloud+': 'iCloud+', 'google one': 'Google One', dropbox: 'Dropbox', onedrive: 'OneDrive',
  pcloud: 'pCloud', mega: 'MEGA',
  'adobe creative cloud': 'Adobe Creative Cloud', canva: 'Canva', 'microsoft 365': 'Microsoft 365',
  'office 365': 'Microsoft 365', notion: 'Notion', 'google workspace': 'Google Workspace',
  hostinger: 'Hostinger', cloudflare: 'Cloudflare', godaddy: 'GoDaddy', namecheap: 'Namecheap',
  bluehost: 'Bluehost', siteground: 'SiteGround', hostgator: 'HostGator', ionos: 'IONOS',
  dreamhost: 'DreamHost', wix: 'Wix', squarespace: 'Squarespace', wordpress: 'WordPress.com',
  'wordpress.com': 'WordPress.com', vercel: 'Vercel', netlify: 'Netlify', digitalocean: 'DigitalOcean',
  kinsta: 'Kinsta', porkbun: 'Porkbun', wpengine: 'WP Engine', 'wp engine': 'WP Engine',
  'xbox game pass': 'Xbox Game Pass', 'playstation plus': 'PlayStation Plus', 'ps plus': 'PlayStation Plus',
  'ea play': 'EA Play', 'geforce now': 'GeForce Now', 'nintendo switch online': 'Nintendo Switch Online',
  'ubisoft+': 'Ubisoft+', 'apple arcade': 'Apple Arcade',
};

function looksLikeSubscriptionUrl(value) {
  const lower = String(value || '').trim().toLowerCase();
  return lower.includes('http://') || lower.includes('https://')
    || lower.includes('www.') || /\.[a-z]{2,}(\/|$)/.test(lower);
}

function prettySubscriptionName(name) {
  const raw = String(name || '').trim().replace(/\s+/g, ' ');
  const known = SUB_DISPLAY[raw.toLowerCase()];
  if (known) return known;
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Bilinen servislerin KANONIK listesi — SUB_CATEGORY + SUB_DISPLAY'DEN
// TURETILIR, elle yazilmis ucuncu bir liste DEGIL. Admin panelindeki abonelik
// secicisi bunu kullaniyor; sabit bir dizi kopyalasaydik yeni bir servis
// eklendiginde iki yerden birinin unutulmasi kacinilmazdi (spec_i18n.js ve
// sub_logos.js ile ayni gerekce).
//
// Takma adlar ELENIR: 'disney+' ve 'disney plus' ayni servis, ikisi de
// 'Disney+' olarak gorunur ve listede tek satir kalir.
function subscriptionCatalog() {
  const gorulen = new Set();
  const out = [];
  for (const key of Object.keys(SUB_CATEGORY)) {
    const name = prettySubscriptionName(key);
    const lower = name.toLowerCase();
    if (gorulen.has(lower)) continue;
    gorulen.add(lower);
    out.push({ name, category: SUB_CATEGORY[key] });
  }
  return out;
}

function subValidationMessages(lang) {
  const isTr = String(lang || '').slice(0, 2) === 'tr';
  return {
    empty: isTr ? 'Lütfen en az bir abonelik adı girin.'
      : 'Please enter at least one subscription name.',
    url: isTr ? 'Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.'
      : 'Only subscription names are accepted here — links are not allowed.',
    notSub: isTr ? 'Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.'
      : 'This doesn\'t look like a subscription service. Please enter a name like Netflix or Spotify.',
    failed: isTr ? 'Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.'
      : 'Could not validate subscription. Please try again.',
    dup: (n) => (isTr ? `"${n}" zaten eklendi.` : `"${n}" is already added.`),
  };
}

function subValidationPrompt(lang, contextNames = [], contextCategory = '') {
  const langName = languageName(lang);
  const ctx = (contextNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  const contextLine = ctx.length
    ? `\n\nCONTEXT — the user is already comparing: ${ctx.join(', ')}${
      contextCategory ? ` (category: ${contextCategory})` : ''}.\nIf the input is the SAME real-world type as those, give it the SAME category. Only pick a different category when it truly is a different type.`
    : '';
  return `You are Qor AI's subscription validation engine.
Decide whether the input below is a real digital subscription/service OR a real paid digital app, software or platform a person can subscribe to or pay for.

ACCEPT (is_subscription = true):
- Streaming, music, gaming, AI tools, cloud storage, web hosting/domains, VPN, news, fitness, education services.
- Paid digital software/apps and professional/creative tools — e.g. Adobe, Photoshop, Premiere Pro, Canva, Figma, DaVinci Resolve, Final Cut, Microsoft 365, Notion, ChatGPT Plus, Xbox Game Pass.
- If the input is a typo or alternate spelling of a known service, normalize it (e.g. "adobe da vinci", "davinci", "da vinci resolve" → "DaVinci Resolve").

REJECT (is_subscription = false):
- Random/gibberish text, profanity, and generic everyday words.
- Physical products and hardware (phones, cars, food, devices like IQOS).
- Links/URLs and unrelated text.

Category — choose EXACTLY ONE: video-streaming, music-streaming, gaming, ai-tools, cloud-storage, productivity, web-hosting, vpn, news, fitness, education, bundles, other.
Group like-for-like services into the SAME category so they compare cleanly:
- web-hosting = web hosting, domain registrars, CDN/DNS, website builders (Hostinger, Cloudflare, GoDaddy, Namecheap, Vercel, Netlify, Wix, Squarespace, DigitalOcean).
- vpn = VPN and privacy services (NordVPN, ExpressVPN, Surfshark, Proton VPN, Mullvad).
- productivity = ALL design / creative / video-editing / office / professional software (Adobe, Canva, Figma, DaVinci Resolve, Final Cut, Microsoft 365, Notion).
- Prefer a specific category; use "other" ONLY when nothing above fits.
"display_name" must be the clean branded service name. "reason" must be short and in ${langName}.${contextLine}

Return ONLY valid JSON:
{ "is_subscription": true|false, "display_name": "string or null", "category": "string or null", "reason": "string" }`;
}

// Validate a single typed subscription name before adding it as a chip.
// Returns { displayName, category } when valid, or { error } when not.
async function validateSubscriptionInput(rawName, existingNames = [], language = 'en', existingCategory = '') {
  const msg = subValidationMessages(language);
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return { error: msg.empty };
  if (looksLikeSubscriptionUrl(trimmed)) return { error: msg.url };

  const lower = trimmed.toLowerCase();
  if ((existingNames || []).some((n) => String(n || '').trim().toLowerCase() === lower)) {
    return { error: msg.dup(trimmed) };
  }

  // Known service → resolve locally, no AI call.
  const localCategory = subscriptionCategory(trimmed);
  if (localCategory) {
    const displayName = prettySubscriptionName(trimmed);
    if ((existingNames || []).some((n) => String(n || '').trim().toLowerCase() === displayName.toLowerCase())) {
      return { error: msg.dup(displayName) };
    }
    return { displayName, category: localCategory };
  }

  // Unknown → ask the AI whether it's a real subscription at all.
  let res;
  try {
    res = await askQorAiJson({
      system: subValidationPrompt(language, existingNames, existingCategory),
      user: JSON.stringify({ input: trimmed }),
      maxOutputTokens: 512,
    });
  } catch {
    return { error: msg.failed };
  }
  const isSub = res?.is_subscription === true;
  const displayName = prettySubscriptionName(res?.display_name || trimmed);
  const category = normalizeSubscriptionCategoryKey(res?.category);
  if (!isSub || !displayName || !category) {
    return { error: msg.notSub };
  }
  if ((existingNames || []).some((n) => String(n || '').trim().toLowerCase() === displayName.toLowerCase())) {
    return { error: msg.dup(displayName) };
  }
  return { displayName, category };
}

root.QorAiLink = {
  configure: configure,
  isJunkProductTitle: isJunkProductTitle,
  titleFromUrl: titleFromUrl,
  looksLikeProductUrl: looksLikeProductUrl,
  analyzeLink: analyzeLink,
  generateQuiz: generateQuiz,
  generateCompareQuiz: generateCompareQuiz,
  generateSubscriptionQuiz: generateSubscriptionQuiz,
  researchProductCommunity: researchProductCommunity,
  researchProductsCommunity: researchProductsCommunity,
  researchSubscriptionsCommunity: researchSubscriptionsCommunity,
  findCatalogMatch: findCatalogMatch,
  awaitResearch: awaitResearch,
  enhancedAnalysis: enhancedAnalysis,
  compareAnalysis: compareAnalysis,
  subscriptionAnalysis: subscriptionAnalysis,
  subscriptionCategory: subscriptionCategory,
  subscriptionCatalog: subscriptionCatalog,
  prettySubscriptionName: prettySubscriptionName,
  normalizeSubscriptionCategoryKey: normalizeSubscriptionCategoryKey,
  subscriptionsMixCategories: subscriptionsMixCategories,
  looksLikeSubscriptionUrl: looksLikeSubscriptionUrl,
  validateSubscriptionInput: validateSubscriptionInput,
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
