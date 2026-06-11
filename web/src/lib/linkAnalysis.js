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
    let slug = segs.reverse().find((s) => /[a-z]/i.test(s) && !/^\d+$/.test(s)) || '';
    slug = slug.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ');
    slug = slug.replace(/\b(p|dp|pd|product|urun|item)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (slug.length < 3) return '';
    return slug.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
  } catch {
    return '';
  }
}

export async function analyzeLink(url, language, userProfile = {}) {
  const fallbackTitle = titleFromUrl(url);
  let siteName = '';
  try { siteName = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  const res = await askQorAiJson({
    system: linkAnalysisSystemPrompt(language),
    user: JSON.stringify({
      url,
      productMetadata: fallbackTitle ? { title: fallbackTitle, siteName } : { siteName },
      userProfile,
    }),
    maxOutputTokens: 1536,
  });
  const aiTitle = String(res.title || '').trim();
  const bad = !aiTitle || /erişim|hata|error|unknown|bilinmeyen/i.test(aiTitle);
  return {
    url,
    title: bad ? (fallbackTitle || aiTitle) : aiTitle,
    score: Number(res.score) || 0,
    analysis: String(res.analysis || ''),
    category: String(res.category || '').toLowerCase(),
    siteName: String(res.site_name || siteName || ''),
    price: res.price || null,
    isProduct: res.is_product !== false,
  };
}

// ── Step 2: personalized quiz ─────────────────────────────────────
function quizGenerationPrompt(language) {
  const langName = languageName(language);
  return `You are Qor AI's product quiz engine. Generate a SHORT personalized quiz
(4-6 questions) to understand the user's needs for a specific product category.

LANGUAGE: Generate ALL questions and options in ${langName}.

Rules:
- Questions must be relevant to the product CATEGORY
- Each question has exactly 4 options
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

export async function generateQuiz({ category, productTitle, url, language, userProfile = {} }) {
  const res = await askQorAiJson({
    system: quizGenerationPrompt(language),
    user: JSON.stringify({ category, productTitle, url, userProfile }),
    maxOutputTokens: 1536,
  });
  const questions = (Array.isArray(res.questions) ? res.questions : [])
    .map((q, i) => ({
      id: `q${i}`,
      text: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    }))
    .filter((q) => q.text && q.options.length >= 2);
  return questions;
}

// ── Subscription quiz (same engine, subscription wording) ─────────
function subscriptionQuizPrompt(names, isCompare, language) {
  const langName = languageName(language);
  return `You are Qor AI's subscription quiz engine. Generate a SHORT personalized quiz
(4-5 questions) to understand the user's needs for: ${names}.

LANGUAGE: Generate ALL questions and options in ${langName}.

The goal: understand how the user uses ${isCompare ? 'these services' : 'this service'},
their specific habits, preferences, and expectations.

Rules:
- Questions must be directly relevant to the specific service type
  (e.g. streaming: genres/frequency; music: genres/offline; AI tools: use-cases)
- Each question has exactly 4 options
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
    maxOutputTokens: 1536,
  });
  const questions = (Array.isArray(res.questions) ? res.questions : [])
    .map((q, i) => ({
      id: `sq${i}`,
      text: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    }))
    .filter((q) => q.text && q.options.length >= 2);
  return questions;
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
    maxOutputTokens: 4096,
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

// ── Subscription analysis ─────────────────────────────────────────
// Mirrors the app's GeminiService.enhancedSubscriptionAnalysis structured
// schema (subscriptions / winner / recommendation). The app runs a googleSearch
// research pass first; the web proxy can't ground, so we analyze directly and
// let the model lean on its own knowledge.
function subscriptionAnalysisPrompt(names, count, isCompare, qaPairs, language) {
  const langName = languageName(language);
  const schema = isCompare
    ? `{
  "subscriptions": {
    "<service_name>": {
      "category": "string - shared subscription category label",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 4-6 detailed sentences why this score, personalized to quiz answers",
      "pros": ["detailed string", "detailed string", "detailed string", "detailed string", "detailed string"],
      "cons": ["detailed string", "detailed string", "detailed string", "detailed string"],
      "community_sentiment": "string - 3-4 paragraph Reddit/forum/reviewer summary",
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
        "usage_fit": "integer 0-100",
        "value_match": "integer 0-100",
        "content_match": "integer 0-100",
        "ecosystem_fit": "integer 0-100",
        "lifestyle_match": "integer 0-100"
      }
    }
  },
  "winner": {
    "best_content": "string - service name",
    "overall": "string - service name",
    "recommendation": "string - 5-7 paragraph personalized recommendation explaining WHY, trade-offs, best use cases and final decision"
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 3-4 paragraphs comparing overall fit",
    "feature_comparison": "string - 3-4 paragraphs about feature differences",
    "user_experience": "string - 3-4 paragraphs about UX differences"
  }
}`
    : `{
  "subscriptions": {
    "${names}": {
      "category": "string - service category label",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 4-6 detailed sentences why this score, personalized to quiz answers",
      "pros": ["detailed string", "detailed string", "detailed string", "detailed string", "detailed string"],
      "cons": ["detailed string", "detailed string", "detailed string", "detailed string"],
      "community_sentiment": "string - 3-4 paragraph Reddit/forum/reviewer summary",
      "best_for": "string - 2-3 sentence ideal user type and usage context",
      "factors": {
        "usage_fit": "integer 0-100",
        "value_match": "integer 0-100",
        "content_match": "integer 0-100",
        "ecosystem_fit": "integer 0-100",
        "lifestyle_match": "integer 0-100"
      }
    }
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
- pros must have exactly 5 items, cons exactly 4 items — each item must be specific and explain real user impact
- factors are 0-100 integers
- Be specific and personalized, not generic
- Write long-form analysis like the mobile app: cover usage fit, content/library fit, workflow impact, ecosystem lock-in, limitations, long-term value and who should skip it
- NEVER mention price, cost, affordability, monthly fees, yearly fees, discounts, or billing
- community_sentiment, compatibility_explanation, recommendation and detailed_comparison must be substantial, not short summaries

Return ONLY valid JSON matching this exact schema:
${schema}`;
}

export async function subscriptionAnalysis({ subscriptionNames, answers, language, userProfile = {} }) {
  const isCompare = subscriptionNames.length > 1;
  const names = subscriptionNames.join(', ');
  const qaPairs = (answers || [])
    .filter((a) => a.answer != null)
    .map((a) => ({ question: a.question, answer: a.answer }));
  const res = await askQorAiJson({
    system: subscriptionAnalysisPrompt(names, subscriptionNames.length, isCompare, qaPairs, language),
    user: JSON.stringify({ subscriptions: subscriptionNames, mode: isCompare ? 'compare' : 'single', userProfile }),
    maxOutputTokens: 8192,
  });
  const subsRaw = res.subscriptions && typeof res.subscriptions === 'object' ? res.subscriptions : {};
  const services = Object.entries(subsRaw).map(([name, d]) => ({
    name,
    category: String(d?.category || ''),
    score: num(d?.compatibility_score),
    explanation: String(d?.compatibility_explanation || ''),
    pros: Array.isArray(d?.pros) ? d.pros.map(String) : [],
    cons: Array.isArray(d?.cons) ? d.cons.map(String) : [],
    community: String(d?.community_sentiment || ''),
    bestFor: String(d?.best_for || ''),
    factors: d?.factors && typeof d.factors === 'object'
      ? Object.entries(d.factors).map(([label, v]) => ({ label, score: num(v) }))
      : [],
  }));
  const scores = {};
  services.forEach((s) => { scores[s.name] = s.score; });
  return {
    isCompare,
    services,
    scores,
    winner: res.winner && typeof res.winner === 'object' ? {
      best: String(res.winner.best_content || res.winner.overall || ''),
      overall: String(res.winner.overall || ''),
      recommendation: String(res.winner.recommendation || ''),
    } : null,
    detailed: res.detailed_comparison && typeof res.detailed_comparison === 'object' ? {
      fit: String(res.detailed_comparison.service_fit_summary || ''),
      features: String(res.detailed_comparison.feature_comparison || ''),
      ux: String(res.detailed_comparison.user_experience || ''),
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
  'google workspace': 'productivity',
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
