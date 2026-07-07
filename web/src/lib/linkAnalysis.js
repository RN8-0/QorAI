// ═══════════════════════════════════════════════════════════════
//  Qor AI — link & subscription analysis engine (web port)
//  These prompts are kept VERBATIM in sync with the mobile app's
//  DeepSeekService (lib/services/deepseek_service.dart) so the web
//  produces the same quiz-enhanced analysis flow as the app:
//    1. analyzeLink()      → identify the exact product + base score
//    2. generateQuiz()     → a short personalized quiz
//    3. enhancedAnalysis() → the full personalized match report
//  The app talks to DeepSeek; the web reuses the Gemini proxy, so the
//  wording is identical even though the model differs.
// ═══════════════════════════════════════════════════════════════

import { askQorAiJson, askQorAiGrounded, adminPrompt } from './ai';

const LANG_NAMES = {
  en: 'English', tr: 'Turkish', de: 'German', fr: 'French', es: 'Spanish',
  pt: 'Portuguese', it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', nl: 'Dutch', pl: 'Polish', sv: 'Swedish',
};
export function languageName(code) {
  return LANG_NAMES[String(code || 'en').slice(0, 2).toLowerCase()] || 'English';
}

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
  if (lang === 'de') {
    return [
      'Nutzungsfit',
      'Leistung',
      'Qualitätsfit',
      'Funktionsumfang',
      'Ergonomie und Mobilität',
      'Zuverlässigkeit und Risiko',
      'Community-Signal',
      'Langzeitwert',
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
  if (lang === 'de') {
    return [
      { key: 'usage_fit', label: 'Nutzungsfit', emoji: '🎯' },
      { key: 'content_match', label: 'Inhaltsfit', emoji: '🎬' },
      { key: 'feature_depth', label: 'Funktionstiefe', emoji: '🧩' },
      { key: 'ecosystem_fit', label: 'Ökosystem-Fit', emoji: '🔗' },
      { key: 'lifestyle_match', label: 'Lifestyle-Fit', emoji: '🏠' },
      { key: 'community_signal', label: 'Community-Signal', emoji: '🌐' },
      { key: 'retention_value', label: 'Langzeitbindung', emoji: '🚀' },
      { key: 'risk_balance', label: 'Risikobalance', emoji: '🛡' },
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
export function titleFromUrl(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').map((s) => s.trim()).filter(Boolean);
    let slug = '';
    if (/amazon\./i.test(u.hostname)) {
      const dpIndex = segs.findIndex((s) => /^(dp|product)$/i.test(s));
      if (dpIndex > 0) slug = segs[dpIndex - 1];
    }
    const ignore = /^(p|dp|pd|gp|aw|d|product|urun|item|ref|ref=.*|psc=.*|qid=.*|sr=.*)$/i;
    const idLike = /^(?:[a-z0-9]{10}|[a-f0-9]{16,}|[0-9]{8,})$/i;
    const trackingLike = /^(ref[=_-]|sr[=_-]|qid[=_-]|psc[=_-])/i;
    if (!slug) slug = [...segs].reverse().find((s) => /[a-z]/i.test(s) && !ignore.test(s) && !idLike.test(s) && !trackingLike.test(s)) || '';
    if (!slug) slug = [...segs].reverse().find((s) => /[a-z]/i.test(s) && !ignore.test(s)) || '';
    slug = slug.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ');
    slug = slug.replace(/\b(p|dp|pd|product|urun|item|ref)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (slug.length < 3) return '';
    return slug.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
  } catch {
    return '';
  }
}

function inferCategoryFromUrl(url, title) {
  const haystack = `${url || ''} ${title || ''}`.toLowerCase();
  if (/(laptop|notebook|macbook|thinkpad|vivobook|zenbook|legion|rog|tuf|omen|victus|ideapad|nebula)/.test(haystack)) return 'laptops';
  if (/(headphone|headset|kulaklik|earbud|airpods|buds|wh-|quietcomfort)/.test(haystack)) return 'headphones';
  if (/(phone|iphone|galaxy|pixel|xiaomi|redmi|smartphone)/.test(haystack)) return 'smartphones';
  if (/(monitor|display|oled|qled|ultrawide)/.test(haystack)) return 'monitors';
  if (/(keyboard|mouse|klavye|fare)/.test(haystack)) return 'keyboards';
  if (/(book|isbn|kindle|kitap)/.test(haystack)) return 'books';
  if (/(shoe|shirt|dress|jacket|pantolon|ayakkabi|giyim)/.test(haystack)) return 'clothing';
  if (/(kitchen|vacuum|robot|coffee|airfryer|home|mutfak|ev)/.test(haystack)) return 'home-appliances';
  if (/(game|gaming|ps5|xbox|switch)/.test(haystack)) return 'gaming';
  return 'general';
}

function fallbackBaseAnalysis({ url, title, siteName, language }) {
  const lang = String(language || 'en').slice(0, 2).toLowerCase();
  const name = title || siteName || url;
  if (lang === 'tr') {
    return `"${name}" bağlantısı ürün sayfası olarak işlendi. Qor AI ürün adını bağlantı ve site bilgisinden çıkardı; canlı sayfa verisi alınamadığında değerlendirme, ürün adı/kategori sinyalleri ve profil cevapların üzerinden hazırlanır. Satın almadan önce satıcı sayfasındaki güncel fiyat, garanti ve teknik özellikleri de kontrol et.`;
  }
  if (lang === 'de') {
    return `"${name}" wurde als Produktlink verarbeitet. Qor AI hat das Produkt aus der URL und dem Shop-Signal erkannt; wenn keine Live-Seitendaten verfügbar sind, wird die Empfehlung aus Titel, Kategorie-Signalen und deinen Antworten erstellt. Prüfe vor dem Kauf trotzdem den aktuellen Preis, die Garantie und die technischen Daten auf der Verkäuferseite.`;
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
export function looksLikeProductUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (NON_PRODUCT_HOSTS.some((d) => host === d || host.endsWith('.' + d))) return false;
  const path = u.pathname.replace(/\/+$/, '');
  if (!path && !u.search) return false; // bare homepage, not a product
  return true;
}

export async function analyzeLink(url, language, userProfile = {}) {
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
  const needsResearch =
    !fallbackTitle || fallbackTitle.length < 4 || /amazon\./i.test(siteName);
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
  const bad = !aiTitle || /erişim|hata|error|unknown|bilinmeyen/i.test(aiTitle);
  const title = bad ? (fallbackTitle || aiTitle || siteName || url) : aiTitle;
  return {
    url,
    title,
    score: Number(res.score) || 0,
    analysis: String(res.analysis || fallbackBaseAnalysis({ url, title, siteName, language })),
    category: String(res.category || inferCategoryFromUrl(url, title)).toLowerCase(),
    siteName: String(res.site_name || siteName || ''),
    price: res.price || null,
    isProduct: res.is_product !== false,
  };
}

// ── Quiz sizing — 5 sabit yerine kompleksliğe göre 5-6 (deterministik) ──────
// Web + app senkron kural: kompleks kategoriler 6 soru, diğerleri 5.
const COMPLEX_QUIZ_CATEGORIES = [
  'laptops', 'smartphones', 'tablets', 'cameras', 'camera_lenses', 'monitors',
  'headphones', 'gaming', 'gaming_consoles', 'tvs', 'desktops', 'smartwatches',
  'drones', 'av_receivers', 'cpus', 'gpus',
];
export function isComplexQuizCategory(category) {
  const c = String(category || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!c) return false;
  return COMPLEX_QUIZ_CATEGORIES.some((k) => c === k || c.includes(k) || k.includes(c));
}
// Ürün (tek): kategori kompleks → 6, değilse 5.
export function productQuizCount(category) {
  return isComplexQuizCategory(category) ? 6 : 5;
}
// Karşılaştırma: ürün sayısı ≥3 VEYA herhangi biri kompleks → 6, değilse 5.
export function compareQuizCount(products) {
  const list = Array.isArray(products) ? products : [];
  return (list.length >= 3 || list.some((p) => isComplexQuizCategory(p?.category))) ? 6 : 5;
}
// Abonelik: tek servis → 5; karşılaştırma (≥2 servis) → 6.
export function subscriptionQuizCount(names) {
  return (Array.isArray(names) ? names.length : 0) > 1 ? 6 : 5;
}

// ── Step 2: personalized quiz ─────────────────────────────────────
function quizGenerationPrompt(language, count = 5) {
  const langName = languageName(language);
  const majority = count - 2;
  return `You are Qor AI's product quiz engine. Generate a focused personalized quiz
of EXACTLY ${count} questions to understand the user's needs for a specific product category.
Pick only the ${count} most decisive, highest-signal questions — the ones whose answers most
change whether this product is the right fit. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the product name, specs, category, or user profile are written in another language, the quiz itself is still written in ${langName}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- Questions must be relevant to the product CATEGORY.
- Ask EXACTLY ${count} questions — no more, no fewer. Spend them on the ${count} highest-signal trade-offs that decide the fit; drop anything lower-signal.
- Cover real use moments, environment, quality tolerance, ergonomics, ownership risk and long-term value.
- Each question reveals one concrete trade-off (comfort vs durability, speed vs battery, detail vs simplicity, portability vs capacity, privacy vs convenience).
- HARD RULE — do NOT name the product or brand in the OPTIONS, and mention the product name at most once in the whole quiz (otherwise say "this one" or the category). Options describe behaviors/priorities only, never a brand name.
- Each question has exactly 4 options; each option is a short, concrete everyday behavior or priority, not a one-word label.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${langName}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about THIS PRODUCT CATEGORY first. The clear majority of questions (at least ${majority} of the ${count}) MUST be neutral, category-driven usage scenarios that ANY buyer of this product could relate to. Do NOT bend the scenarios around the user's job or hobby.
- AT MOST 1 question in the WHOLE quiz may quietly lean on the user's profession or hobbies for its scenario — and only when it genuinely fits the product category. Never force a profession/hobby context into a question where it does not naturally belong, and NEVER combine profession AND hobby in the same question, nor repeat the same job/hobby context across questions.
- For every other question, use ordinary everyday contexts that come from the product category itself (commuting, travel, home, general work, leisure, family), NOT the user's specific job or hobby.
- AT LEAST 1 question must quietly ground its everyday scene in the user's real signals (interestCategories, recentlyViewed, priorities, usageIntent, registrationQuizAnswers) so it feels personally relevant — chosen only where it naturally fits the category, and without ever reading the profile back to the user.
- You may lean lightly on recentlyViewed products/categories and interestCategories to pick realistic contexts, but keep the spotlight on the product decision, not the person.
- NEVER state or hint at what we already know about them. Do not write "as a doctor", "since you love gaming", or name their profession, hobby, budget or ecosystem. Infer silently and ask a question that UNCOVERS the trade-off — the user must never feel told about their own profile.
- userProfile.registrationQuizAnswers holds what the onboarding quiz already asked and answered — treat it like pastQuizQuestions: NEVER re-ask those facts.
- Do NOT ask anything already listed in userProfile.pastQuizQuestions, and do not re-ask facts we already hold (ecosystem, budgetRange, priorities, currentDevices, usageIntent). Spend the questions only on what is still unknown for THIS specific product decision.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`;
}

export async function generateQuiz({ category, productTitle, url, language, userProfile = {} }) {
  const count = productQuizCount(category);
  const res = await askQorAiJson({
    system: quizGenerationPrompt(language, count),
    user: JSON.stringify({ category, productTitle, url, userProfile }),
    maxOutputTokens: 3072,
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

function compareQuizGenerationPrompt(language, count = 5) {
  const langName = languageName(language);
  const majority = count - 2;
  return `You are Qor AI's comparison quiz engine. Generate a focused, high-signal quiz
of EXACTLY ${count} questions that helps choose between multiple product links. Pick only the
${count} most decisive trade-offs — the ones whose answers most change which product wins.
No filler questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the product names, specs, categories, or user profile are in another language, the quiz itself is still written in ${langName}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- The quiz must surface which trade-offs matter to the user, not ask generic shopping questions.
- Ask EXACTLY ${count} questions — no more, no fewer — the ${count} most decisive trade-offs that determine which product fits best, whether comparing two products or several.
- Cover real use moments, performance, quality, portability/ergonomics, durability, risk tolerance and long-term ownership.
- Each question exposes one real decision trade-off between the options' differing strengths.
- HARD RULE — NEVER name, write, or hint at any of the compared products or brands in the questions OR in the options. Not even once. The user must NOT be able to tell which option maps to which product. Describe only behaviors, situations and priorities.
- Each question has exactly 4 options; each option is a short, concrete everyday behavior or priority (no brand names, no model names) that silently maps to a different product's strength.
- Make the four options clearly distinct so the answer is meaningful.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${langName}

PERSONALIZATION (read the userProfile JSON in the user message):
- This quiz is about choosing between THESE PRODUCTS first. The clear majority of questions (at least ${majority} of the ${count}) MUST be neutral, category-driven trade-off scenarios that ANY buyer comparing these products could relate to. Do NOT bend the scenarios around the user's job or hobby.
- AT MOST 1 question in the WHOLE quiz may quietly lean on the user's profession or hobbies for its scenario — and only when it genuinely fits the compared category. Never force a profession/hobby context where it does not naturally belong, and NEVER combine profession AND hobby in the same question, nor repeat the same job/hobby context across questions.
- For every other question, use ordinary everyday contexts drawn from the compared category itself, NOT the user's specific job or hobby.
- AT LEAST 1 question must quietly ground its everyday scene in the user's real signals (interestCategories, recentlyViewed, priorities, usageIntent, registrationQuizAnswers) so it feels personally relevant — only where it naturally fits, and without ever reading the profile back to the user.
- You may lean lightly on recentlyViewed products/categories and interestCategories to pick realistic contexts, but keep the spotlight on the comparison decision.
- NEVER state or hint at what we already know about them. Do not name their profession, hobby, budget or ecosystem in the text. Infer silently and ask a question that UNCOVERS which trade-off wins for them.
- userProfile.registrationQuizAnswers holds what the onboarding quiz already asked and answered — treat it like pastQuizQuestions: NEVER re-ask those facts.
- Do NOT ask anything already listed in userProfile.pastQuizQuestions, and do not re-ask facts we already hold (ecosystem, budgetRange, priorities, currentDevices, usageIntent). Spend the questions only on what is still unknown for THIS comparison.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`;
}

export async function generateCompareQuiz({ products, language, userProfile = {} }) {
  const count = compareQuizCount(products);
  const res = await askQorAiJson({
    system: compareQuizGenerationPrompt(language, count),
    user: JSON.stringify({
      products: (products || []).map((p) => ({
        title: p.title,
        url: p.url,
        category: p.category,
        initialScore: p.score,
        initialAnalysis: p.analysis,
      })),
      userProfile,
    }),
    maxOutputTokens: 8192,
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
function subscriptionQuizPrompt(names, isCompare, language, count = 5) {
  const langName = languageName(language);
  return `You are Qor AI's subscription quiz engine. Generate a focused personalized quiz
of EXACTLY ${count} questions to understand the user's needs for: ${names}. Pick only the ${count} most
decisive, highest-signal questions — the ones whose answers most change which service fits
this person best. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the service names or user profile are in another language, the quiz itself is still written in ${langName}. Never mirror the language of the context. Only official brand/service names may stay as-is.

The goal: understand how the user uses ${isCompare ? 'these services' : 'this service'},
their specific habits, preferences, and expectations.

Rules:
- Each question is a vivid everyday-life mini-scene of about 28-45 words (one rich sentence, or two short ones): set a relatable real-life moment with a little concrete detail, then ask. Make it noticeably longer and more descriptive than a one-liner, yet still natural and easy to read — never a dry label and never a dense paragraph.
- Ask EXACTLY ${count} questions — no more, no fewer — the ${count} most decisive ones that determine which service fits best, whether analysing one service or comparing several.
- Ask about real habits and moments: when/where/how they watch, listen, play, create or work, and what they care about (quality, variety, offline use, sharing, discovery, comfort, how often they use it).
- HARD RULE — NEVER name, write, or hint at any of the selected services or brands (or their exact features/menus) in the questions OR in the options. Not even once. The user must NOT be able to tell which option belongs to which service. If a service name would appear, replace it with the neutral behavior instead.
- Each question has exactly 4 options. Every option is a short, concrete everyday behavior or priority — NO brand names, NO service names, NO product-specific feature jargon — that silently maps to a different service's strength.
- Make the four options clearly distinct so the answer is meaningful, and keep each option short (a few words to one short clause).
- Vary the situations; do not repeat the same moment, place or time across questions.
- Do not use markdown, bold, quotation marks, or headline-style labels. Add one or two fitting emojis to each question (matching the scene) so it feels lively and friendly.
- NEVER ask about budget or brand preference.
- ALL text must be in ${langName}.

PERSONALIZATION (read the userProfile JSON in the user message — this is the profile the user built in the onboarding quiz):
- Shape the everyday situations around what this person plausibly does, using interestCategories, usageIntent, priorities and recentlyViewed for relatable, real-life contexts.
- AT LEAST 1 question must quietly ground its everyday scene in those real signals (interestCategories, recentlyViewed, priorities, usageIntent, registrationQuizAnswers) so it feels personally relevant — without ever reading the profile back to the user.
- AT MOST 1-2 questions may quietly lean on their profession or hobbies, and only when it fits naturally; never combine profession and hobby in one question, and never state or name their profession, hobby, budget or ecosystem.
- userProfile.registrationQuizAnswers holds what the onboarding quiz already asked and answered — treat it like pastQuizQuestions: NEVER re-ask those facts.
- Infer silently — the questions should feel like everyday life, never like the app is reading their profile back to them.

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}`;
}

export async function generateSubscriptionQuiz({ subscriptionNames, language, userProfile = {} }) {
  const isCompare = subscriptionNames.length > 1;
  const count = subscriptionQuizCount(subscriptionNames);
  const res = await askQorAiJson({
    system: subscriptionQuizPrompt(subscriptionNames.join(', '), isCompare, language, count),
    user: JSON.stringify({ subscriptions: subscriptionNames, mode: isCompare ? 'compare' : 'single', userProfile }),
    maxOutputTokens: 8192,
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

// ── Step 3: enhanced personalized analysis ────────────────────────
function enhancedAnalysisPrompt(language) {
  const langName = languageName(language);
  const isTr = String(language || '').slice(0, 2) === 'tr';
  const isDe = String(language || '').slice(0, 2) === 'de';
  const usageFit = isTr ? 'Kullanım Uyumu' : isDe ? 'Nutzungsfit' : 'Usage Fit';
  const budgetMatch = isTr ? 'Bütçe Uyumu' : isDe ? 'Budget-Fit' : 'Budget Match';
  const qualityFit = isTr ? 'Kalite Uyumu' : isDe ? 'Qualitätsfit' : 'Quality Fit';
  const futureProofing = isTr ? 'Uzun Vadeli Değer' : isDe ? 'Langzeitwert' : 'Long-term Value';
  const lifestyleMatch = isTr ? 'Yaşam Tarzı Uyumu' : isDe ? 'Lifestyle-Fit' : 'Lifestyle Match';
  const featureFit = isTr ? 'Özellik Seti' : isDe ? 'Funktionsumfang' : 'Feature Set';
  const reliabilityRisk = isTr ? 'Güvenilirlik ve Risk' : isDe ? 'Zuverlässigkeit und Risiko' : 'Reliability and Risk';
  const communitySignal = isTr ? 'Topluluk Sinyali' : isDe ? 'Community-Signal' : 'Community Signal';
  return `You are Qor AI's senior product analyst. Given a product, quiz answers, and user profile, produce a comprehensive, professional, highly detailed personalized match report.

LANGUAGE: Write ALL text in ${langName}. Factor labels must also be in ${langName}.

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

WRITING QUALITY REQUIREMENTS:
- Use professional, tech-journalist level language. Be specific, not generic — but SHORT. A human reads this at a glance; every sentence must earn its place.
- Cite actual specs, community observations, or market context wherever possible.
- verdict must be EXACTLY 2 short paragraphs, ~90 words total.
- personaAnalysis must be 2 short paragraphs, ~70 words total, personalized to quiz answers.
- communityAnalysis must be 2 short paragraphs, ~70 words total; one paragraph MUST plainly state the most-reported complaints and negatives — a positives-only summary is forbidden.
- prosForUser and consForUser must be concise, specific bullet points.

Return valid JSON (all text in ${langName}):
{
  "enhancedScore": <0-100>,
  "factors": [
    {"label": "${usageFit}", "score": <0-100>, "emoji": "🎯"},
    {"label": "${budgetMatch}", "score": <0-100>, "emoji": "💰"},
    {"label": "${qualityFit}", "score": <0-100>, "emoji": "⭐"},
    {"label": "${featureFit}", "score": <0-100>, "emoji": "🧩"},
    {"label": "${reliabilityRisk}", "score": <0-100>, "emoji": "🛡"},
    {"label": "${communitySignal}", "score": <0-100>, "emoji": "🌐"},
    {"label": "${futureProofing}", "score": <0-100>, "emoji": "🚀"},
    {"label": "${lifestyleMatch}", "score": <0-100>, "emoji": "🏠"}
  ],
  "verdict": "EXACTLY 2 short paragraphs (~90 words total) in ${langName}: the product story and the value/ownership picture. Be specific with actual product characteristics. NO user attribute lists.",
  "prosForUser": ["Concise pro 1 citing a specific product trait", "Concise pro 2 with performance context", "Concise pro 3", "Concise pro 4 (3-4 items total)"],
  "consForUser": ["Concise con 1 with real-world impact", "Concise con 2 with severity context", "Concise con 3 (exactly 3 items)"],
  "alternatives": ["Full model name of alternative 1", "Full model name of alternative 2", "Full model name of alternative 3"],
  "personaScore": <0-100>,
  "personaAnalysis": "2 short paragraphs (~70 words total) in ${langName} — how this product fits the user's lifestyle and needs from quiz answers. Reference specific quiz answers. Be concrete. NEVER list user attributes by name.",
  "communityScore": <0-100>,
  "communityAnalysis": "2 short paragraphs (~70 words total) in ${langName} — synthesis of community opinion. One paragraph covers reception/praise; the other MUST plainly state the most common complaints, recurring criticisms and defects users actually report — do not soften or bury them. Reference known sources (Reddit, YouTube, review sites). IGNORE user profile.",
  "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>},
  "overallVerdict": "1 short paragraph in ${langName} plus ONE final decisive sentence that clearly says buy, consider, or skip (with a concrete alternative if skip). NEVER mention user attributes by name."
}

sentimentBreakdown = the community sentiment split as integer percentages summing to ~100; keep it realistic (never all-positive) and consistent with communityAnalysis.`;
}

function num(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// AI'dan gelen sentiment dağılımını {positive, neutral, negative} olarak okur;
// alan yok/bozuksa null döner (render tarafı satisfaction'dan türetir).
function parseSentimentBreakdown(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const positive = Math.max(0, Math.round(num(raw.positive)));
  const neutral = Math.max(0, Math.round(num(raw.neutral)));
  const negative = Math.max(0, Math.round(num(raw.negative)));
  if (positive + neutral + negative <= 0) return null;
  return { positive, neutral, negative };
}

export async function enhancedAnalysis({ base, answers, language, userProfile = {} }) {
  const qaPairs = answers
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  const res = await askQorAiJson({
    // Shared admin override key with the app (graceful fallback if unset).
    system: await adminPrompt('gemini_enhanced_link_analysis_system', enhancedAnalysisPrompt(language)),
    user: JSON.stringify({
      product: {
        url: base.url,
        title: base.title,
        category: base.category,
        initialScore: base.score,
        initialAnalysis: base.analysis,
      },
      quizAnswers: qaPairs,
      userProfile,
    }),
    maxOutputTokens: 8192,
  });
  const factors = (Array.isArray(res.factors) ? res.factors : [])
    .map((f) => ({
      label: String(f.label || f.name || ''),
      score: num(f.score ?? f.value),
      emoji: String(f.emoji || f.icon || '📊'),
    }))
    .filter((f) => f.label);
  const enhancedScore = num(res.enhancedScore ?? res.enhanced_score ?? res.score);
  return {
    base,
    enhancedScore: enhancedScore > 0 ? enhancedScore : base.score,
    factors,
    verdict: String(res.verdict || res.detailed_verdict || res.analysis || base.analysis || ''),
    prosForUser: Array.isArray(res.prosForUser || res.pros) ? (res.prosForUser || res.pros).map(String) : [],
    consForUser: Array.isArray(res.consForUser || res.cons) ? (res.consForUser || res.cons).map(String) : [],
    alternatives: Array.isArray(res.alternatives) ? res.alternatives.map(String) : [],
    personaScore: num(res.personaScore) || null,
    personaAnalysis: res.personaAnalysis ? String(res.personaAnalysis) : '',
    communityScore: num(res.communityScore) || null,
    communityAnalysis: res.communityAnalysis ? String(res.communityAnalysis) : '',
    sentimentBreakdown: parseSentimentBreakdown(res.sentimentBreakdown || res.sentiment_breakdown),
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
  return `You are Qor AI's senior product comparison analyst.

LANGUAGE: Write ALL text fields in ${langName}. Keep official product names as-is.

You will receive exact products identified from pasted URLs and the user's comparison quiz answers.

Rules:
- Never replace the products with nearby models.
- Use the exact product titles and URLs given to you.
- Give a detailed, app-style comparison; do not write a short chat answer.
- Blend quiz answers into the recommendation.
- If one product is clearly better for a certain user type, say that directly.
- Do not invent live prices.
- NEVER paste raw long URLs in text fields. Use product names and site domains only.
- Scores must be realistic, varied, and based on THIS user's quiz answers.
- Every product must have factor scores for: ${factorLabels.join(', ')}.

Return ONLY valid JSON with this exact structure:
{
  "winner": {
    "best": "exact product title",
    "reason": "2-3 detailed sentences in ${langName}",
    "scoreGap": 0
  },
  "products": [
    {
      "name": "exact product title",
      "url": "exact input url",
      "siteName": "domain or store",
      "score": 0,
      "rank": 1,
      "bestFor": "2 sentences in ${langName}",
      "summary": "2-3 sentences in ${langName}",
      "pros": ["3 concise bullets in ${langName}"],
      "cons": ["3 concise bullets in ${langName}"],
      "risks": ["2 ownership/community risks in ${langName}"],
      "factors": [
${factorSchema}
      ],
      "specHighlights": [
        {"label": "short spec label in ${langName}", "value": "short known/inferred value or uncertainty note"}
      ],
      "community": "2 short paragraphs in ${langName}"
    }
  ],
  "detailed": {
    "fit": "2 short paragraphs in ${langName} comparing quiz-based fit",
    "performance": "2 short paragraphs in ${langName} comparing performance/specs",
    "ownership": "2 short paragraphs in ${langName} comparing durability, support, community risk",
    "recommendation": "2 short paragraphs in ${langName} with clear final decision and alternatives"
  },
  "recommendation": "2-3 sentence final summary in ${langName}"
}`;
}

export async function compareAnalysis({ bases, answers, language, userProfile = {} }) {
  const factorLabels = compareFactorLabels(language);
  const factorEmojis = ['🎯', '⚡', '⭐', '🧩', '🧭', '🛡', '🌐', '🚀'];
  const qaPairs = (answers || [])
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  const res = await askQorAiJson({
    system: compareAnalysisPrompt(language),
    user: JSON.stringify({
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
    }),
    maxOutputTokens: 12288,
  });
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
        pros: Array.isArray(p.pros) ? p.pros.map(String) : [],
        cons: Array.isArray(p.cons) ? p.cons.map(String) : [],
        risks: Array.isArray(p.risks) ? p.risks.map(String) : [],
        factors,
        specHighlights,
        community: String(p.community || ''),
      };
    });
  products.sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const winner = res.winner && typeof res.winner === 'object' ? {
    best: String(res.winner.best || products[0]?.name || ''),
    reason: String(res.winner.reason || ''),
    scoreGap: num(res.winner.scoreGap),
  } : { best: products[0]?.name || '', reason: '', scoreGap: 0 };
  const detailed = res.detailed && typeof res.detailed === 'object' ? {
    fit: String(res.detailed.fit || ''),
    performance: String(res.detailed.performance || ''),
    ownership: String(res.detailed.ownership || ''),
    recommendation: String(res.detailed.recommendation || ''),
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
    recommendation: String(res.recommendation || detailed?.recommendation || winner.reason || ''),
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
    .map((f) => `        "${f.key}": "integer 0-100 - ${f.label}"`)
    .join(',\n');
  const schema = isCompare
    ? `{
  "subscriptions": {
    "<service_name>": {
      "category": "string - shared subscription category label",
      "rank": "integer starting at 1",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score, personalized to quiz answers",
      "pros": ["concise string", "concise string", "concise string", "optional 4th concise string"],
      "cons": ["concise string", "concise string", "concise string"],
      "risks": ["ownership/churn risk string", "risk string", "optional 3rd risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 2 short paragraphs of Reddit/forum/reviewer synthesis; one paragraph MUST plainly state the most common complaints and negatives, never only praise",
      "sentiment_breakdown": {"positive": "int", "neutral": "int", "negative": "int"},
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
${factorSchema}
      }
    }
  },
  "winner": {
    "best_content": "string - service name",
    "overall": "string - service name",
    "reason": "string - 2-3 detailed sentences",
    "score_gap": "integer score gap between strongest and weakest",
    "recommendation": "string - 2-3 short paragraphs of personalized recommendation explaining WHY, trade-offs and the final decision"
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 2 short paragraphs comparing overall fit",
    "feature_comparison": "string - 2 short paragraphs about feature differences",
    "user_experience": "string - 2 short paragraphs about UX differences",
    "community_and_risk": "string - 2 short paragraphs about review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS and negative points users report (price hikes, missing features, reliability, support, ads) — never a positives-only summary.",
    "final_plan": "string - 2 short paragraphs explaining how the user should use the winning service or combination"
  }
}`
    : `{
  "subscriptions": {
    "${names}": {
      "category": "string - service category label",
      "rank": 1,
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score, personalized to quiz answers",
      "pros": ["concise string", "concise string", "concise string", "optional 4th concise string"],
      "cons": ["concise string", "concise string", "concise string"],
      "risks": ["ownership/churn risk string", "risk string", "optional 3rd risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 2 short paragraphs of Reddit/forum/reviewer synthesis; one paragraph MUST plainly state the most common complaints and negatives, never only praise",
      "sentiment_breakdown": {"positive": "int", "neutral": "int", "negative": "int"},
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
${factorSchema}
      }
    }
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 2 short paragraphs about overall fit",
    "feature_comparison": "string - 2 short paragraphs about features and content/use cases",
    "user_experience": "string - 2 short paragraphs about UX and everyday usage",
    "community_and_risk": "string - 2 short paragraphs about review sentiment, churn risk and long-term satisfaction. You MUST clearly state the most common COMPLAINTS and negative points users report (price hikes, missing features, reliability, support, ads) — never a positives-only summary.",
    "final_plan": "string - 2 short paragraphs explaining how the user should use or evaluate the service"
  },
  "recommendation": "string - 2-3 short paragraphs of personalized recommendation explaining fit, trade-offs and the final decision"
}`;
  const quizText = qaPairs.length
    ? qaPairs.map((q) => `- ${q.question}: ${q.answer}`).join('\n')
    : '- (no quiz answers provided)';
  return `You are Qor AI's subscription intelligence analyst.
Analyze: ${names}

Quiz Answers:
${quizText}

CRITICAL RULES:
- ALL text values MUST be in ${langName} language
- The "subscriptions" object MUST contain exactly ${count} entries, one for EACH of: ${names}
- You MUST complete ALL ${count} service entries. Do not stop early or truncate.
- compatibility_score must be an integer 0-100 based on how well it fits THIS specific user
- pros must have 3-4 items, cons exactly 3 items, risks 2-3 items — each item one concise sentence
- notable_features must have 4-6 concise items
- factors are 0-100 integers and MUST include every factor key shown in the schema
- ANTI-INFLATION: do NOT cluster factor scores near the top. Each service has real weak spots — at least 2 factors per service should fall below 65, and reserve 85+ only for genuine standout strengths. Differentiate honestly; identical high scores across factors are unrealistic.
- sentiment_breakdown values are integer percentages summing to ~100; keep them realistic (never all-positive) and consistent with community_sentiment
- Be specific and personalized to the quiz answers and the user profile, not generic
- Blend the user's profile, browsing history and quiz answers when scoring
- compatibility_explanation: 2-3 sentences. community_sentiment: 2 short paragraphs
  (complaints stated plainly). best_for: 2 sentences. recommendation: 2-3 short
  paragraphs. detailed_comparison fields: 2 short paragraphs each. Keep it tight —
  finishing the full JSON for ALL services matters more than length.
- NEVER mention price, cost, affordability, monthly fees, yearly fees, discounts, or billing

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
${schema}`;
}

export async function subscriptionAnalysis({ subscriptionNames, answers, language, userProfile = {} }) {
  const isCompare = subscriptionNames.length > 1;
  const names = subscriptionNames.join(', ');
  const factorDefs = subscriptionFactorDefinitions(language);
  const factorByKey = Object.fromEntries(factorDefs.map((f) => [f.key, f]));
  const qaPairs = (answers || [])
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  // The AI request helper already backs off and retries on 429/5xx internally.
  const res = await askQorAiJson({
    // Shared admin override key with the app (graceful fallback if unset).
    system: await adminPrompt(
      'gemini_subscription_analysis',
      subscriptionAnalysisPrompt(names, subscriptionNames.length, isCompare, qaPairs, language),
    ),
    user: JSON.stringify({ subscriptions: subscriptionNames, mode: isCompare ? 'compare' : 'single', userProfile }),
    maxOutputTokens: 12288,
  });
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
        return {
          key,
          label: def.label || String(key).replace(/_/g, ' '),
          emoji: def.emoji || '📊',
          score: num(v) || score,
        };
      })
      : [];
    const factors = rawFactors.length ? rawFactors : factorDefs.map((f) => ({
      key: f.key,
      label: f.label,
      emoji: f.emoji,
      score,
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
      pros: Array.isArray(d?.pros) ? d.pros.map(String) : [],
      cons: Array.isArray(d?.cons) ? d.cons.map(String) : [],
      risks: Array.isArray(d?.risks) ? d.risks.map(String) : [],
      features,
      community: String(d?.community_sentiment || ''),
      sentiment: parseSentimentBreakdown(d?.sentiment_breakdown || d?.sentimentBreakdown),
      bestFor: String(d?.best_for || ''),
      factors,
    };
  }).sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.score - a.score);
  const scores = {};
  services.forEach((s) => { scores[s.name] = s.score; });
  const bestByScore = [...services].sort((a, b) => b.score - a.score)[0]?.name || '';
  return {
    isCompare,
    services,
    scores,
    winner: res.winner && typeof res.winner === 'object' ? {
      best: String(res.winner.best_content || res.winner.overall || bestByScore || ''),
      overall: String(res.winner.overall || ''),
      reason: String(res.winner.reason || ''),
      scoreGap: num(res.winner.score_gap ?? res.winner.scoreGap),
      recommendation: String(res.winner.recommendation || ''),
    } : { best: bestByScore, overall: bestByScore, reason: '', scoreGap: 0, recommendation: '' },
    detailed: res.detailed_comparison && typeof res.detailed_comparison === 'object' ? {
      fit: String(res.detailed_comparison.service_fit_summary || ''),
      features: String(res.detailed_comparison.feature_comparison || ''),
      ux: String(res.detailed_comparison.user_experience || ''),
      community: String(res.detailed_comparison.community_and_risk || ''),
      plan: String(res.detailed_comparison.final_plan || ''),
    } : null,
    recommendation: String(res.recommendation || res?.winner?.recommendation || ''),
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
  'google workspace': 'productivity', hostinger: 'other',
  'xbox game pass': 'gaming', 'playstation plus': 'gaming', 'ps plus': 'gaming',
  'ea play': 'gaming', 'geforce now': 'gaming', 'nintendo switch online': 'gaming',
  'ubisoft+': 'gaming', 'apple arcade': 'gaming',
};
export function subscriptionCategory(name) {
  return SUB_CATEGORY[String(name || '').trim().toLowerCase()] || null;
}

// The AI validator returns app-style category labels; map them onto the local
// short keys used by SUB_CATEGORY so same-category checks compare like-for-like
// whether a chip came from the local catalog or the AI.
const AI_CAT_TO_LOCAL = {
  'video-streaming': 'video', 'music-streaming': 'music', gaming: 'gaming',
  'ai-tools': 'ai', 'cloud-storage': 'cloud', productivity: 'productivity',
  bundles: 'bundles', news: 'news', fitness: 'fitness', education: 'education', other: 'other',
};
export function normalizeSubscriptionCategoryKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return AI_CAT_TO_LOCAL[key] || key || null;
}
// Returns the conflicting category pair, or null when the selection is valid.
export function subscriptionsMixCategories(names) {
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
  'office 365': 'Microsoft 365', notion: 'Notion', 'google workspace': 'Google Workspace', hostinger: 'Hostinger',
  'xbox game pass': 'Xbox Game Pass', 'playstation plus': 'PlayStation Plus', 'ps plus': 'PlayStation Plus',
  'ea play': 'EA Play', 'geforce now': 'GeForce Now', 'nintendo switch online': 'Nintendo Switch Online',
  'ubisoft+': 'Ubisoft+', 'apple arcade': 'Apple Arcade',
};

export function looksLikeSubscriptionUrl(value) {
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

function subValidationMessages(lang) {
  const isTr = String(lang || '').slice(0, 2) === 'tr';
  const isDe = String(lang || '').slice(0, 2) === 'de';
  return {
    empty: isTr ? 'Lütfen en az bir abonelik adı girin.'
      : isDe ? 'Bitte gib mindestens einen Abo-Namen ein.'
      : 'Please enter at least one subscription name.',
    url: isTr ? 'Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.'
      : isDe ? 'Hier sind nur Abo-Namen erlaubt — keine Links.'
      : 'Only subscription names are accepted here — links are not allowed.',
    notSub: isTr ? 'Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.'
      : isDe ? 'Das sieht nicht nach einem Abo-Dienst aus. Gib einen Namen wie Netflix oder Spotify ein.'
      : 'This doesn\'t look like a subscription service. Please enter a name like Netflix or Spotify.',
    failed: isTr ? 'Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.'
      : isDe ? 'Abo konnte nicht geprüft werden. Bitte erneut versuchen.'
      : 'Could not validate subscription. Please try again.',
    dup: (n) => (isTr ? `"${n}" zaten eklendi.` : isDe ? `"${n}" ist bereits hinzugefügt.` : `"${n}" is already added.`),
  };
}

function subValidationPrompt(lang) {
  const langName = languageName(lang);
  return `You are Qor AI's subscription validation engine.
Decide whether the input below is a real digital subscription/service OR a real paid digital app, software or platform a person can subscribe to or pay for.

ACCEPT (is_subscription = true):
- Streaming, music, gaming, AI tools, cloud storage, news, fitness, education services.
- Paid digital software/apps and professional/creative tools — e.g. Adobe, Photoshop, Premiere Pro, Canva, Figma, DaVinci Resolve, Final Cut, Microsoft 365, Notion, ChatGPT Plus, Xbox Game Pass.
- If the input is an obvious typo of a known service, normalize it.

REJECT (is_subscription = false):
- Random/gibberish text, profanity, and generic everyday words.
- Physical products and hardware (phones, cars, food, devices like IQOS).
- Links/URLs and unrelated text.

Category — choose exactly one: video-streaming, music-streaming, gaming, ai-tools, cloud-storage, productivity, bundles, news, fitness, education, other.
Put ALL design / creative / video-editing / professional software under "productivity" (so Adobe, Canva, Figma, DaVinci Resolve group together).
"display_name" must be the clean branded service name. "reason" must be short and in ${langName}.

Return ONLY valid JSON:
{ "is_subscription": true|false, "display_name": "string or null", "category": "string or null", "reason": "string" }`;
}

// Validate a single typed subscription name before adding it as a chip.
// Returns { displayName, category } when valid, or { error } when not.
export async function validateSubscriptionInput(rawName, existingNames = [], language = 'en') {
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
      system: subValidationPrompt(language),
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
