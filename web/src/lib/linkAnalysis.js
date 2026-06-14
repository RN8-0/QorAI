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

import { askQorAiJson } from './ai';

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
  return `You are Qor AI's link analysis engine. You receive a product URL, optional metadata, and a user profile. Your job is to identify the EXACT product and analyze it for the user.

CRITICAL — PRODUCT IDENTIFICATION (ABSOLUTE RULES):
1. The "productMetadata.title" field is your PRIMARY and MOST TRUSTED source. If it contains a clear product name, YOU MUST USE IT as the product title. Do NOT override it with a different product.
2. The URL path segments (slugs, IDs, brand names) are your SECONDARY source.
3. ABSOLUTELY NEVER substitute, replace, or hallucinate a different product than what the metadata/URL indicates. This is the #1 unbreakable rule.
4. If productMetadata.title looks like a domain name (e.g. "trendyol.com"), ignore it and rely on URL structure.
5. For Amazon ISBNs (all-numeric 10-digit IDs), this is a BOOK. Category = "books".
6. For Amazon ASINs (alphanumeric starting with 'B'), you may cautiously identify but note uncertainty.
7. If you cannot determine the product, set is_product to false. NEVER fabricate.

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

export async function analyzeLink(url, language, userProfile = {}) {
  const fallbackTitle = titleFromUrl(url);
  let siteName = '';
  try { siteName = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  let res = null;
  try {
    res = await askQorAiJson({
      system: linkAnalysisSystemPrompt(language),
      user: JSON.stringify({
        url,
        productMetadata: fallbackTitle ? { title: fallbackTitle, siteName } : { siteName },
        userProfile,
      }),
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

// ── Step 2: personalized quiz ─────────────────────────────────────
function quizGenerationPrompt(language) {
  const langName = languageName(language);
  return `You are Qor AI's product quiz engine. Generate a focused personalized quiz
(8-10 questions) to understand the user's needs for a specific product category.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the product name, specs, category, or user profile are written in another language, the quiz itself is still written in ${langName}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

Rules:
- Questions must be relevant to the product CATEGORY
- Choose 8 questions for simple products, 9-10 for complex/high-consideration products
- Cover use case, environment, performance/content expectations, quality tolerance, ownership risk, ergonomics, community/review sensitivity, and long-term value
- Make questions scenario-based and specific, usually 2 sentences or one rich sentence of 18-35 words
- Use varied everyday-life contexts chosen from the product category and user profile instead of abstract labels
- Do not copy any example scenario verbatim. Do not repeat the same day, time, place, or routine across questions
- Each question must reveal one concrete trade-off that matters for this category, such as comfort vs durability, speed vs battery, detail vs simplicity, portability vs capacity, or privacy vs convenience
- Do NOT repeat the exact product name in every question. Mention the product name at most once across the whole quiz; otherwise use "this product" or the category naturally
- Avoid short generic prompts such as "What do you expect from this product?"
- Do not use markdown, bold markers, quotation marks around product names, or headline-style labels
- Each question has exactly 4 options
- Options should be concrete and situational, not one-word labels
- Keep questions conversational with emoji
- NEVER ask about budget or brand preference
- ALL text must be in ${langName}

PERSONALIZATION (read the userProfile JSON in the user message):
- Tailor every scenario to the user's real life: weave their profession and hobbies into the situations naturally — a doctor pictured on long hospital shifts, a gamer in late-night sessions, a photographer on a weekend shoot. If profession/hobbies are empty, stay category-generic.
- Ground scenarios in what they actually shop for: lean on recentlyViewed products/categories and interestCategories when choosing contexts and examples.
- NEVER state or hint at what we already know about them. Do not write "as a doctor", "since you love gaming", or name their profession, hobby, budget or ecosystem. Infer silently and ask a question that UNCOVERS the trade-off — the user must never feel told about their own profile.
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
  const res = await askQorAiJson({
    system: quizGenerationPrompt(language),
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
    .slice(0, 10);
  return questions;
}

function compareQuizGenerationPrompt(language) {
  const langName = languageName(language);
  return `You are Qor AI's comparison quiz engine. Generate a focused, high-signal quiz
(8-10 questions) that helps choose between multiple product links.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the product names, specs, categories, or user profile are in another language, the quiz itself is still written in ${langName}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.

Rules:
- Questions must compare the listed products, not ask generic shopping questions
- Choose 8 questions for two simple products, 9-10 for complex categories or 3+ products
- Cover usage intent, performance expectations, quality, portability/ergonomics, durability, risk tolerance, community/review sensitivity, must-have features, and long-term ownership
- Make questions scenario-based and specific, usually 2 sentences or one rich sentence of 18-35 words
- Use varied everyday-life contexts chosen from the compared product category and user profile so the user can picture the choice
- Do not copy any example scenario verbatim. Do not repeat the same day, time, place, or routine across questions
- Each question must expose a real decision trade-off between the listed options, not just ask which product sounds nicer
- Do NOT repeat exact product names in every question. Use neutral wording like "the first option", "the lighter option", "the stronger option", or the category unless a direct contrast is necessary
- Avoid short generic prompts such as "Which one do you prefer?"
- Do not use markdown, bold markers, quotation marks around product names, or headline-style labels
- Each question has exactly 4 options
- Options should describe realistic behavior or priority trade-offs, not one-word labels
- Keep questions conversational with emoji
- NEVER ask about budget or brand preference
- ALL text must be in ${langName}

PERSONALIZATION (read the userProfile JSON in the user message):
- Tailor every scenario to the user's real life: weave their profession and hobbies into the comparison contexts naturally. If profession/hobbies are empty, stay category-generic.
- Ground contexts in what they actually shop for: lean on recentlyViewed products/categories and interestCategories.
- NEVER state or hint at what we already know about them. Do not name their profession, hobby, budget or ecosystem in the text. Infer silently and ask a question that UNCOVERS which trade-off wins for them.
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
  const res = await askQorAiJson({
    system: compareQuizGenerationPrompt(language),
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
    .slice(0, 10);
}

// ── Subscription quiz (same engine, subscription wording) ─────────
function subscriptionQuizPrompt(names, isCompare, language) {
  const langName = languageName(language);
  return `You are Qor AI's subscription quiz engine. Generate a focused personalized quiz
(8-10 questions) to understand the user's needs for: ${names}.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the service names or user profile are in another language, the quiz itself is still written in ${langName}. Never mirror the language of the context. Only official brand/service names may stay as-is.

The goal: understand how the user uses ${isCompare ? 'these services' : 'this service'},
their specific habits, preferences, and expectations.

Rules:
- Questions must be directly relevant to the specific service type
  (e.g. streaming: genres/frequency; music: genres/offline; AI tools: use-cases)
- Choose 8 questions for one simple service, 9-10 when comparing multiple services or broad ecosystems
- Cover habits, content/use-case priorities, device/ecosystem, discovery needs, quality expectations, family/shared use, offline/mobile use, community/review sensitivity, churn risk, and long-term retention
- Make questions scenario-based and specific, usually 2 sentences or one rich sentence of 18-35 words
- Use varied everyday-life moments chosen from the service category and user profile so the user answers from real behavior
- Do not copy any example scenario verbatim. Do not repeat the same day, time, place, or routine across questions
- Each question must reveal one concrete subscription trade-off, such as discovery vs control, catalog depth vs interface comfort, offline use vs cross-device sync, family sharing vs personal recommendations, or novelty vs retention
- Do NOT repeat exact service names in every question. Mention each service name only when a direct comparison truly needs it; otherwise say "the music service", "the streaming app", "this subscription", or "the selected services"
- Avoid short generic prompts such as "What do you expect from a music service?"
- Do not use markdown, bold markers, quotation marks around service names, or headline-style labels
- Each question has exactly 4 options
- Options should be concrete situational choices, not one-word labels
- Keep questions conversational with emoji
- NEVER ask about budget or brand preference
- ALL text must be in ${langName}

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
  const res = await askQorAiJson({
    system: subscriptionQuizPrompt(subscriptionNames.join(', '), isCompare, language),
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
    .slice(0, 10);
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

WRITING QUALITY REQUIREMENTS:
- Use professional, tech-journalist level language. Be specific and detailed, not generic.
- Cite actual specs, community observations, or market context wherever possible.
- verdict must be 5-7 rich paragraphs covering the full product story.
- personaAnalysis must be 3-5 paragraphs, deeply personalized to quiz answers.
- communityAnalysis must be 3-4 paragraphs synthesizing broad community feedback.
- prosForUser and consForUser must be detailed, specific bullet points.

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
  "verdict": "5-7 paragraph comprehensive product analysis in ${langName}. Cover: technical overview, performance analysis, build quality, value assessment, long-term ownership outlook, who it's for. Be specific with actual product characteristics. NO user attribute lists.",
  "prosForUser": ["Detailed pro 1 citing specific product trait", "Detailed pro 2 with performance context", "Detailed pro 3", "Detailed pro 4", "Detailed pro 5"],
  "consForUser": ["Specific con 1 with real-world impact", "Specific con 2 with severity context", "Specific con 3", "Specific con 4"],
  "alternatives": ["Full model name of alternative 1", "Full model name of alternative 2", "Full model name of alternative 3"],
  "personaScore": <0-100>,
  "personaAnalysis": "3-5 paragraphs in ${langName} — deep analysis of how this product fits the user's lifestyle, use cases, and needs from quiz answers. Reference specific quiz answers. Be concrete. NEVER list user attributes by name.",
  "communityScore": <0-100>,
  "communityAnalysis": "3-4 paragraphs in ${langName} — professional synthesis of community opinion. Cover overall reception, specific praise, recurring criticisms, long-term ownership reports. Reference known sources (Reddit, YouTube, review sites). IGNORE user profile.",
  "overallVerdict": "3-4 paragraph definitive buy/consider/skip verdict in ${langName}. Include specific reasoning and concrete alternative if recommending skip. NEVER mention user attributes by name."
}`;
}

function num(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export async function enhancedAnalysis({ base, answers, language, userProfile = {} }) {
  const qaPairs = answers
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  const res = await askQorAiJson({
    system: enhancedAnalysisPrompt(language),
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
      "summary": "4-6 detailed sentences in ${langName}",
      "pros": ["4 detailed bullets in ${langName}"],
      "cons": ["3 detailed bullets in ${langName}"],
      "risks": ["3 ownership/community risks in ${langName}"],
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
    "fit": "3-4 paragraphs in ${langName} comparing quiz-based fit",
    "performance": "3-4 paragraphs in ${langName} comparing performance/specs",
    "ownership": "3-4 paragraphs in ${langName} comparing durability, support, community risk",
    "recommendation": "4-6 paragraphs in ${langName} with clear final decision and alternatives"
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
      "compatibility_explanation": "string - 4-6 detailed sentences why this score, personalized to quiz answers",
      "pros": ["detailed string", "detailed string", "detailed string", "detailed string", "detailed string"],
      "cons": ["detailed string", "detailed string", "detailed string", "detailed string"],
      "risks": ["ownership/churn risk string", "risk string", "risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 3-4 paragraph Reddit/forum/reviewer summary",
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
    "recommendation": "string - 5-7 paragraph personalized recommendation explaining WHY, trade-offs, best use cases and final decision"
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 3-4 paragraphs comparing overall fit",
    "feature_comparison": "string - 3-4 paragraphs about feature differences",
    "user_experience": "string - 3-4 paragraphs about UX differences",
    "community_and_risk": "string - 3-4 paragraphs about review sentiment, churn risk and long-term satisfaction",
    "final_plan": "string - 3-4 paragraphs explaining how the user should use the winning service or combination"
  }
}`
    : `{
  "subscriptions": {
    "${names}": {
      "category": "string - service category label",
      "rank": 1,
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 4-6 detailed sentences why this score, personalized to quiz answers",
      "pros": ["detailed string", "detailed string", "detailed string", "detailed string", "detailed string"],
      "cons": ["detailed string", "detailed string", "detailed string", "detailed string"],
      "risks": ["ownership/churn risk string", "risk string", "risk string"],
      "notable_features": [
        {"label": "short feature label", "value": "short feature detail"}
      ],
      "community_sentiment": "string - 3-4 paragraph Reddit/forum/reviewer summary",
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
${factorSchema}
      }
    }
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 3-4 paragraphs about overall fit",
    "feature_comparison": "string - 3-4 paragraphs about features and content/use cases",
    "user_experience": "string - 3-4 paragraphs about UX and everyday usage",
    "community_and_risk": "string - 3-4 paragraphs about review sentiment, churn risk and long-term satisfaction",
    "final_plan": "string - 3-4 paragraphs explaining how the user should use or evaluate the service"
  },
  "recommendation": "string - 5-7 paragraph personalized recommendation explaining fit, trade-offs, usage scenarios and final decision"
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
- pros must have exactly 5 items, cons exactly 4 items, risks exactly 3 items — each item one concise sentence
- notable_features must have 4-6 concise items
- factors are 0-100 integers and MUST include every factor key shown in the schema
- Be specific and personalized to the quiz answers and the user profile, not generic
- Blend the user's profile, browsing history and quiz answers when scoring
- compatibility_explanation: 3-4 sentences. community_sentiment: 2 short paragraphs.
  best_for: 2 sentences. recommendation / detailed_comparison fields: 3-4 short
  paragraphs each. Keep it substantial but DO NOT pad — finishing the full JSON
  for ALL services matters more than length.
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
    system: subscriptionAnalysisPrompt(names, subscriptionNames.length, isCompare, qaPairs, language),
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
  'adobe creative cloud': 'creative', canva: 'creative',
  'microsoft 365': 'productivity', 'office 365': 'productivity', notion: 'productivity',
  'google workspace': 'productivity', hostinger: 'hosting',
  'xbox game pass': 'gaming', 'playstation plus': 'gaming', 'ps plus': 'gaming',
  'ea play': 'gaming', 'geforce now': 'gaming', 'nintendo switch online': 'gaming',
  'ubisoft+': 'gaming', 'apple arcade': 'gaming',
};
export function subscriptionCategory(name) {
  return SUB_CATEGORY[String(name || '').trim().toLowerCase()] || null;
}
// Returns the conflicting category pair, or null when the selection is valid.
export function subscriptionsMixCategories(names) {
  const cats = names.map(subscriptionCategory).filter(Boolean);
  const uniq = [...new Set(cats)];
  return uniq.length > 1;
}
