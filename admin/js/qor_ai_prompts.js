/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════
//  QOR AI — AI PROMPT'LARI · TEK KAYNAK (single source of truth)
//
//  Analiz prompt'lari (quiz uretimi + rapor uretimi) BURADA yasar. Admin
//  paneli, web sitesi (qorai.net) ve Node tarafindaki build script'leri AYNI
//  bu dosyayi calistirir.
//
//  NEDEN admin/js/ ICINDE?
//  Admin paneli DERLENMEYEN bir statik site (Coolify "static" pack, publish
//  dir = admin/). Tarayici yalnizca kendi kok dizinindeki dosyalari cekebilir,
//  yani ortak modul FIZIKSEL OLARAK admin/ altinda olmak ZORUNDA. Web tarafi
//  bu dosyayi DERLEME sirasinda ice aktarir (web/src/lib/aiPrompts.js), yani
//  calisma zamaninda admin'e bagimli degil. Node tarafi da ayni dosyayi
//  scripts/_spec_sandbox.mjs ile kosturur.
//  ==> Diskte TEK kopya var. admin/js/spec_i18n.js ile BIREBIR ayni desen.
//
//  BURADAKI KOD KOPYALANMADI, TASINDI. Kaynaklar:
//    web/src/components/AiAnalysis.jsx  — rapor prompt'lari + parseAiJson
//    web/src/lib/linkAnalysis.js        — quiz prompt'lari + quiz boyutu
//    web/src/lib/productNames.js        — ad temizligi
//    web/src/lib/routes.js              — slug / urun adresi
//  O dosyalar artik buradan ice aktariyor. Prompt METNINI degistirmek =
//  hem siteyi hem admin'i degistirmek; ikinci bir kopya kacinilmaz olarak
//  ayrisir (proje bu dersi spec cevirisinde bir kez odedi).
//
//  YUKLEME SIRASI: admin/index.html icindeki script listesinde analyses.js'ten
//  ONCE olmali.
// ═══════════════════════════════════════════════════════════════════════════
(function (root) {
'use strict';

/* ── 1) URUN ADI — kaynak: web/src/lib/productNames.js ─────────────── */
const COUNTRY_SKU_RE = /\b[A-Z0-9]{4,}[A-Z]{1,3}\/[A-Z]\b/g;
const COUNTRY_SKU_GROUP_RE = /\s*[\[(][^\])]*\b[A-Z0-9]{4,}[A-Z]{1,3}\/[A-Z]\b[^\])]*[\])]/g;

function cleanProductName(name) {
  return String(name || '')
    .replace(COUNTRY_SKU_GROUP_RE, '')
    .replace(COUNTRY_SKU_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/\s+([.)])/g, '$1')
    .trim();
}

function displayProductName(product, lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const translated = product?.nameTranslated?.[code];
  return cleanProductName(translated && String(translated).trim() ? translated : product?.name || '');
}

/* ── 2) SLUG / URUN ADRESI — kaynak: web/src/lib/routes.js ─────────── */
function slugifyProduct(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function productSlug(product) {
  if (!product || typeof product !== 'object') return '';
  return slugifyProduct(product.slug || product.name || '');
}

// ── /product/<slug> — SONDAKI ID KALDIRILDI (2026-08-19) ───────────────────
// Onceki bicim `/product/<slug>-<id>` idi. Kaldirmanin on kosulu slug'in TUM
// KATALOGDA benzersiz olmasi; olculdu (scripts/_slug_cakisma.mjs, PB uzerinden
// 107.449 urun): 107.449 benzersiz slug, 0 cakisma, slug'i bos kayit 0.
// URL'de kullanilan bicim (slugifyProduct + 90 karakter kirpma) uzerinden de
// AYRICA olculdu: 33 ham slug 90 karakteri asiyor ama kirpilmis halleri yine
// cakismiyor — 107.449 benzersiz.
//
// Eski adresler nginx'te 301 ile yeniye gider (bkz. scripts/_nginx_301.mjs).
// Cozumleyici hem slug'i hem 15 karakterlik id'yi kabul eder: eski link
// istemci tarafinda da (SPA ici gezinme, paylasilmis link) calisir.
function productPath(productOrId) {
  const isProduct = productOrId && typeof productOrId === 'object';
  const id = String(isProduct ? productOrId.id : productOrId || '').trim();
  if (!id) return '/product';
  const slug = isProduct ? productSlug(productOrId) : '';
  // Slug yoksa (elde yalnizca id varsa) id'ye duseriz — cozumleyici 15
  // karakterlik jetonu id olarak taniyor.
  return slug ? `/product/${slug}` : `/product/${id}`;
}

/* ── 3) KUCUK YARDIMCILAR — kaynak: web/src/components/AiAnalysis.jsx ─ */
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : []);
// First N sentences of a longer text — used for the compact per-product summary
// on the compare columns (the full text lives in the detail modal).
function firstSentences(text, n = 2) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, n).join(' ') : raw;
}

/* ── 4) DIL ADI — kaynak: web/src/lib/linkAnalysis.js ──────────────── */
const LANG_NAMES = {
  en: 'English', tr: 'Turkish', fr: 'French', es: 'Spanish',
  pt: 'Portuguese', it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', nl: 'Dutch', pl: 'Polish', sv: 'Swedish',
};
function languageName(code) {
  return LANG_NAMES[String(code || 'en').slice(0, 2).toLowerCase()] || 'English';
}

/* ── 5) QUIZ BOYUTU — kaynak: web/src/lib/linkAnalysis.js ──────────── */
// ── Quiz sizing — 5 sabit yerine kompleksliğe göre 5-6 (deterministik) ──────
// Web + app senkron kural: kompleks kategoriler 6 soru, diğerleri 5.
const COMPLEX_QUIZ_CATEGORIES = [
  'laptops', 'smartphones', 'tablets', 'cameras', 'camera_lenses', 'monitors',
  'headphones', 'gaming', 'gaming_consoles', 'tvs', 'desktops', 'smartwatches',
  'drones', 'av_receivers', 'cpus', 'gpus',
];
function isComplexQuizCategory(category) {
  const c = String(category || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!c) return false;
  return COMPLEX_QUIZ_CATEGORIES.some((k) => c === k || c.includes(k) || k.includes(c));
}
// Ürün (tek): kategori kompleks → 6, değilse 5.
function productQuizCount(category) {
  return isComplexQuizCategory(category) ? 6 : 5;
}
// Karşılaştırma: ürün sayısı ≥3 VEYA herhangi biri kompleks → 6, değilse 5.
function compareQuizCount(products) {
  const list = Array.isArray(products) ? products : [];
  return (list.length >= 3 || list.some((p) => isComplexQuizCategory(p?.category))) ? 6 : 5;
}
// Abonelik: tek servis → 5; karşılaştırma (≥2 servis) → 6.
function subscriptionQuizCount(names) {
  return (Array.isArray(names) ? names.length : 0) > 1 ? 6 : 5;
}

// Her koşuda FARKLI bir quiz: modele değişken bir tohum veriyoruz, ayrıca
// quiz çağrıları daha yüksek sıcaklıkla koşuyor. Aksi hâlde aynı ürün için
// hep aynı sorular geliyordu.
function variationSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ── 6) QUIZ PROMPTLARI — kaynak: web/src/lib/linkAnalysis.js ──────── */
function quizGenerationPrompt(language, count = 5) {
  const langName = languageName(language);
  const majority = count - 2;
  return `You are Qor AI's product quiz engine. Generate a focused personalized quiz
of EXACTLY ${count} questions to understand the user's needs for a specific product category.
Pick only the ${count} most decisive, highest-signal questions — the ones whose answers most
change whether this product is the right fit. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the product name, specs, category, or user profile are written in another language, the quiz itself is still written in ${langName}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.


PRODUCT TYPE — HARD RULE (the #1 failure to avoid):
- The item can be ANY category: a CAR, a house, a book, a bicycle, a coffee machine, a washing machine, clothing, a service, a tool — not just electronics.
- NEVER assume it is a phone, laptop or any screen device. Do NOT mention screens, battery life, keyboards, cameras, storage or apps unless the product context genuinely establishes that the item HAS them.
- Read the product context (name, category, store, base analysis) and write questions ONLY about the real item. If the category field is missing or says "general", infer the type from the product NAME and the base analysis text.
- If you genuinely cannot tell what the item is, ask neutral ownership questions about THIS item (how often it will be used, where, by whom, what would make it a regret) — never invent a device type.

QUESTION QUALITY BAR — these must be the DECISIVE questions an expert buyer of THIS category would ask, including the ones the buyer would NOT think of on their own:
- a tablet → viewing distance and one-handed weight, laminated screen for stylus work, ecosystem lock-in, how long they keep devices
- a car → the terrain and annual distance, towing/loading, fuel-cost tolerance, parking and city manoeuvring, how long they keep a vehicle
- a coffee machine → cups per day, milk drinks, counter space, cleaning appetite
- a book → why they are reading it, pace tolerance, prior familiarity with the subject
Derive the equivalent decisive angles for the ACTUAL category in front of you. Generic "what is your budget / which brand" questions are forbidden.

VARIATION — do not produce the same quiz twice: the user message carries a "variationSeed". Use it to choose a DIFFERENT set of decisive angles, a different opening scene, and a different ordering than the most obvious default. Two runs on the same product must not share a question.

WHAT A GOOD QUESTION LOOKS LIKE — copy this register, not these words:
  BAD  (everyday, vague, teaches nothing): "How long does your battery need to last on a busy day?"
  GOOD (names the trade-off AND its cost): "A bigger battery adds weight and thickness, and fast charging trades long-term cell health for convenience. Where do you sit between all-day endurance and a phone that stays light in the hand?"
  BAD  option: "It matters that it lasts until I get home in the evening."
  GOOD option: "Two full days off the charger, and I accept the extra 30-40 g and the slower charging that comes with it."
The good question TEACHES why the trade-off exists; every good option names the gain AND the price paid.
An option that only expresses a feeling is worthless — it cannot separate two products.

Rules:
- Each question is a SUBSTANTIVE BUYING QUESTION of 25-45 words — count them; a 12-word question is a FAILURE and must be rewritten longer. In languages that pack more meaning per word than English (Turkish, Finnish, Hungarian) still write at least 20 words. Write it the way a category expert would interview a buyer: name the concrete trade-off at stake, add the technical or practical consequence that makes it matter, then ask which side the buyer falls on. Casual day-in-the-life vignettes are FORBIDDEN — "you wake up and reach for your phone" is not a question, it is filler. The reader must finish the question knowing something they did not know about the category.
- Questions must be relevant to the product CATEGORY.
- Ask EXACTLY ${count} questions — no more, no fewer. Spend them on the ${count} highest-signal trade-offs that decide the fit; drop anything lower-signal.
- Cover the axes that actually separate products in this category: the performance headroom the buyer needs, the environment and constraints they operate under, the quality floor they refuse to go below, ergonomics, ownership risk and long-term value.
- Each question reveals one concrete trade-off (comfort vs durability, speed vs battery, detail vs simplicity, portability vs capacity, privacy vs convenience).
- HARD RULE — do NOT name the product or brand in the OPTIONS, and mention the product name at most once in the whole quiz (otherwise say "this one" or the category). Options describe behaviors/priorities only, never a brand name.
- Each question has exactly 4 options. Every option is a DISTINCT POSITION on that trade-off, 8-20 words, stating what the buyer prioritises AND what they accept giving up for it. Never a one-word label, never four rewordings of the same stance, and never a lifestyle anecdote. The four options must map to genuinely different products.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. At most ONE emoji per question and only where it genuinely helps scanning — this is a buying decision, not a chat message.
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

function compareQuizGenerationPrompt(language, count = 5) {
  const langName = languageName(language);
  const majority = count - 2;
  return `You are Qor AI's comparison quiz engine. Generate a focused, high-signal quiz
of EXACTLY ${count} questions that helps choose between multiple product links. Pick only the
${count} most decisive trade-offs — the ones whose answers most change which product wins.
No filler questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the product names, specs, categories, or user profile are in another language, the quiz itself is still written in ${langName}. Never mirror the language of the product context. Only official brand/product/model names and universal technical terms (RTX, USB-C, Wi-Fi…) may stay as-is.


PRODUCT TYPE — HARD RULE (the #1 failure to avoid):
- The item can be ANY category: a CAR, a house, a book, a bicycle, a coffee machine, a washing machine, clothing, a service, a tool — not just electronics.
- NEVER assume it is a phone, laptop or any screen device. Do NOT mention screens, battery life, keyboards, cameras, storage or apps unless the product context genuinely establishes that the item HAS them.
- Read the product context (name, category, store, base analysis) and write questions ONLY about the real item. If the category field is missing or says "general", infer the type from the product NAME and the base analysis text.
- If you genuinely cannot tell what the item is, ask neutral ownership questions about THIS item (how often it will be used, where, by whom, what would make it a regret) — never invent a device type.

QUESTION QUALITY BAR — these must be the DECISIVE questions an expert buyer of THIS category would ask, including the ones the buyer would NOT think of on their own:
- a tablet → viewing distance and one-handed weight, laminated screen for stylus work, ecosystem lock-in, how long they keep devices
- a car → the terrain and annual distance, towing/loading, fuel-cost tolerance, parking and city manoeuvring, how long they keep a vehicle
- a coffee machine → cups per day, milk drinks, counter space, cleaning appetite
- a book → why they are reading it, pace tolerance, prior familiarity with the subject
Derive the equivalent decisive angles for the ACTUAL category in front of you. Generic "what is your budget / which brand" questions are forbidden.

VARIATION — do not produce the same quiz twice: the user message carries a "variationSeed". Use it to choose a DIFFERENT set of decisive angles, a different opening scene, and a different ordering than the most obvious default. Two runs on the same product must not share a question.

WHAT A GOOD QUESTION LOOKS LIKE — copy this register, not these words:
  BAD  (everyday, vague, teaches nothing): "How long does your battery need to last on a busy day?"
  GOOD (names the trade-off AND its cost): "A bigger battery adds weight and thickness, and fast charging trades long-term cell health for convenience. Where do you sit between all-day endurance and a phone that stays light in the hand?"
  BAD  option: "It matters that it lasts until I get home in the evening."
  GOOD option: "Two full days off the charger, and I accept the extra 30-40 g and the slower charging that comes with it."
The good question TEACHES why the trade-off exists; every good option names the gain AND the price paid.
An option that only expresses a feeling is worthless — it cannot separate two products.

Rules:
- Each question is a SUBSTANTIVE BUYING QUESTION of 25-45 words — count them; a 12-word question is a FAILURE and must be rewritten longer. In languages that pack more meaning per word than English (Turkish, Finnish, Hungarian) still write at least 20 words. Write it the way a category expert would interview a buyer: name the concrete trade-off at stake, add the technical or practical consequence that makes it matter, then ask which side the buyer falls on. Casual day-in-the-life vignettes are FORBIDDEN — "you wake up and reach for your phone" is not a question, it is filler. The reader must finish the question knowing something they did not know about the category.
- The quiz must surface which trade-offs matter to the user, not ask generic shopping questions.
- Ask EXACTLY ${count} questions — no more, no fewer — the ${count} most decisive trade-offs that determine which product fits best, whether comparing two products or several.
- Cover real use moments, performance, quality, portability/ergonomics, durability, risk tolerance and long-term ownership.
- Each question exposes one real decision trade-off between the options' differing strengths.
- HARD RULE — NEVER name, write, or hint at any of the compared products or brands in the questions OR in the options. Not even once. The user must NOT be able to tell which option maps to which product. Describe only behaviors, situations and priorities.
- Each question has exactly 4 options. Every option is a DISTINCT POSITION on that trade-off, 8-20 words, stating what the buyer prioritises AND what they accept giving up for it (no brand names, no model names). Each option must silently map to a DIFFERENT product's strength — four rewordings of the same stance make the quiz worthless.
- Make the four options clearly distinct so the answer is meaningful.
- Vary the situations; do not repeat the same day, time, place, or routine across questions.
- Do not use markdown, bold markers, quotation marks, or headline-style labels. At most ONE emoji per question and only where it genuinely helps scanning — this is a buying decision, not a chat message.
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

function subscriptionQuizPrompt(names, isCompare, language, count = 5) {
  const langName = languageName(language);
  return `You are Qor AI's subscription quiz engine. Generate a focused personalized quiz
of EXACTLY ${count} questions to understand the user's needs for: ${names}. Pick only the ${count} most
decisive, highest-signal questions — the ones whose answers most change which service fits
this person best. No filler, no nice-to-have questions.

OUTPUT LANGUAGE — HARD REQUIREMENT: Write EVERY question and EVERY option in ${langName}, and ONLY ${langName}. This is the site's selected language and overrides everything else: even if the service names or user profile are in another language, the quiz itself is still written in ${langName}. Never mirror the language of the context. Only official brand/service names may stay as-is.

The goal: understand how the user uses ${isCompare ? 'these services' : 'this service'},
their specific habits, preferences, and expectations.

VARIATION — do not produce the same quiz twice: the user message carries a "variationSeed". Use it to choose a DIFFERENT set of decisive angles, a different opening scene and a different ordering than the most obvious default. Two runs on the same services must not share a question.

WHAT A GOOD QUESTION LOOKS LIKE — copy this register, not these words:
  BAD  (everyday, vague, teaches nothing): "How long does your battery need to last on a busy day?"
  GOOD (names the trade-off AND its cost): "A bigger battery adds weight and thickness, and fast charging trades long-term cell health for convenience. Where do you sit between all-day endurance and a phone that stays light in the hand?"
  BAD  option: "It matters that it lasts until I get home in the evening."
  GOOD option: "Two full days off the charger, and I accept the extra 30-40 g and the slower charging that comes with it."
The good question TEACHES why the trade-off exists; every good option names the gain AND the price paid.
An option that only expresses a feeling is worthless — it cannot separate two products.

Rules:
- Each question is a SUBSTANTIVE BUYING QUESTION of 25-45 words — count them; a 12-word question is a FAILURE and must be rewritten longer. In languages that pack more meaning per word than English (Turkish, Finnish, Hungarian) still write at least 20 words. Write it the way a category expert would interview a buyer: name the concrete trade-off at stake, add the technical or practical consequence that makes it matter, then ask which side the buyer falls on. Casual day-in-the-life vignettes are FORBIDDEN — "you wake up and reach for your phone" is not a question, it is filler. The reader must finish the question knowing something they did not know about the category.
- Ask EXACTLY ${count} questions — no more, no fewer — the ${count} most decisive ones that determine which service fits best, whether analysing one service or comparing several.
- Ask about real habits and moments: when/where/how they watch, listen, play, create or work, and what they care about (quality, variety, offline use, sharing, discovery, comfort, how often they use it).
- HARD RULE — NEVER name, write, or hint at any of the selected services or brands (or their exact features/menus) in the questions OR in the options. Not even once. The user must NOT be able to tell which option belongs to which service. If a service name would appear, replace it with the neutral behavior instead.
- Each question has exactly 4 options. Every option is a DISTINCT POSITION on that trade-off, 8-20 words, stating what the subscriber prioritises AND what they accept giving up for it — NO brand names, NO service names, NO product-specific feature jargon. Each option must silently map to a DIFFERENT service's strength.
- Make the four options clearly distinct so the answer is meaningful, and keep each option short (a few words to one short clause).
- Vary the situations; do not repeat the same moment, place or time across questions.
- Do not use markdown, bold, quotation marks, or headline-style labels. At most ONE emoji per question and only where it genuinely helps scanning — this is a buying decision, not a chat message.
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

/* ── 7) RAPOR BAGLAMI — kaynak: web/src/components/AiAnalysis.jsx ──── */
const LANG_NAME = { tr: 'Turkish', en: 'English', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian', nl: 'Dutch', pl: 'Polish', sv: 'Swedish', ja: 'Japanese', ar: 'Arabic' };
function langName(lang) { return LANG_NAME[String(lang || 'en').slice(0, 2).toLowerCase()] || 'English'; }
const CURRENT_REPORT_DATE = new Date().toISOString().slice(0, 10);

function compactDate(value) {
  if (!value) return '';
  const n = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date(n).toISOString().slice(0, 10);
}

function availabilityContextForProduct(p, offers = []) {
  const bits = [
    `Current date: ${CURRENT_REPORT_DATE}`,
    `Qor catalog record exists: ${p?.id ? 'yes' : 'unknown'}`,
  ];
  if (p?.sourceUrl) bits.push(`Catalog source URL: ${p.sourceUrl}`);
  if (p?.gtin) bits.push(`GTIN: ${p.gtin}`);
  if (p?.mpn) bits.push(`MPN: ${p.mpn}`);
  if (p?.created || p?.createdAt) bits.push(`Catalog first seen: ${compactDate(p.created || p.createdAt)}`);
  if (p?.updated || p?.lastUpdated) bits.push(`Catalog updated: ${compactDate(p.updated || p.lastUpdated)}`);
  if (p?.scrapedAtTs) bits.push(`Search index scraped: ${compactDate(Number(p.scrapedAtTs) * 1000)}`);
  if (p?.updatedAtTs) bits.push(`Search index updated: ${compactDate(Number(p.updatedAtTs) * 1000)}`);
  if (Number(p?.offerCount) > 0 || Number(p?.pricedOfferCount) > 0) {
    bits.push(`Catalog offer rollup: ${Number(p.offerCount) || 0} links, ${Number(p.pricedOfferCount) || 0} priced offers`);
  }
  if (p?.bestOfferCheckedAt) bits.push(`Best offer checked: ${compactDate(p.bestOfferCheckedAt)}`);
  if (p?.bestOfferExpiresAt) bits.push(`Best offer freshness expires: ${compactDate(p.bestOfferExpiresAt)}`);
  const freshOfferRows = (Array.isArray(offers) ? offers : [])
    .filter((o) => o?.url)
    .slice(0, 8)
    .map((o) => {
      const price = o?.hasExactPrice && Number(o?.price) > 0
        ? `${o.price} ${o.currency || ''}`.trim()
        : 'price link only';
      return `${o.store || o.network || 'store'} ${o.country || ''}: ${price}`;
    });
  if (freshOfferRows.length) bits.push(`Live/store offer context: ${freshOfferRows.join(' | ')}`);
  return bits.filter(Boolean).join('\n');
}

function freshnessRules() {
  return (
    `Freshness rules (current date: ${CURRENT_REPORT_DATE}):\n` +
    '- Prefer current web research and official/store evidence over model memory.\n' +
    '- Never say a product is unannounced, not released, not on the market, or only an estimate if current research, official pages, retailer pages, or the Qor catalog indicate it exists.\n' +
    '- If current web research is unavailable or weak, say the evidence is limited; do not fill the gap with old launch-status assumptions.\n' +
    '- Do not base a current-generation product on the previous generation unless explicitly framed as a comparison.\n' +
    '- Do not treat a laptop fan as a real weakness by itself. Mention fan noise only if research reports it as recurring, or phrase it as sustained-load behavior.\n' +
    '- Judge portability against the same class. Around 2.1 kg is normal/acceptable for a 16-inch workstation laptop, not a severe flaw by default.'
  );
}

const STALE_AVAILABILITY_PATTERNS = [
  /hen[üu]z\s+(?:duyurulmam[ıi]ş|tan[ıi]t[ıi]lmam[ıi]ş|piyasada\s+de[ğg]il|sat[ıi]şa\s+[çc][ıi]kmam[ıi]ş|[çc][ıi]kmad[ıi])/i,
  /(?:daha|hen[üu]z)\s+(?:piyasada|sat[ıi]şta)\s+(?:de[ğg]il|yok)/i,
  /performans\s+tahmin(?:i|leri).{0,90}(?:M4|[öo]nceki\s+nesil|previous generation)/i,
  /M4\s+Max.{0,90}(?:dayan|baz|temel|based)/i,
  /\b(?:unannounced|not yet announced|not yet released|not yet launched|not yet available)\b/i,
  /\bnot\s+(?:yet\s+)?(?:on the market|released|launched)\b/i,
  /performance\s+estimates?.{0,90}(?:M4|previous generation)/i,
];

function hasStaleAvailabilityClaims(raw) {
  const text = String(raw || '');
  return STALE_AVAILABILITY_PATTERNS.some((re) => re.test(text));
}

function withFreshnessRetryInstruction(prompt, productNames = []) {
  const names = (Array.isArray(productNames) ? productNames : [productNames])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ');
  return (
    `${prompt}\n\nQUALITY GATE RETRY:\n` +
    'The previous answer was rejected because it contained stale release/availability claims. Rewrite the JSON from scratch.\n' +
    (names ? `Products that must keep exact names: ${names}\n` : '') +
    freshnessRules() +
    '\nForbidden stale wording includes: unannounced, not on the market, not released, not yet available, based on M4 Max estimates, or equivalent Turkish wording unless current web research explicitly proves it.'
  );
}

function productSpecsContext(p, limit = 40) {
  const rows = [];
  const seen = new Set();
  const put = (k, v) => {
    const key = String(k || '').replace(/\s+/g, ' ').trim();
    const val = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!key || !val) return;
    const sig = key.toLowerCase();
    if (seen.has(sig)) return;
    seen.add(sig);
    rows.push(`${key}: ${val}`);
  };
  if (p?.keySpecs && typeof p.keySpecs === 'object') Object.entries(p.keySpecs).forEach(([k, v]) => put(k, v));
  if (p?.specs && typeof p.specs === 'object') Object.entries(p.specs).forEach(([k, v]) => put(k, v));
  if (p?.specSections && typeof p.specSections === 'object') {
    Object.entries(p.specSections).forEach(([section, specs]) => {
      if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
        Object.entries(specs).forEach(([k, v]) => put(`${section} / ${k}`, v));
      }
    });
  }
  return rows.slice(0, limit).join('; ');
}

function productLine(p, lang) {
  const ks = productSpecsContext(p, 42);
  const priceFresh = Date.parse(p?.bestOfferExpiresAt || '') > Date.now();
  const price = priceFresh && Number(p?.lowestPriceUSD) > 0
    ? `${Number(p.lowestPriceUSD).toFixed(0)} USD`
    : priceFresh && Number(p?.lowestPrice) > 0
      ? `${Number(p.lowestPrice)} ${p.lowestPriceCurrency || ''}`
      : '-';
  const name = displayProductName(p, lang);
  return { name, brand: p?.brand || '', category: p?.category || '', score: p?.techScore || '-', price, ks };
}

function cleanProductForPrompt(p, lang) {
  const name = displayProductName(p, lang);
  return {
    name,
    brand: p?.brand || '',
    category: p?.category || '',
    techScore: Number(p?.techScore) || 0,
    url: productPath(p),
    imageUrl: p?.imageUrl || (Array.isArray(p?.images) ? p.images[0] : ''),
    specs: productSpecsContext(p, 18),
  };
}

function languageGate(lang) {
  return (
    `LANGUAGE HARD GATE: Every user-facing sentence, label, list item, source description, button-like value, and explanation must be fully written in ${langName(lang)}. ` +
    'Only brand names, official product/model names, source names such as Reddit/YouTube/Amazon, and technical standards such as Thunderbolt, Wi-Fi, RTX, macOS may remain as-is. ' +
    'Do not output English UI labels such as "quiz answers", "similar products", "retailer reviews", "buy", "wait", "source types", "best time", or "community/review research" when the requested language is not English.'
  );
}

function quizLines(answers = []) {
  const list = (Array.isArray(answers) ? answers : [])
    .filter((a) => a?.answer != null)
    .map((a, i) => `${i + 1}. ${a.question}: ${a.answer}`);
  return list.length ? list.join('\n') : 'No product-specific quiz answers were provided.';
}

function promptContext({ quizAnswers = [], research = '', similarProducts = [], offers = [], heroSpecs = [] } = {}, lang) {
  const similar = (Array.isArray(similarProducts) ? similarProducts : [])
    .slice(0, 8)
    .map((p) => cleanProductForPrompt(p, lang));
  const offerRows = (Array.isArray(offers) ? offers : [])
    .slice(0, 8)
    .map((o) => ({
      store: o?.store || o?.network || '',
      price: o?.hasExactPrice ? `${o.price || ''} ${o.currency || ''}`.trim() : '',
      country: o?.country || '',
      checkedAt: o?.lastCheckedAt || '',
      fresh: o?.hasExactPrice === true,
    }));
  return {
    quizAnswers: quizLines(quizAnswers),
    research: String(research || '').slice(0, 6500),
    similarProducts: similar,
    offers: offerRows,
    heroSpecs: Array.isArray(heroSpecs) ? heroSpecs.slice(0, 12) : [],
  };
}

// ─── Prompts — mirror lib/presentation/providers/cache_providers.dart ───────
function buildDeepPrompt(p, lang) {
  const { name, brand, category, score, price, ks } = productLine(p, lang);
  return (
    `You are a senior tech product analyst. The product name is exactly "${name}" by ${brand || 'unknown'} (category: ${category}). ` +
    'Do NOT assume any typo in the product name — use it exactly as given.\n\n' +
    `IMPORTANT: Return ONLY valid JSON. ALL text fields, list items, and the verdict MUST be fully written in ${langName(lang)}.\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "overallScore": <number 0-100>,\n  "strengths": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],\n' +
    '  "weaknesses": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],\n' +
    '  "pros": ["<pro1>", "<pro2>", "<pro3>"],\n  "cons": ["<con1>", "<con2>", "<con3>"],\n  "verdict": "<2-3 sentence final verdict>"\n}\n\n' +
    'Rules:\n- Provide 3-5 strengths and 2-4 weaknesses\n- Scores realistic and varied (not all 80-90)\n' +
    '- Pros/cons specific and informative (8-18 words each)\n- Verdict must include concrete evidence\n- Be honest and specific.\n\n' +
    `Context: techScore=${score}/100, approx price=${price}, key specs: ${ks || '-'}`
  );
}
function buildAltPrompt(p, lang) {
  const { name, brand, category, price, ks } = productLine(p, lang);
  return (
    `You are a senior tech product analyst. For the product "${name}" by ${brand || 'unknown'} (category: ${category}), suggest the 3 strongest real, currently-available alternatives.\n\n` +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)} (keep official product/model names as-is).\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "alternatives": [\n    {"name": "<product name>", "advantage": "<1 sentence why it can be better>", "tradeoff": "<1 sentence what you give up>", "priceComparison": "<cheaper/similar/pricier + short note>", "bestFor": "<who it fits>", "whyBetter": "<1 concrete spec-based reason>"}\n  ]\n}\n\n' +
    'Rules:\n- Exactly 3 alternatives, real models in the same category/segment\n- Be specific and grounded; no generic filler.\n\n' +
    `Context: approx price=${price}, key specs: ${ks || '-'}`
  );
}
function buildAdvisorPrompt(p, lang, profile = {}) {
  const { name, brand, category, price, ks } = productLine(p, lang);
  const prof = Object.entries(profile).filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).slice(0, 14).join('; ');
  return (
    `You are an AI product advisor. For "${name}" by ${brand || 'unknown'} (category: ${category}), give tailored buying advice.\n\n` +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)}.\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "whoShouldBuy": "<2-3 sentences>",\n  "whoShouldAvoid": "<2-3 sentences>",\n  "reasonsToBuy": ["<r1>", "<r2>", "<r3>"],\n  "reasonsToSkip": ["<r1>", "<r2>"],\n  "proTips": ["<tip1>", "<tip2>"],\n  "valueRating": <number 0-10 with one decimal>,\n  "ratingExplanation": "<1-2 sentences>"\n}\n\n' +
    'Rules:\n- Be specific and grounded in the specs.\n- valueRating reflects price/performance honestly.\n\n' +
    `Context: approx price=${price}, key specs: ${ks || '-'}` + (prof ? `\nUser profile: ${prof}` : '')
  );
}
function buildPredictionPrompt(p, lang) {
  const { name, brand, category, price, ks } = productLine(p, lang);
  return (
    `You are an AI price forecaster. For "${name}" by ${brand || 'unknown'} (category: ${category}), predict the near-term price trend.\n\n` +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)}.\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "trend": "<up|down|stable>",\n  "trendPercentage": <number 0-100, magnitude of expected change>,\n  "bestTimeToBuy": "<short phrase, e.g. a month/season>",\n  "expectedDrop": "<expected % range within 6 months>",\n  "buyOrWait": "<buy|wait>",\n  "reasoning": "<2-3 sentences>"\n}\n\n' +
    'Rules:\n- Base it on product age, category cycle, supply/demand and successor timing.\n\n' +
    `Context: approx current price=${price}, key specs: ${ks || '-'}`
  );
}

// Forum / community satisfaction — synthesises what people say across public
// forums (Reddit, XDA, dedicated communities, retailer reviews) into a single
// satisfaction percentage + praise / complaints. Mirrors the app's
// "Community Satisfaction" review analysis.
function buildForumPrompt(p, lang) {
  const { name, brand, category, ks } = productLine(p, lang);
  return (
    `You are Qor AI analysing public community sentiment for "${name}" by ${brand || 'unknown'} (category: ${category}). ` +
    'Base it on widely-known discussions across public forums and communities (e.g. Reddit, XDA, dedicated enthusiast forums, large retailer review sections). ' +
    'Do NOT invent specific quotes or fake numbers — give a grounded synthesis.\n\n' +
    `IMPORTANT: Return ONLY valid JSON. ALL text MUST be written in ${langName(lang)} (keep forum/site names as-is).\n\n` +
    'Return a JSON object with this EXACT structure:\n' +
    '{\n  "satisfaction": <number 0-100, overall % of owners who seem satisfied>,\n' +
    '  "summary": "<2-3 sentence synthesis of the community consensus>",\n' +
    '  "praise": ["<most common praise>", "<...>", "<...>"],\n' +
    '  "complaints": ["<most common complaint>", "<...>"],\n' +
    '  "sources": ["<forum/site 1>", "<forum/site 2>"],\n' +
    '  "verdict": "<1 sentence overall community verdict>"\n}\n\n' +
    'Rules:\n- satisfaction realistic (not always 90+).\n- 3-5 praise, 2-4 complaints.\n- Cite the kinds of communities where this product is discussed.\n\n' +
    `Context: key specs: ${ks || '-'}`
  );
}

function buildProductResearchPrompt(p, lang, context = {}) {
  const { name, brand, category, score, price, ks } = productLine(p, lang);
  return (
    `Research the product "${name}" by ${brand || 'unknown'} for a Qor AI purchase report.\n` +
    `Category: ${category || '-'}\nTech score in catalog: ${score}/100\nApprox catalog price: ${price}\nCatalog specs: ${ks || '-'}\n\n` +
    `MARKET STATUS CONTEXT:\n${availabilityContextForProduct(p)}\n\n` +
    `${freshnessRules()}\n${languageGate(lang)}\n\n` +
    'Use current web search. Focus on official spec pages, current retailer/store pages, public ownership/review sentiment from Reddit, YouTube reviews, large retailer reviews, specialist review sites, and recent market/price-cycle signals. '
    // KRONIK SORUN AYRI BIR ARAMA. Genel "yorumlari tara" talimati spec
    // sayfasindan da okunabilen eksileri getiriyor; sahiplik sonrasi tekrar
    // eden arizalar ancak ozellikle aranirsa cikiyor.
    + 'SEARCH SEPARATELY FOR CHRONIC PROBLEMS: failures owners report after months of use, threads about a defect or a bad batch, warranty/RMA experiences, a firmware or driver update that broke something and whether it was fixed. For each note what fails, how far into ownership it appears, whether a workaround exists, and how widespread it is. Also note what owners bring up unprompted as the best part. If there is genuinely no recurring problem, say so — that is a real finding. ' +
    'First determine whether the product is announced/released/available today, then summarize ownership evidence. Do not invent direct quotes, exact review counts, or exact current prices. If evidence is weak, say so clearly.\n\n' +
    `Product-specific quiz answers:\n${quizLines(context.quizAnswers)}\n\n` +
    `Reply in ${langName(lang)} with concise research notes only; no JSON is required.`
  );
}

function buildCompareResearchPrompt(products, lang, context = {}) {
  const lines = (products || []).map((p, i) => {
    const { name, brand, category, score, price, ks } = productLine(p, lang);
    return `${i + 1}. ${name} (${brand || '?'}, ${category || '?'}) score=${score}/100 price=${price}; specs=${ks || '-'}`;
  }).join('\n');
  return (
    'Research these products for a Qor AI comparison report.\n\n' +
    `${lines}\n\n` +
    `MARKET STATUS CONTEXT:\n${(products || []).map((p, i) => `Product ${i + 1}:\n${availabilityContextForProduct(p)}`).join('\n\n')}\n\n` +
    `${freshnessRules()}\n${languageGate(lang)}\n\n` +
    'Use current web search. For each product, gather current availability/status, public sentiment from Reddit, YouTube, specialist reviews, retailer reviews, official spec pages, and price-cycle signals. ' +
    'Then note the decisive differences that matter for a buyer choosing one. Do not invent quotes, exact counts, or exact live prices.\n\n' +
    `Comparison quiz answers:\n${quizLines(context.quizAnswers)}\n\n` +
    `Reply in ${langName(lang)} with concise research notes only; no JSON is required.`
  );
}

// Consolidated single-call prompt: quiz answers + catalog specs + optional web
// research become one continuous report in the requested order.
function buildFullPrompt(p, lang, profile = {}, context = {}) {
  const { name, brand, category, score, price, ks } = productLine(p, lang);
  const ctx = promptContext(context, lang);
  const prof = Object.entries(profile).filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).slice(0, 18).join('; ');
  return (
    `You are Qor AI's senior product analyst and product advisor. Analyse "${name}" by ${brand || 'unknown'} (category: ${category}). ` +
    'Use the product name exactly as given. Do not replace it with a similar model.\n\n' +
    `${languageGate(lang)}\n\n` +
    'CRITICAL OUTPUT ORDER: one single continuous report: match/advisor/deep analysis first, internet/community sentiment second, smart alternatives third, price forecast last.\n' +
    `${freshnessRules()}\n` +
    'Use catalog specs and quiz answers as verified inputs. Use research notes only when they support a claim; if something is not verified, say it is uncertain. Never invent direct quotes, exact review counts, or exact live prices.\n' +
    'Write like a professional buyer lab report: concrete, decisive, and detailed. Avoid generic praise. Mention exact catalog specs, compatibility constraints, who benefits, who should avoid it, and why.\n\n' +
    'Return ONLY one valid JSON object with this exact structure:\n' +
    '{\n' +
    '  "type": "product_full_report",\n' +
    '  "product": {\n' +
    '    "name": "exact product name",\n' +
    '    "matchScore": <0-100>,\n' +
    '    "decision": "buy|consider|skip",\n' +
    '    "confidence": <0-100>,\n' +
    '    "headline": "one decisive sentence a buyer can act on",\n' +
    '    "matchComment": "5-7 detailed sentences explaining quiz/profile fit, trade-offs, and who should care",\n' +
    '    "reviewedInputs": ["<input/source label in requested language>", "<input/source label in requested language>"],\n' +
    '    "factors": [{"label": "Usage fit", "score": <0-100>, "detail": "2 detailed sentences with evidence"}],\n' +
    '    "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences on why it changes the decision", "severity": "high|mid|low"}],\n' +
    '    "quizInsights": [{"topic": "what the question was about", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences on how it moved the score"}],\n' +
    '    "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 detailed sentences with evidence"}],\n' +
    '    "analysis": "8-11 substantial paragraphs, each 45-85 words: technical overview, performance/quality, compatibility, longevity, risks, buying advice; merge AI product advisor here",\n' +
    '    "strengths": ["6 detailed strengths grounded in specs"],\n' +
    '    "weaknesses": ["5 detailed drawbacks a buyer can judge BEFORE paying — size, weight, price, a missing accessory, a spec that falls short, ecosystem lock-in. Failures, crashes, overheating, defects and support problems do NOT belong here; they go in community.chronicIssues"],\n' +
    '    "reliabilityNotes": [{"title": "what the MANUFACTURER PROMISES: warranty term, official software-support window, service-network reach, spare-part or battery-replacement availability", "detail": "1-2 sentences"}],\n' +
    // Bu alan bir ARIZA LISTESI DEGIL. Sinir yazilmadigi surece model buraya
    // kronik sorunlari kopyaliyordu; okuyucu ayni olguyu ucuncu kez
    // goruyordu ("Batarya ve Yapiskan Sorunlari" hem burada, hem
    // chronicIssues, hem weaknesses icindeydi.)
    '    NOTE on reliabilityNotes: state what the maker COMMITS TO (years of updates, warranty length, service coverage, parts availability). Never restate a defect here — defects belong to community.chronicIssues.\n' +
    '    "bestFor": "1-2 sentences describing the buyer this is perfect for",\n' +
    '    "notFor": "1-2 sentences describing who should skip it",\n' +
    '    "overallVerdict": "2-3 sentence closing verdict"\n' +
    '  },\n' +
    '  "community": {\n' +
    '    "satisfaction": <0-100>,\n' +
    '    "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>},\n' +
    '    "themes": [{"label": "recurring discussion topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}],\n' +
    '    "summary": "5-7 substantial paragraphs synthesizing Reddit, YouTube, retailer reviews, forums and specialist reviews. Explain HOW opinion is distributed and WHERE it splits — which kinds of buyer disagree and why, which claims are well-evidenced and which are anecdotal. Do NOT re-list the items already in lovedFeatures and chronicIssues; the reader has just read them.",\n' +
    '    "lovedFeatures": [{"title": "what owners single out as the best part", "detail": "1-2 sentences on WHY it keeps coming up"}],\n' +
    '    "chronicIssues": [{"title": "a recurring, well-documented FAILURE owners hit AFTER paying — a defect, a breakage, degradation over time, or a support breakdown. Size, weight, price, a missing accessory or a spec that merely falls short are NOT chronic issues; those belong in product.weaknesses", "detail": "1-2 sentences: what fails, when it shows up, whether there is a fix or workaround", "frequency": "widespread|common|occasional"}],\n' +
    '    "sources": ["Reddit", "<source type in requested language>", "<source type in requested language>"],\n' +
    '    "verificationNotes": ["what is directly grounded", "what remains uncertain"]\n' +
    '  },\n' +
    '  "alternatives": [\n' +
    '    {"name": "product name", "imageUrl": "copy from Qor catalog context when available, otherwise empty", "url": "copy from Qor catalog context when available, otherwise empty", "source": "qor_catalog|external", "keySpecs": [{"label": "spec", "value": "value"}], "difference": "2-3 sentences vs target", "shortComment": "1-2 sentence recommendation"}\n' +
    '  ],\n' +
    '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "specific month/season/window", "buyOrWait": "buy|wait|watch", "drivers": ["5 concrete drivers"], "analysis": "5-7 substantial paragraphs with researched reasoning and caveats"}\n' +
    '}\n\n' +
    'Rules:\n' +
    '- community.sentimentBreakdown must be integer percentages summing to ~100, realistic (never all-positive) and consistent with community.summary.\n' +
    '- community.themes must include 5-6 recurring discussion topics with varied sentiment (never all positive).\n' +
    // KRONIK SORUN != EKSI. Eksiler urunun ozelliklerinden cikarilabilir
    // ("pahali", "agir"); kronik sorun ancak SAHIPLIK sonrasi ortaya cikar ve
    // forumlarda TEKRAR EDER. Ikisini ayni sey saymak raporda ayni listeyi
    // iki kez basiyordu.
    '- community.chronicIssues: 3-5 problems owners keep reporting AFTER living with it — failures that appear over months, a batch with a known defect, a firmware/driver issue that keeps returning, support that keeps disappointing. NOT a restatement of product.weaknesses: a weakness is visible on the spec sheet, a chronic issue only shows up in ownership. If research covers none, return an empty array and say so in verificationNotes — do NOT invent one and do NOT downgrade a spec-sheet drawback into this list.\n' +
    '- community.lovedFeatures: 3-5 things owners single out unprompted as the best part. Same rule: what OWNERS keep saying, not what the spec sheet implies.\n' +
    // TEK YONLU KURAL YETMIYOR. Olculdu (iPhone 16 Pro Max, 2026-08-22):
    // kronik sorunlar temizdi ama zayif yanlar listesine "yazilimsal hatalar
    // ve asiri isinma" sizmisti — ayni sey iki bolumde. Sinir IKI TARAFA da
    // yazilmali.
    '- product.weaknesses must stay on the DECISION side: size, weight, price, a missing accessory, a spec that falls short, ecosystem lock-in — things a buyer can judge before paying. Do NOT list failures, crashes, overheating, defects or support problems there; those belong to community.chronicIssues and repeating them makes the report say the same thing twice.\n' +
    '- product.criticalPoints must include 4-6 things that genuinely change the decision (compatibility traps, hidden costs, ecosystem lock-in, missing accessories, service coverage) — not restated specs.\n' +
    // TEK OLGU, TEK YER. Olculdu: bu sinir yokken model ayni 4-5 olguyu
    // weaknesses + criticalPoints + reliabilityNotes + chronicIssues +
    // summary icine kopyaliyordu, yani okuyucu ayni sikayeti BES KEZ
    // goruyordu. Alan alan sinir yazmak yetmedi; birlestiren kural sart.
    '- ONE FACT, ONE PLACE. product.strengths, product.weaknesses, product.criticalPoints, product.reliabilityNotes, community.lovedFeatures and community.chronicIssues must not share a single fact between them. Before writing an item, check whether another list already covers it; if it does, drop it or write the genuinely different angle. Each list answers its own question: strengths/weaknesses = what a buyer can judge BEFORE paying · criticalPoints = what would flip the decision itself · reliabilityNotes = what the maker promises · lovedFeatures/chronicIssues = what owners report AFTER living with it.\n' +
    '- product.quizInsights must reference the ACTUAL quiz answers listed below, one entry per answered question (4-6). impact is negative when the answer works against this product. Never invent an answer that was not given.\n' +
    '- product.factors must include 8-10 varied factor scores for chart bars. Use labels that a buyer understands.\n' +
    '- featureMatches must include 8-10 spec/need matches using real catalog spec values where possible.\n' +
    '- alternatives must include 3 products. Prefer Qor catalog alternatives if they fit; copy imageUrl/url exactly from the context for those. External alternatives may have empty imageUrl/url.\n' +
    '- priceForecast must not pretend to know live prices unless research notes include them. Use market cycles, product age, availability, successor timing and retailer behavior.\n\n' +
    `MARKET / AVAILABILITY CONTEXT:\n${availabilityContextForProduct(p, context.offers)}\n\n` +
    `PRODUCT CONTEXT:\nName: ${name}\nBrand: ${brand || '-'}\nCategory: ${category || '-'}\nQor AI Tech Score: ${score}/100\nApprox catalog price: ${price}\nCatalog specs: ${ks || '-'}\nHero specs: ${JSON.stringify(ctx.heroSpecs)}\n\n` +
    `PRODUCT-SPECIFIC QUIZ ANSWERS:\n${ctx.quizAnswers}\n\n` +
    (prof ? `USER PROFILE / USER-RECOGNITION SIGNALS:\n${prof}\n\n` : '') +
    `QOR CATALOG ALTERNATIVES:\n${JSON.stringify(ctx.similarProducts, null, 2)}\n\n` +
    `OFFER CONTEXT:\n${JSON.stringify(ctx.offers, null, 2)}\n\n` +
    `WEB RESEARCH NOTES:\n${ctx.research || 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}`
  );
}

// Compare prompt — same single-report system as product detail, repeated per
// product and ending with a charted final recommendation.
function buildComparePrompt(products, lang, profile = {}, context = {}) {
  const lines = (products || []).map((p) => {
    const { name, brand, category, score, ks } = productLine(p, lang);
    return `- ${name} (${brand || '?'} / ${category || '?'}; techScore=${score}; specs: ${ks || '-'})`;
  }).join('\n');
  const productPayload = (products || []).map((p) => cleanProductForPrompt(p, lang));
  const ctx = promptContext(context, lang);
  const prof = Object.entries(profile).filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).slice(0, 18).join('; ');
  // Output is one JSON object covering EVERY product. The provider that actually
  // serves these (DeepSeek) caps output at ~8k tokens, so a fixed "7-10
  // paragraphs per product" overflows and truncates the JSON the moment there
  // are 3+ products — which is exactly when the report "kept failing". Scale the
  // requested verbosity down as the product count rises so the whole object
  // always completes; depth stays high for 2-way compares, stays readable for 5.
  const n = (products || []).length;
  const big = n >= 4;
  const mid = n === 3;
  const v = {
    matchSent: big ? '3-4' : mid ? '4-5' : '5-7',
    factorN: big ? '5-6' : mid ? '6-7' : '8-10',
    featN: big ? '5-6' : mid ? '6-7' : '8-10',
    analysisPara: big ? '2-3' : mid ? '3-4' : '6-8',
    prosN: big ? '3' : mid ? '4' : '6',
    consN: big ? '3' : '4-5',
    commPara: big ? '2' : mid ? '2-3' : '4-5',
    fcPara: big ? '1-2' : mid ? '2' : '3-4',
    diffN: big ? '4' : mid ? '5' : '6',
    h2hPara: big ? '2-3' : mid ? '3-4' : '5-6',
    recPara: big ? '3' : mid ? '3-4' : '5-6',
  };
  return (
    'You are Qor AI\'s senior product comparison analyst. Evaluate every listed product separately using the same system as product detail, then give a final recommendation.\n\n' +
    `${languageGate(lang)}\n\n` +
    `${freshnessRules()}\n\n` +
    'Return ONLY one valid JSON object with this exact structure:\n' +
    '{\n' +
    '  "type": "compare_full_report",\n' +
    '  "products": [\n' +
    `    {"name": "exact product name", "imageUrl": "copy from product context", "url": "copy from product context", "matchScore": <0-100>, "decision": "buy|consider|skip", "confidence": <0-100>, "headline": "one decisive sentence", "matchComment": "${v.matchSent} detailed sentences", "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}], "criticalPoints": [{"title": "warning/insight", "detail": "2 sentences", "severity": "high|mid|low"}], "quizInsights": [{"topic": "topic", "answer": "user answer", "impact": <-100..100>, "note": "1-2 sentences"}], "featureMatches": [{"label": "feature/spec", "productValue": "value", "userNeed": "need", "score": <0-100>, "comment": "2 evidence-based sentences"}], "analysis": "${v.analysisPara} substantial paragraphs, each 45-85 words", "pros": ["${v.prosN} detailed pros"], "cons": ["${v.consN} detailed cons"], "bestFor": "1-2 sentences", "notFor": "1-2 sentences", "community": {"satisfaction": <0-100>, "themes": [{"label": "topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}], "summary": "${v.commPara} substantial paragraphs", "lovedFeatures": [{"title": "what owners single out", "detail": "1 sentence"}], "chronicIssues": [{"title": "recurring ownership problem", "detail": "1 sentence", "frequency": "widespread|common|occasional"}], "sources": ["source types"]}, "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "${v.fcPara} substantial paragraphs"}}\n` +
    '  ],\n' +
    `  "comparison": {"winner": "exact product name", "winnerScore": <0-100>, "scoreGap": <number>, "chart": [{"name": "product", "score": <0-100>, "reason": "short reason"}], "factorMatrix": [{"label": "factor", "scores": [{"name": "product", "score": <0-100>}]}], "decisiveDifferences": ["${v.diffN} detailed differences"], "headToHead": "${v.h2hPara} substantial paragraphs", "recommendation": "${v.recPara} substantial paragraphs explaining which one to buy and why"}\n` +
    '}\n\n' +
    `Rules:\n- Include one products[] entry for EVERY product (${n} total). Names must match exactly.\n- First evaluate products separately; only then decide the final winner.\n- Each product must include ${v.factorN} factor scores and ${v.featN} feature matches so the UI can render charts and spec-fit grids.\n- Write concrete professional prose, not generic summaries. Mention exact specs, compatibility, availability uncertainty, buyer profile, and trade-offs.\n- Stay within the requested paragraph/item counts so the JSON object is COMPLETE and valid for all ${n} products — never truncate mid-object.\n- Scores must be realistic, varied and based on quiz answers, profile signals, catalog specs and research notes.\n- Cite uncertainty instead of inventing live prices, review counts or quotes.\n\n` +
    `MARKET / AVAILABILITY CONTEXT:\n${(products || []).map((p, i) => `Product ${i + 1}:\n${availabilityContextForProduct(p)}`).join('\n\n')}\n\n` +
    `PRODUCTS:\n${lines}\n\nPRODUCT PAYLOAD:\n${JSON.stringify(productPayload, null, 2)}\n\n` +
    `COMPARISON QUIZ ANSWERS:\n${ctx.quizAnswers}\n\n` +
    (prof ? `USER PROFILE / USER-RECOGNITION SIGNALS:\n${prof}\n\n` : '') +
    `WEB RESEARCH NOTES:\n${ctx.research || 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}`
  );
}

// One product's section of a comparison report, generated in its OWN call so it
// always completes within the provider's ~8k output cap. The single combined
// compare prompt above truncates (finish_reason=length) the moment there are 3+
// products; the compare flow now chunks per product with this prompt + a small
// verdict call instead, then assembles the same compare_full_report shape.
function buildCompareProductPrompt(product, lang, profile = {}, context = {}) {
  const { name, brand, category, score, price, ks } = productLine(product, lang);
  const ctx = promptContext(context, lang);
  const peers = (context.peerNames || []).filter((nm) => nm && nm !== name);
  const prof = Object.entries(profile).filter(([, val]) => val != null && val !== '' && (!Array.isArray(val) || val.length))
    .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(', ') : JSON.stringify(val)}`).slice(0, 18).join('; ');
  return (
    `You are Qor AI's senior product analyst. Produce ONE product's section of a multi-product comparison report. Evaluate ONLY "${name}" by ${brand || 'unknown'} (category: ${category}), but judge it in the CONTEXT of being compared against: ${peers.join(', ') || 'the other selected products'}.\n\n` +
    `${languageGate(lang)}\n\n${freshnessRules()}\n\n` +
    'Use catalog specs and quiz answers as verified inputs; use research notes only when they support a claim. Write like a professional buyer lab report: concrete, decisive, detailed. Never invent direct quotes, exact review counts, or exact live prices.\n\n' +
    'Return ONLY one valid JSON object for THIS product with this exact structure:\n' +
    '{\n' +
    '  "name": "exact product name",\n' +
    '  "matchScore": <0-100>,\n' +
    '  "decision": "buy|consider|skip",\n' +
    '  "confidence": <0-100>,\n' +
    '  "headline": "one decisive sentence",\n' +
    '  "matchComment": "5-6 detailed sentences on fit, trade-offs and who should care, relative to the other compared products",\n' +
    '  "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}],\n' +
    '  "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences", "severity": "high|mid|low"}],\n' +
    '  "quizInsights": [{"topic": "topic", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences"}],\n' +
    '  "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 evidence-based sentences"}],\n' +
    '  "analysis": "5-7 substantial paragraphs, each 45-85 words",\n' +
    '  "pros": ["6 detailed pros"],\n' +
    '  "cons": ["5 detailed cons"],\n' +
    '  "bestFor": "1-2 sentences",\n' +
    '  "notFor": "1-2 sentences",\n' +
    '  "overallVerdict": "2-3 sentence closing verdict for THIS product",\n' +
    '  "community": {"satisfaction": <0-100>, "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}, "themes": [{"label": "topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}], "summary": "3-4 substantial paragraphs", "lovedFeatures": [{"title": "what owners single out", "detail": "1 sentence"}], "chronicIssues": [{"title": "recurring ownership problem", "detail": "1 sentence", "frequency": "widespread|common|occasional"}], "sources": ["source types"]},\n' +
    '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "2-3 substantial paragraphs"}\n' +
    '}\n\n' +
    'Rules:\n- Include 8-10 factor scores and 8-10 feature matches so the UI can render charts and spec-fit grids.\n- Include 4-6 criticalPoints, 4-6 quizInsights tied to the ACTUAL quiz answers below (impact negative when an answer works against this product), and 4-6 community.themes with varied sentiment.\n- Scores realistic and varied, based on quiz answers, profile signals, catalog specs and research notes.\n- Stay within the requested counts so the JSON object is COMPLETE and valid — never truncate mid-object.\n- Cite uncertainty instead of inventing live prices, review counts or quotes.\n\n' +
    `MARKET / AVAILABILITY CONTEXT:\n${availabilityContextForProduct(product)}\n\n` +
    `PRODUCT:\nName: ${name}\nBrand: ${brand || '-'}\nCategory: ${category || '-'}\nQor AI Tech Score: ${score}/100\nApprox catalog price: ${price}\nCatalog specs: ${ks || '-'}\nFull payload: ${JSON.stringify(cleanProductForPrompt(product, lang))}\n\n` +
    `COMPARED AGAINST: ${peers.join(', ') || '-'}\n\n` +
    `COMPARISON QUIZ ANSWERS:\n${ctx.quizAnswers}\n\n` +
    (prof ? `USER PROFILE / USER-RECOGNITION SIGNALS:\n${prof}\n\n` : '') +
    `WEB RESEARCH NOTES:\n${ctx.research || 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}`
  );
}

// Final cross-product verdict, generated from the already-built per-product
// reviews (passed in as compact summaries) plus the quiz/research context.
function buildCompareVerdictPrompt(products, reports = [], lang, profile = {}, context = {}) {
  const ctx = promptContext(context, lang);
  const names = (products || []).map((p) => productLine(p, lang).name);
  const summaries = (reports || []).map((r) => ({
    name: r?.name,
    matchScore: r?.matchScore,
    summary: firstSentences(r?.matchComment, 3),
    pros: arr(r?.pros).slice(0, 4),
    cons: arr(r?.cons).slice(0, 4),
    topFactors: arr(r?.factors).slice(0, 8).map((f) => ({ label: f?.label, score: f?.score })),
  }));
  const prof = Object.entries(profile).filter(([, val]) => val != null && val !== '' && (!Array.isArray(val) || val.length))
    .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(', ') : JSON.stringify(val)}`).slice(0, 18).join('; ');
  return (
    'You are Qor AI\'s senior comparison analyst. Each product already has its own full review (compact summaries below). Produce ONLY the final cross-product comparison verdict.\n\n' +
    `${languageGate(lang)}\n\n${freshnessRules()}\n\n` +
    'Return ONLY one valid JSON object with this exact structure:\n' +
    '{\n' +
    `  "winner": "exact product name — must be exactly one of: ${names.join(' | ')}",\n` +
    '  "winnerScore": <0-100>,\n' +
    '  "scoreGap": <number>,\n' +
    '  "chart": [{"name": "product", "score": <0-100>, "reason": "short reason"}],\n' +
    '  "factorMatrix": [{"label": "factor", "scores": [{"name": "product", "score": <0-100>}]}],\n' +
    '  "decisiveDifferences": ["5-6 detailed differences"],\n' +
    '  "headToHead": "5-7 substantial paragraphs",\n' +
    '  "recommendation": "5-7 substantial paragraphs explaining which one to buy and why"\n' +
    '}\n\n' +
    `Rules:\n- chart must include EVERY product (${names.length} total) by exact name.\n- factorMatrix: 6-8 shared factors, each scored for every product by exact name.\n- winner MUST be one of the listed names exactly.\n- Be decisive and concrete; ground it in the per-product summaries, quiz answers and research.\n- Stay within the counts so the JSON is COMPLETE and valid.\n\n` +
    `PRODUCTS (in column order): ${names.join(', ')}\n\n` +
    `PER-PRODUCT REVIEW SUMMARIES:\n${JSON.stringify(summaries, null, 2)}\n\n` +
    `COMPARISON QUIZ ANSWERS:\n${ctx.quizAnswers}\n\n` +
    (prof ? `USER PROFILE / USER-RECOGNITION SIGNALS:\n${prof}\n\n` : '') +
    `WEB RESEARCH NOTES:\n${ctx.research || 'No grounded research notes were available.'}`
  );
}

// ─── Parsing ────────────────────────────────────────────────────────────────
function parseAiJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // strip ```json … ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // grab the outermost {...}
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { /* noop */ }
  // last-ditch: remove trailing commas
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}

/* ── 8) GROUNDED ARASTIRMA SISTEM PROMPT'U ─────────────────────────────────
   Kaynak: web/src/lib/ai.js -> askQorAiGrounded. Arastirma notlari raporun
   TAZELIK dayanagi; admin ve site ayni talimatla arastirmak zorunda. */
function groundedResearchSystemPrompt(lang) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `You are Qor AI's web research assistant. Current date: ${today}. ` +
    'You MUST use the provided Google Search grounding tool for product status, official specs, market availability, review/community sentiment, and price-cycle signals. ' +
    'Do not answer from model memory for launch status or availability. If search evidence is thin, say exactly what is uncertain instead of guessing. ' +
    `Reply in ${langName(lang)}. Summarize evidence, source types, current market status, and uncertainty. ` +
    'Do not invent quotes, exact prices, or review counts.'
  );
}

/* ── 9) YAYIN META'SI ──────────────────────────────────────────────────────
   Yayinlanan analizin BASLIGI, OZETI, meta etiketleri ve SSS'i. Iki dil TEK
   cagrida uretilir; ayni dilde iki analizin ayni meta'yi tasimamasi icin
   `usedTitles` / `usedDescriptions` yasakli liste olarak gonderilir. */
function buildPublishMetaPrompt({ subject, kind, report, used = {} }) {
  // `compare` dali YOKTU ve karsilastirma "a product analysis" olarak
  // tanitiliyordu: model tek urun basligi yaziyordu ("Samsung Galaxy S26 Ultra
  // Alinir Mi?"), oysa sayfa IKI urunu karsilastiriyor.
  const kindWord = kind === 'link' ? 'a product-link analysis'
    : kind === 'subscription' ? 'a subscription analysis'
      : kind === 'compare' ? 'a HEAD-TO-HEAD COMPARISON of several products'
        : 'a product analysis';
  const usedT = arr(used.titles).slice(0, 60);
  const usedD = arr(used.descriptions).slice(0, 60);
  return (
    `You are Qor AI's SEO editor. Write the publishing metadata for ${kindWord} of "${subject}" that is about to go live on qorai.net.\n\n` +
    'Return ONLY one valid JSON object with this exact structure:\n' +
    '{\n' +
    '  "tr": {"title": "", "lead": "", "metaTitle": "", "metaDescription": "", "faq": [{"q": "", "a": ""}]},\n' +
    '  "en": {"title": "", "lead": "", "metaTitle": "", "metaDescription": "", "faq": [{"q": "", "a": ""}]}\n' +
    '}\n\n' +
    'Rules:\n' +
    '- `tr` is Turkish, `en` is English. Keep official brand/product names as-is in both.\n' +
    (kind === 'compare'
      ? '- THIS IS A COMPARISON. The title and metaTitle must name the products being compared (or say '
        + '"X vs Y"), and must state WHICH ONE WINS and for whom. A title naming only one of them is WRONG. '
        + 'The lead must give the verdict in one sentence: which product, for which buyer, on what evidence. '
        + 'FAQ questions must be comparison questions ("which one has the better camera", "is X worth the '
        + 'extra over Y"), never single-product questions.\n'
      : '') +
    '- title: the on-page H1. Max 70 characters. Must name the subject and say what the page decides, not just what it is. Never a bare product name.\n' +
    '- lead: 1-2 sentences, max 200 characters, the answer a reader came for. No marketing wording, no "in this article".\n' +
    '- metaTitle: max 60 characters INCLUDING spaces. Different wording from `title` — not a truncation of it.\n' +
    '- metaDescription: 140-155 characters. Must contain one concrete number or verdict word from the report so it cannot be confused with another page.\n' +
    '- faq: 4-6 entries. Questions must be what a real buyer types into a search box ("battery life", "is it good for gaming"), NEVER a restatement of the title. Answers 2-3 sentences, grounded ONLY in the report below.\n' +
    '- Do not invent specs, prices or review counts. If the report does not support a claim, leave it out.\n' +
    (usedT.length ? `- FORBIDDEN metaTitle values (already used by other published analyses — yours must differ in wording, not only in the product name):\n${usedT.map((x) => `  - ${x}`).join('\n')}\n` : '') +
    (usedD.length ? `- FORBIDDEN metaDescription values (same rule):\n${usedD.map((x) => `  - ${x}`).join('\n')}\n` : '') +
    `\nREPORT (the only source of truth):\n${JSON.stringify(report).slice(0, 24000)}`
  );
}

/* ── Disari acilan yuzey ─────────────────────────────────────────────────
   Web tarafi bunlari web/src/lib/aiPrompts.js uzerinden, admin dogrudan
   `QorAiPrompts.` ile kullanir. */
root.QorAiPrompts = {
  // ad / adres
  cleanProductName, displayProductName,
  slugifyProduct, productSlug, productPath,
  // kucuk yardimcilar
  arr, firstSentences,
  // dil
  languageName, langName, LANG_NAME, CURRENT_REPORT_DATE,
  // quiz
  isComplexQuizCategory, productQuizCount, compareQuizCount, subscriptionQuizCount,
  variationSeed,
  quizGenerationPrompt, compareQuizGenerationPrompt, subscriptionQuizPrompt,
  // rapor baglami
  availabilityContextForProduct, freshnessRules, hasStaleAvailabilityClaims,
  withFreshnessRetryInstruction, productSpecsContext, productLine,
  cleanProductForPrompt, languageGate, quizLines, promptContext,
  // rapor promptlari
  buildDeepPrompt, buildAltPrompt, buildAdvisorPrompt, buildPredictionPrompt,
  buildForumPrompt, buildProductResearchPrompt, buildCompareResearchPrompt,
  buildFullPrompt, buildComparePrompt, buildCompareProductPrompt,
  buildCompareVerdictPrompt,
  // yayin metasi
  groundedResearchSystemPrompt, buildPublishMetaPrompt,
  // ayristirma
  parseAiJson,
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
