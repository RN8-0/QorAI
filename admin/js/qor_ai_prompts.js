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

// PARANTEZ ICINDEKI SATICI/BOLGE SKU KODU.
//
// Yukaridaki iki kural yalnizca Apple'in `MGE64TU/A` bicimini yakaliyordu.
// Katalogda olculdu (10.000 urunluk ornek, Typesense): adin icinde parantezli
// bir SKU tasiyan urun **%5,3** — yani ~5.700 kayit. Apple bicimi bunun
// yalnizca %0,5'i. Kalanlar Lenovo `(69D0GACBTK)`, Samsung `(SM-L330NZSATUR)`,
// kasa/PSU `(0R20B00262)` gibi kodlar ve kullaniciya HICBIR sey anlatmiyorlar.
// Kart uzerinde ayrica goze batiyorlardi: ProductCard adin sonundaki parantezi
// "varyant" satirina aliyor (orasi normalde "512 GB" yazar), yani kodlar
// kartin en okunakli ikinci satirinda duruyordu.
//
// VARYANTI YEMEMEK SART. `(512 GB)`, `(12 GB / 512 GB)`, `(M5 Pro)`, `(4K)`,
// `(Wi-Fi)`, `(18CPU/20GPU)` KALMALI. Uc kapi birden:
//   1. bosluk yok           -> "512 GB", "M5 Pro" elenir
//   2. en az 6 karakter     -> "M5", "4K" elenir
//   3. rakam+harf var ve
//      birim kalibi yok     -> "18CPU/20GPU" (rakam+CPU) elenir
// Kucuk harf iceren icerik zaten 1. kapiya takilmaz ama `[A-Z0-9]` ile
// baslama sarti "Wi-Fi" gibi adlari da disarida birakir.
const PAREN_TOKEN_RE = /\s*[[（(]\s*([A-Z0-9][A-Z0-9./-]{5,})\s*[)）\]]/g;
// Rakamin hemen ardindan gelen olcu birimi = bu bir SKU degil, teknik deger.
//
// TEK HARFLI BIRIM YOK (K/W/V/A). Ilk surumde vardilar ve SKU'lari koruyup
// isi bozuyorlardi: `RC71L-NH001W` icindeki "1W", `90IG0850-MO9A0V` icindeki
// "0V" birim sayiliyor, kod temiz sanilip birakiliyordu — on-render denetiminde
// 68 sayfa boyle kaldi. Cikarmak GUVENLI, cunku mesru tek harfli birim
// tokenlari ("4K", "650W", "12V") zaten alti karakterin ALTINDA ve
// looksLikeSku'ya hic ulasmiyorlar.
const SPEC_UNIT_RE = /\d(?:GB|TB|MB|KB|CPU|GPU|GHZ|MHZ|HZ|MAH|WH|NM|MP|FPS|RPM|BIT)\b/;
// ISLEMCI / EKRAN KARTI AILESI — SKU'ya benziyor ama kullaniciya gercekten
// bir sey anlatiyor. Olculdu (20.000 urunluk ornek): bu korumasiz 3 urun
// yanlis temizleniyordu — `(RTX5090)` ve `(RTX5080-O16G-NOCTUA)`. Liste
// bilerek DAR: genis tutunca `A1336011`, `BT265S`, `M2437E1` gibi gercek
// parca numaralari da korunuyor ve asil is yapilmamis oluyor.
const CHIP_FAMILY_RE = /^(?:RTX|GTX|RADEON|RX|ARC|RYZEN|THREADRIPPER|XEON|CORE|I[3579])[\s-]?\d/;

function looksLikeSku(token) {
  if (!/\d/.test(token)) return false;      // saf harf: model adi olabilir
  if (SPEC_UNIT_RE.test(token)) return false;
  if (CHIP_FAMILY_RE.test(token)) return false;
  if (!/[A-Z]/.test(token)) {
    // HARFSIZ token. Kisa olani birak — "2026" yil, "1080" cozunurluk olabilir.
    // Ama AMD'nin parca numarasi harfsiz ve UZUN: `100-100001489`,
    // `100-000001584`. Ilk surumde "saf rakam = olcu olabilir" diye tamamen
    // muaf tutuluyordu ve on-render'da 46 islemci sayfasi basligini kodla
    // birlikte tasiyordu. Dokuz karakter esigi ikisini ayiriyor.
    return token.replace(/\D/g, '').length >= 9;
  }
  return true;
}

function cleanProductName(name) {
  return String(name || '')
    .replace(COUNTRY_SKU_GROUP_RE, '')
    .replace(COUNTRY_SKU_RE, '')
    .replace(PAREN_TOKEN_RE, (tam, ic) => (looksLikeSku(ic) ? '' : tam))
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

/* ── MODELE CEVRILMIS USD DEGIL, YEREL FIYAT VERILIR ──────────────────────
   `lowestPriceUSD` yerel fiyatin SABIT bir kur tablosundan gecirilmis hali
   (scripts/fx_rates.js). O tablo elle guncelleniyor ve bayatlayabiliyor.

   OLCULDU 2026-09-03, canli kayit — Apple iPhone 17e (512 GB):
     lowestPrice        68.999 TRY   (dogru)
     FX_TO_USD.TR       0.0286       -> 1 USD = 34,97 TL   (FX_VERSION 2026.05)
     lowestPriceUSD     1.973,37     (tabloya gore dogru, GERCEKTE degil)
   Rapor da bunu aynen yazdi: "Yaklasik 1973 USD'lik fiyatiyla amiral gemisi
   segmentinde" — Apple'in butce modeli icin sacma bir cumle. Model yalan
   soylemedi, KENDISINE VERILEN sayiyi yazdi.

   Cozum kuru tahmin etmek DEGIL: modele yerel fiyati PAZARIYLA BIRLIKTE
   vermek. "68999 TRY (Turkey)" her zaman dogrudur ve cevrim hatasi
   uretilemez. Kur tablosu duzeldiginde bu satirin degismesi gerekmez. */
function productLine(p, lang) {
  const ks = productSpecsContext(p, 42);
  const priceFresh = Date.parse(p?.bestOfferExpiresAt || '') > Date.now();
  const yerel = Number(p?.lowestPrice) > 0
    ? `${Number(p.lowestPrice)} ${p.lowestPriceCurrency || ''}`.trim()
    : '';
  const pazar = String(p?.lowestPriceCurrency || '').toUpperCase() === 'TRY' ? ' (Turkish market)' : '';
  const price = priceFresh && yerel ? `${yerel}${pazar}` : '-';
  const name = displayProductName(p, lang);
  return { name, brand: p?.brand || '', category: p?.category || '', score: p?.techScore || '-', price, ks };
}

function cleanProductForPrompt(p, lang) {
  const name = displayProductName(p, lang);
  // `priceUSD` EKLENDI (2026-08-28). Katalog alternatifleri modele FIYATSIZ
  // gidiyordu, yani model "ayni segmentte kal" kuralini uygulayacak veriye
  // sahip degildi — elindeki tek sayi techScore idi ve o da eski amiral
  // gemilerinde dusuk. Segment kapisinin prompt tarafi bu alana dayanir.
  return {
    name,
    brand: p?.brand || '',
    category: p?.category || '',
    techScore: Number(p?.techScore) || 0,
    // Cevrilmis USD DEGIL: modele giden her fiyat yerel para biriminde.
    price: segmentPriceLocal(p).label || null,
    url: productPath(p),
    imageUrl: p?.imageUrl || (Array.isArray(p?.images) ? p.images[0] : ''),
    specs: productSpecsContext(p, 18),
  };
}

/* -- ALTERNATIF SEGMENT KAPISI --------------------------------------------
   OLCULDU 2026-08-28, canli Typesense (`category:=smartphones`,
   `sort_by=techScore:desc` — o gune kadarki aday sorgusunun kendisi):

     100 / 4147 USD  Samsung Galaxy Z Fold8 Ultra (12 GB / 512 GB)
     100 / 5000 USD  Samsung Galaxy Z Fold8 Ultra (16 GB / 1 TB)
     100 / 3324 USD  Apple iPhone 17 Pro (512 GB)
     ... ilk dokuz sonucun HEPSI 100 puan, 1500-5000 USD

   Yani hangi telefon analiz edilirse edilsin modele verilen "QOR CATALOG
   ALTERNATIVES" listesi AYNI dokuz amiral gemisiydi: 286 USD'lik Galaxy
   A07 5G icin de, 2574 USD'lik iPhone 16 icin de. Model listeden secince
   butce telefonuna 4000 USD'lik katlanabilir onerdi. Kullanicinin
   bildirdigi hatanin kaynagi PROMPT DEGIL, SORGUYDU.

   Kapi iki tarafli: fiyat bandi + puan bandi. Yalniz puan bandi yetmiyor
   (olculdu: eski amiral gemileri dusuk techScore tasiyor — "Vivo X90 Pro+"
   54 puan), yalniz fiyat bandi da yetmiyor (fiyati olan urun katalogun
   yalnizca %26'si). Ikisi birlikte uygulanir; fiyati bilinmeyen aday
   ELENMEZ, yalnizca siralamada cezalandirilir. */
const PEER_PRICE_LO = 0.6;
const PEER_PRICE_HI = 1.35;
const PEER_SCORE_LO = 20;
const PEER_SCORE_HI = 10;
// Ayni markadan en fazla bu kadar aday. Olculdu (laptops, 41..71 puan /
// 772..1737 USD bandi): bant dogru calisiyordu ama ilk 12 sonucun 9'u
// "Casper Nirvana S100.255H-..." idi — ayni makinenin SKU varyantlari.
const PEER_MAX_PER_BRAND = 2;

/** Segment matematigi icin fiyat. TAZELIK ARANMAZ: bir urunun segmenti
 *  teklifin son kullanma tarihiyle degismez. Prompt'a YAZILAN fiyat hala
 *  `productLine` icindeki tazelik kapisindan geciyor. */
/* ── MODELE GIDEN HER FIYAT YEREL PARA BIRIMINDE ─────────────────────────
   KURAL (kullanici, 2026-09-03): "kesinlikle kur ile islem yapilmayacak,
   her ulkede vergi ayni degil". Dogru: 68.999 TL'lik bir Turkiye fiyatini
   kurla bolup "1973 USD" demek, iki ulkenin vergisini ve fiyatlandirmasini
   ayni saymak demek. Cikan sayi hicbir pazarda gecerli degil.

   Bu yuzden modelin OKUDUGU ve YAZDIGI her fiyat yerel para biriminde ve
   pazariyla birlikte veriliyor.

   TEK ISTISNA ve nedeni: Typesense semasinda YALNIZCA `lowestPriceUSD`
   indeksli (migration/ts_index.js), yerel `lowestPrice` yok. Alternatif
   ADAYLARINI ararken kullanilan sayisal bant o alandan gecmek zorunda.
   Orada sorun degil cunku butun katalog AYNI tablodan geciyor, yani bant
   GORECELI olarak dogru ve o sayi HICBIR YERDE okuyucuya ya da modele
   gosterilmiyor. Modele giden metin `segmentPriceLocal` kullanir. */
function segmentPriceLocal(p) {
  const v = Number(p?.lowestPrice) || 0;
  const cur = String(p?.lowestPriceCurrency || '').toUpperCase();
  return { v, cur, label: v > 0 ? `${v} ${cur}`.trim() : '' };
}

function segmentPriceUSD(p) {
  const usd = Number(p?.lowestPriceUSD) || 0;
  return usd > 0 ? usd : 0;
}

/**
 * Aday havuzunun Typesense `filter_by` ifadesi. Admin ve site AYNI ifadeyi
 * kullanir; ayrisirsa iki taraf farkli alternatif uretir.
 * @param {boolean} wide  ilk havuz 3 adaydan az dondugunde bandi genislet.
 */
function peerFilterExpr(product, wide = false) {
  const cat = String(product?.category || '').trim().toLowerCase();
  if (!cat) return '';
  const parts = ['category:=' + JSON.stringify(cat)];
  const score = Number(product?.techScore) || 0;
  const price = segmentPriceUSD(product);
  const k = wide ? 2 : 1;
  if (score > 0) {
    const lo = Math.max(0, Math.round(score - PEER_SCORE_LO * k));
    const hi = Math.min(100, Math.round(score + PEER_SCORE_HI * k));
    parts.push(`techScore:[${lo}..${hi}]`);
  }
  if (price > 0) {
    const lo = Math.max(1, Math.floor(price * (wide ? PEER_PRICE_LO / 1.8 : PEER_PRICE_LO)));
    const hi = Math.ceil(price * (wide ? PEER_PRICE_HI * 1.8 : PEER_PRICE_HI));
    parts.push(`lowestPriceUSD:[${lo}..${hi}]`);
  }
  return parts.join(' && ');
}

/** Ad -> "model anahtari": varyant parantezleri ve noktalama atilir, boylece
 *  `Apple iPhone 16 (512 GB)` ile `Apple iPhone 16 (256 GB)` AYNI anahtari
 *  tasir. Bir urunun kendi depolama varyanti alternatif degildir. */
function peerModelKey(name) {
  return cleanProductName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[([（][^)\]）]*[)\]）]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Havuzu segment yakinligina gore siralar, varyant ve marka tekrarini kirpar.
 * Typesense siralamasi `techScore:desc` oldugu icin havuzun BASI daima bandin
 * TAVANI olurdu; oysa istenen HEDEFE EN YAKIN olanlar.
 */
function rankPeerCandidates(product, candidates, limit = 8) {
  const hedefPuan = Number(product?.techScore) || 0;
  const hedefFiyat = segmentPriceUSD(product);
  const hedefAnahtar = peerModelKey(product?.name || '');
  const hedefId = product?.id;
  const puanli = (Array.isArray(candidates) ? candidates : [])
    .filter((d) => d && d.id && d.id !== hedefId)
    .filter((d) => peerModelKey(d.name || '') !== hedefAnahtar)
    .map((d) => {
      const fiyat = segmentPriceUSD(d);
      const dPuan = hedefPuan ? Math.abs((Number(d.techScore) || 0) - hedefPuan) / 100 : 0.2;
      // Fiyati bilinmeyen aday elenmez ama sabit ceza alir: katalogda fiyati
      // olan urun gercekten satin alinabiliyor, digeri belki artik satilmiyor.
      const dFiyat = (hedefFiyat > 0 && fiyat > 0)
        ? Math.abs(Math.log(fiyat / hedefFiyat))
        : 0.45;
      return { d, w: dFiyat * 1.6 + dPuan };
    })
    .sort((a, b) => a.w - b.w);
  const gorulen = new Set();
  const markaSayaci = new Map();
  const out = [];
  for (let i = 0; i < puanli.length && out.length < limit; i += 1) {
    const d = puanli[i].d;
    const anahtar = peerModelKey(d.name || '');
    if (gorulen.has(anahtar)) continue;
    const marka = String(d.brand || '').toLowerCase();
    const n = markaSayaci.get(marka) || 0;
    if (marka && n >= PEER_MAX_PER_BRAND) continue;
    gorulen.add(anahtar);
    markaSayaci.set(marka, n + 1);
    out.push(d);
  }
  return out;
}

/** Modele yazilan segment kurali — sorgu kapisinin PROMPT karsiligi. Katalog
 *  listesi zaten filtreli, ama model HARICI bir urun de onerebiliyor. */
function segmentGate(product) {
  // FIYAT BANDI YEREL PARA BIRIMINDE YAZILIR. Onceden bu satir modele
  // cevrilmis USD sayisini soyluyordu ve model onu rapora aynen geciriyordu:
  // olculdu 2026-09-03, "yaklasik 1973 USD'lik fiyatiyla amiral gemisi
  // segmentinde" (gercek: 68.999 TL, Turkiye). Cevrim kaldirildi.
  const yerel = segmentPriceLocal(product);
  const score = Number(product?.techScore) || 0;
  const satirlar = [
    'SEGMENT HARD GATE FOR ALTERNATIVES. An alternative only helps a reader who can actually buy it.',
  ];
  if (yerel.v > 0) {
    satirlar.push(
      `This product sits at roughly ${Math.round(yerel.v)} ${yerel.cur} in its own market, so every `
      + `alternative must land between ${Math.round(yerel.v * PEER_PRICE_LO)} and `
      + `${Math.round(yerel.v * PEER_PRICE_HI)} ${yerel.cur}. Compare within this currency only — `
      + `do NOT convert to another currency, taxes and pricing differ per market.`,
    );
  }
  if (score > 0) {
    satirlar.push(
      `Its Qor AI tech score is ${score}/100, so alternatives must stay between `
      + `${Math.max(0, score - PEER_SCORE_LO)} and ${Math.min(100, score + PEER_SCORE_HI)}.`,
    );
  }
  satirlar.push(
    'Answering a budget or mid-range product with a flagship is a reporting error, not an upsell: '
    + 'never name a model that costs two or three times as much, and never reach for the best-known '
    + 'halo product of the category when the analysed product is not in that tier.',
    'The QOR CATALOG ALTERNATIVES list below is ALREADY filtered to this segment — prefer it and copy '
    + 'name/imageUrl/url from it exactly. An external alternative must sit in the same window; state its '
    + 'rough price level so the reader can check it.',
    'At least one alternative must be CHEAPER than the analysed product, and none may be a storage/RAM '
    + 'variant of the analysed product itself.',
  );
  return satirlar.join(' ');
}

/* -- AI'IN ADINI VERDIGI ALTERNATIFI KATALOGDA BULMA ----------------------
   Model harici bir urun onerdiginde kart gorselsiz ve linksiz kaliyordu.
   Oysa o ad katalogda gercekten varsa okuyucunun urune GITMESI gerekir.
   Eslesme MUHAFAZAKAR: yanlis urune link vermek, hic link vermemekten
   kotudur. */
// Model niteleyicileri. AI "Xiaomi 15" dediyse katalogtaki "Xiaomi 15 Ultra"
// ESLESMEZ — aksi halde her taban model bir ust modeline baglanirdi.
const MODEL_QUALIFIERS = new Set([
  'pro', 'max', 'ultra', 'plus', 'mini', 'lite', 'se', 'edge', 'fe', 'air',
  'turbo', 'gt', 'note', 'prime', 'power', 'fold', 'flip', 'xl', 'neo', 'super',
]);

function matchTokens(value) {
  return cleanProductName(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "+" AYRI BIR JETON OLMALI. Aksi halde noktalama temizliginde eriyor ve
    // "Redmi Note 15 Pro" katalogtaki "Redmi Note 15 Pro+" ile ESLESIYORDU
    // (olculdu 2026-08-28) — ust modele link vermek yanlis urune yollamaktir.
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Ada en iyi uyan katalog kaydi, yoksa null.
 * Kural: AI adindaki TUM jetonlar katalog adinda gecmeli, katalog adinda
 * FAZLADAN bir model niteleyicisi olmamali, fazlaligi en az olan kazanir.
 */
function pickCatalogMatch(name, docs, { category = '' } = {}) {
  const want = matchTokens(name);
  // Tek jetonlu ad ("Netflix", "Spotify") bir urun modeli degil; eslesmesi
  // guvenilmez — abonelik raporlarinda tam olarak boyle adlar geliyor.
  if (want.length < 2) return null;
  const wantSet = new Set(want);
  const kat = String(category || '').trim().toLowerCase();
  let best = null;
  (Array.isArray(docs) ? docs : []).forEach((d) => {
    if (!d || !d.id) return;
    if (kat && String(d.category || '').trim().toLowerCase() !== kat) return;
    const have = matchTokens(`${d.brand ? `${d.brand} ` : ''}${d.name || ''}`);
    const haveSet = new Set(have);
    if (!want.every((t) => haveSet.has(t))) return;
    const fazla = have.filter((t) => !wantSet.has(t));
    if (fazla.some((t) => MODEL_QUALIFIERS.has(t))) return;
    const w = fazla.length;
    const puan = Number(d.techScore) || 0;
    if (!best || w < best.w || (w === best.w && puan > best.puan)) best = { d, w, puan };
  });
  return best ? best.d : null;
}

/**
 * Rapordaki alternatif listesini katalogla eslestirir: bulunan urunun ADI,
 * GORSELI ve ADRESI kaydin icine yazilir (`source: 'qor_catalog'`), boylece
 * kart gorselli cizilir ve tiklaninca urun sayfasina gider.
 *
 * `search(ad)` DISARIDAN verilir — bu dosya AGA CIKMAZ (admin `TsClient`,
 * site `lib/typesense` ile cagirir). Ayni desen `configure()` ile
 * qor_ai_link.js'te de kullaniliyor.
 */
async function resolveCatalogAlternatives(alternatives, { search, category = '', lang = 'en' } = {}) {
  const list = Array.isArray(alternatives) ? alternatives : [];
  if (!list.length || typeof search !== 'function') return list;
  return Promise.all(list.map(async (a) => {
    if (!a || typeof a !== 'object') return a;
    const ad = String(a.name || a.title || '').trim();
    if (!ad) return a;
    let docs = [];
    try { docs = await search(ad); } catch (_) { docs = []; }
    const hit = pickCatalogMatch(ad, docs, { category });
    if (!hit) return a;
    const katalogAdi = displayProductName(hit, lang) || ad;
    return Object.assign({}, a, {
      name: a.name ? katalogAdi : a.name,
      title: a.title ? katalogAdi : a.title,
      imageUrl: hit.imageUrl || a.imageUrl || '',
      url: productPath(hit),
      productId: hit.id,
      // FIYAT DA TASINIR. Alternatif kartlari katalogda eslesse bile fiyatsiz
      // ciziliyordu; okuyucu "bu alternatif ne kadar" sorusunu yanitlamak icin
      // urun sayfasina gitmek zorunda kaliyordu. `priceForCountry` bu iki alani
      // istiyor (web/src/lib/format.js), `lowestPriceUSD` de yedek.
      prices: hit.prices || null,
      bestOfferExpiresAt: hit.bestOfferExpiresAt || '',
      lowestPriceUSD: Number(hit.lowestPriceUSD) || 0,
      techScore: Number(hit.techScore) || 0,
      source: 'qor_catalog',
    });
  }));
}

/* -- RAPOR METNINDEKI URUN KODU ---------------------------------------------
   Baslik/ozet temizligi (analysisRecord.js) yetmiyor: model urun adini
   CUMLENIN ICINE de yaziyor. Olculdu 2026-08-28, yeni uretilen `website/`
   agacinda: iki analiz sayfasinda "Samsung Galaxy S23 Ultra (12 GB / 1 TB)
   (SM-S918B)" yedi ayri PARAGRAFTA geciyordu — headline, analysis, topluluk
   ozeti, fiyat tahmini.

   Bu yuzden rapor NESNESI okunurken butun dizeler tek tek temizlenir.
   `cleanProductName` nesir uzerinde guvenli: yalnizca bosluksuz, buyuk
   harfli, rakamli ve alti karakterden uzun parantez jetonlarini duser —
   "(512 GB)", "(RTX 5090)", "(120Hz)", "(Wi-Fi 6E)", "(IP68)" hepsi kalir. */
/* ── İKİ DİLİN SAYILARI AYNI OLMAK ZORUNDA — METNİ DEĞİL ───────────────────
   Bir analiz iki kez üretiliyor: önce Türkçe, sonra İngilizce. İkisi de AYRI
   birer AI çağrısı, dolayısıyla puanlar da ayrı ayrı üretiliyor ve aynı ürün
   iki dilde farklı sayılar taşıyor.

   ÖLÇÜLDÜ 2026-09-02, canlı apple-iphone-17-pro-512gb kaydı:
     community.satisfaction        TR 82        EN 87
     community.sentimentBreakdown  TR 65/20/15  EN 70/15/15
     priceForecast.confidence      TR 85        EN 80
     priceForecast.buyOrWait       TR "buy"     EN "watch"   <-- ÇELİŞKİ
     product.factors[].score       8 faktörün 4'ü farklı, en büyük fark 9 puan
   Sonuncusu bir çeviri farkı değil, doğrudan çelişki: aynı ürün Türk
   okuyucuya "al", İngiliz okuyucuya "bekle" diyor.

   KURAL: İLK ÜRETİLEN DİL TABANDIR, ikincisi onun sayılarını devralır.
   Metin ayrı yazılmaya devam eder — iki dil iki ayrı okuyucu kitlesidir ve
   birebir çeviri istemiyoruz. Değişen tek şey ÖLÇÜ.

   NE KİLİTLENİR, NE KİLİTLENMEZ — ayrım SIRAYA GÜVENİLİP GÜVENİLEMEDİĞİ:
    · KİLİTLENİR: tekil skalerler (matchScore, decision, satisfaction,
      buyOrWait…) ve `factors[]` — değerlendirme ekseni kategoriden
      DETERMİNİSTİK türüyor (compareFactorAxis) ve prompt "aynı etiketler,
      aynı sıra" diye şart koşuyor, yani i. faktör iki dilde AYNI faktördür.
    · KİLİTLENMEZ: `criticalPoints[]`, `featureMatches[]`, `community.themes[]`,
      `chronicIssues[]`. Bunların sırasını model seçiyor; TR'deki 1. tema
      EN'deki 1. tema OLMAYABİLİR. İndeksle hizalamak yanlış puanı yanlış
      başlığa yapıştırmak olurdu — sessiz ve daha kötü bir hata. */
/* ── PARAGRAF DUYGUSU: SINIFLANDIRMA ARTIK RAPOR MODELINDEN ALINMIYOR ──────
   Rapor modeline "yaziyi yaz VE her paragrafi etiketle" demek calismiyor:
   model yirmi isi ayni anda yapiyor ve etiketlemeyi SON bolumlerde
   dusuruyor. OLCULDU 2026-09-03, ayna duzeltmesinden SONRA uretilmis alti
   dil-kaydinda:
     FIYAT / zamanlama bolumu   4 kayitta KOMPLE etiketsiz (0/5)
     "Kime uygun" / "degil"     5 kayitta KOMPLE etiketsiz
   Ayrica yanlis etiketliyor: "Ceramic Shield 2 on yuzey ve IPX8 ... korunma
   saglar" cumlesi KIRMIZI cikti — cunku model paragrafin TAMAMINA bakti,
   oysa kural ILK CUMLE.

   Adanmis siniflandirici TEK IS yapiyor ve 42 vakalik fixture testinden
   42/42 geciyor (scripts/sentiment_test.mjs). Artik etiketleri O uretiyor;
   rapor modelinin yazdigi `paragraphSentiment` UZERINE YAZILIR.

   PROMPT BURADA CUNKU UC TARAF PAYLASIYOR: admin motoru (yeni analizler),
   scripts/sentiment_lib.mjs (geriye donuk goc) ve fixture testi. Ikinci bir
   kopya kacinilmaz olarak ayrisirdi — bu projede tam olarak o hata bir kez
   yasandi (goc `paragraphKey` yaziyordu, AI ham cumle). */
var PARAGRAF_SINIFLANDIRICI = `You label paragraphs from product analyses.

For each numbered paragraph, judge ONLY ITS FIRST SENTENCE, and only as an
evaluation OF THE PRODUCT:

  positive  the first sentence praises the product or states a strength
  negative  the first sentence criticises the product, names a weakness,
            a limitation, a risk, a mismatch with the buyer's need, or a
            trade-off that costs the buyer something
  neutral   the first sentence states a fact, a spec, context, a date, a
            price observation or a definition without judging the product

HARD RULES — these are where naive labelling fails:

1. JUDGE THE FIRST SENTENCE ONLY. Later sentences may reverse the mood;
   ignore them.
     "The display is excellent. However, the 60Hz may disappoint." -> positive
     "The 60Hz is a real weakness. However, colours are great."    -> negative

2. CONCESSIVE OPENERS FLIP THE WEIGHT. In "although / while / despite /
   even though X, Y", the judgement lives in Y, not X.
     "While the display is bright, its 60Hz feels dated."       -> negative
     "Although expensive, its performance is exceptional."      -> positive

3. NEGATION REVERSES. "not bad", "no problems reported", "doesn't overheat",
   "never stutters" are POSITIVE. "not great", "fails to deliver" are NEGATIVE.

4. A WORD IS NOT A LABEL. "smooth" can sit inside a complaint
   ("impacting the smoothness"); "problem" can sit inside praise
   ("no problems in daily use"). Read the clause, not the vocabulary.

5. MISMATCH IS NEGATIVE. If the first sentence says a trait conflicts with,
   falls short of, or does not meet what the buyer wants, label negative even
   when the trait itself sounds good ("While efficient, it conflicts with the
   user's preference for raw power").

6. FACTS ARE NEUTRAL. Do not force a label. A spec, a release date or a bare
   price figure is neutral even if the product is generally good.

   BUT PRICE AND TIMING ARE JUDGED FROM THE BUYER'S SIDE.
   A price/value/timing sentence is not "about the product", it is about what
   the reader pays and when — and it almost always carries a direction. Judge
   it by whether it is good news or bad news FOR THE BUYER:
     positive  price is falling, a discount or sale window is coming, waiting
               pays off, it is a good time to buy, the price is fair for what
               you get, the value holds up
     negative  price is high or rising, no meaningful drop is expected, you
               will pay a premium, it is poor value, stock is scarce and
               pushes the price up, buying now costs you money you could save
     neutral   ONLY a bare figure or date with no direction at all
               ("Listings sit between 33,249 TL and 39,049 TL.",
                "Apple typically announces the next generation in September.")
   Examples that MUST be labelled, not left neutral:
     "Its price tends to remain stable, with significant drops rare."  -> negative
     "Waiting until Q1 could yield better deals."                      -> positive
     "The biggest drop usually comes when the successor launches."     -> positive
     "Fiyatların yakın zamanda düşmesi beklenmiyor."                   -> negative
     "Yılbaşı kampanyalarında ciddi indirim görülebilir."              -> positive

   BUT A REPORTED FAULT IS NOT A FACT. A sentence that reports a defect, a
   failure, a complaint, a return, or a difficulty owners ran into is
   NEGATIVE even when it is phrased as a flat observation with no judging
   word in it. "Ownership" wording does not make it neutral.
     "Some users received units with dead pixels out of the box."  -> negative
     "Kutudan çıktığı gibi ekran arızası yaşayan kullanıcılar da
      mevcuttur."                                                  -> negative
   Symmetrically, a flatly worded report of something working well is
   POSITIVE ("Owners report the battery lasts a full day").

7. INPUT MAY BE TURKISH. The same six rules apply unchanged. Turkish
   concessive and negation markers to watch:
     ancak / ama / fakat / ne var ki / buna karşın   -> judgement follows
     -e rağmen / -e karşın                            -> judgement follows
     // "-sa da / -se de" EKI EKSIKTI ve olculdu: "…görüşleri genel olarak
     // olumlu OLSA DA, bazı önemli endişeler de dile getirilmektedir."
     // notr etiketlendi, ekranda siyah kaldi. Turkce'de en sik kullanilan
     // odun baglaci bu ve listede yoktu.
     -sa da / -se de (olsa da, etse de, olmakla birlikte)  -> judgement follows
     yine de / bununla birlikte / öte yandan          -> judgement follows
     değil / yok / bulunmuyor / -maz / -mez           -> reverses
     "sorunsuz", "kusursuz", "sınırsız" are POSITIVE even though they
     contain the roots "sorun", "kusur", "sınır".
   Turkish puts the verb last, so the judgement usually sits at the END of
   the first sentence — read it to the end before deciding.
     "512 GB depolama çoğu kullanıcı için fazlasıyla yeterli."  -> positive
     "Uzun yazılım desteği ve dayanıklı yapısı öne çıkıyor."    -> positive
     "60 Hz ekran bu fiyat sınıfı için geride kalıyor."         -> negative
     "Parlak ekrana rağmen 60 Hz tazeleme hızı yetersiz."       -> negative
     "Cihaz 6,3 inç OLED ekrana sahiptir."                      -> neutral

Return ONLY a JSON object: {"labels": ["positive", "neutral", ...]} with
exactly one label per input paragraph, in the same order. No other text.`;

/* Metni EKRANDA CIZILEN paragraflara boler.
   `web/src/lib/prose.js` bunu yeniden export eder — TEK KOPYA olmak ZORUNDA:
   etiket anahtari paragrafin ilk cumlesinden turuyor, dolayisiyla yazan ve
   okuyan taraf metni farkli bolerse anahtarlar hic tutmaz. */
function proseBlocks(text) {
  const raw = String(text || '').replace(/```[a-z]*\s*/gi, '').trim();
  if (!raw) return [];
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks = [];
  lines.forEach((line) => {
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ kind: 'head', text: line.replace(/^#{1,6}\s+/, '').replace(/[:：]\s*$/, '') });
      return;
    }
    if (/^[-•*]\s+/.test(line)) {
      blocks.push({ kind: 'bullet', text: line.replace(/^[-•*]\s+/, '') });
      return;
    }
    blocks.push({ kind: 'p', text: line.replace(/^>\s+/, '') });
  });
  // TEK NEFESTE YAZILMIŞ METİN. Model kimi zaman 600 kelimeyi tek satırda
  // döndürüyor; o hâlde paragraf ritmi diye bir şey kalmıyor. Cümlelere böl,
  // üçerli paragraflara topla.
  if (blocks.length === 1 && blocks[0].kind === 'p' && blocks[0].text.length > 640) {
    const sents = blocks[0].text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const packed = [];
    for (let i = 0; i < sents.length; i += 3) packed.push({ kind: 'p', text: sents.slice(i, i + 3).join(' ') });
    return packed;
  }
  return blocks;
}

var KILIT_SKALER = ['matchScore', 'confidence', 'decision'];

function _skalerKopyala(hedef, taban, anahtarlar) {
  if (!hedef || !taban || typeof hedef !== 'object' || typeof taban !== 'object') return 0;
  var n = 0;
  anahtarlar.forEach(function (k) {
    if (taban[k] === undefined || taban[k] === null) return;
    if (hedef[k] === taban[k]) return;
    hedef[k] = taban[k];
    n += 1;
  });
  return n;
}

/* Aynı uzunluktaki iki listeyi İNDEKSLE hizalayıp sayısal/enum alanları kopyalar.
   UZUNLUK EŞİTLİĞİ ŞART: model bir maddeyi düşürdüyse hizalama kayar ve
   yanlış puanı yanlış başlığa yapıştırmak, hiç dokunmamaktan kötüdür. */
function _listeKilitle(hedefListe, tabanListe, anahtarlar) {
  if (!Array.isArray(hedefListe) || !Array.isArray(tabanListe)) return 0;
  if (!hedefListe.length || hedefListe.length !== tabanListe.length) return 0;
  var n = 0;
  hedefListe.forEach(function (x, i) { n += _skalerKopyala(x, tabanListe[i], anahtarlar); });
  return n;
}

/** Tek bir ürün düğümü (ürün raporu / karşılaştırmadaki bir ürün). */
function _urunKilitle(hedef, taban) {
  if (!hedef || !taban) return 0;
  var n = _skalerKopyala(hedef, taban, KILIT_SKALER);
  // Faktörler: eksen deterministik olduğu için indeks hizalaması güvenli.
  n += _listeKilitle(hedef.factors, taban.factors, ['score']);
  // KRİTİK NOKTALAR ARTIK KİLİTLENİYOR.
  // Eskiden dışarıdaydı çünkü sırayı model seçiyordu. Artık ikinci dil
  // birinci dilin listesini AYNA olarak alıyor (mirrorFactsBlock) ve
  // "aynı adet, aynı sıra" şartıyla yazıyor; uzunluk eşitliği de burada
  // ayrıca aranıyor, yani ayna tutmadıysa hiç dokunulmuyor.
  n += _listeKilitle(hedef.criticalPoints, taban.criticalPoints, ['severity']);
  return n;
}

/**
 * `hedef` raporunun ölçülerini `taban` raporununkilere eşitler.
 * Rapor nesnesini YERİNDE değiştirir ve değişen alan sayısını döndürür.
 * Dört akış da (ürün / karşılaştırma / link / abonelik) aynı fonksiyondan
 * geçer; şekil farkı burada tek yerde ele alınıyor.
 */
function lockScoresToBase(hedef, taban) {
  if (!hedef || !taban || typeof hedef !== 'object' || typeof taban !== 'object') return 0;
  var n = 0;
  // Karşılaştırma: ürün başına. İNDEKSLE DEĞİL ADLA eşleştirilir — motor iki
  // denemede de yazamadığı bir ürünü DÜŞÜREBİLİYOR (runCompareReport ->
  // dropped) ve o zaman iki dilin listeleri kayar. Ürün adları çevrilmediği
  // için ad güvenilir bir anahtar.
  if (Array.isArray(hedef.products) && Array.isArray(taban.products)) {
    var tabanAd = {};
    taban.products.forEach(function (p) { if (p && p.name) tabanAd[String(p.name).toLowerCase().trim()] = p; });
    hedef.products.forEach(function (p) {
      var t = p && p.name ? tabanAd[String(p.name).toLowerCase().trim()] : null;
      if (t) n += _urunKilitle(p, t);
    });
  }
  // Tekil ürün raporu: ölçüler `product` altında.
  if (hedef.product && taban.product) n += _urunKilitle(hedef.product, taban.product);
  // Link/abonelik "enhanced" şekli ölçüleri KÖKTE taşıyabiliyor.
  n += _urunKilitle(hedef, taban);
  // Topluluk ve fiyat tahmini her şekilde kökte duruyor.
  if (hedef.community && taban.community) {
    n += _skalerKopyala(hedef.community, taban.community, ['satisfaction']);
    if (hedef.community.sentimentBreakdown && taban.community.sentimentBreakdown) {
      n += _skalerKopyala(hedef.community.sentimentBreakdown, taban.community.sentimentBreakdown,
        ['positive', 'neutral', 'negative']);
    }
    // TEMALAR VE KRONİK SORUNLAR ARTIK KİLİTLİ — ayna sayesinde sıra garanti.
    // Kullanıcının kuralı: "ürün özellikleri, kronik sorunları, kullanıcı
    // memnuniyeti her ülkede aynı oranda ve aynı sorunlar olmalı".
    n += _listeKilitle(hedef.community.themes, taban.community.themes, ['strength', 'sentiment']);
    n += _listeKilitle(hedef.community.chronicIssues, taban.community.chronicIssues, ['frequency']);
  }
  /* FİYAT TAHMİNİ KİLİTLENMEZ — kullanıcının açık kuralı:
     "sadece fiyat kısmında farklı yorum yapılabilir, o da ülkeden ülkeye
     değiştiği için". TL kuru, Türkiye stok durumu ve yerel kampanyalar
     İngilizce okuyucunun pazarıyla aynı değil; ikisini eşitlemek birine
     yanlış pazarın tavsiyesini vermek olurdu. Ürüne ait her şey (özellik,
     kronik sorun, memnuniyet) kilitli; pazara ait olan serbest. */
  // Katalog puanı zaten kaydın kendisinden geliyor ama ikinci dilde model
  // kendi sayısını yazmış olabilir; taban ne diyorsa o.
  n += _skalerKopyala(hedef, taban, ['techScore']);
  return n;
}

function cleanProductCodes(value, derinlik = 0) {
  if (typeof value === 'string') return cleanProductName(value);
  if (derinlik > 8 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((x) => cleanProductCodes(x, derinlik + 1));
  const out = {};
  Object.keys(value).forEach((k) => {
    // URL / gorsel alanlarina DOKUNMA: `cleanProductName` adres icindeki
    // "/product/mhfe4tu-a" gibi bir parcayi da silebilirdi.
    out[k] = /^(url|imageUrl|image|href|slug|productImage|sourceUrl)$/i.test(k)
      ? value[k]
      : cleanProductCodes(value[k], derinlik + 1);
  });
  return out;
}

/* ── PUAN KALIBRASYONU + SEGMENT KUNYESI ───────────────────────────────────
   OLCULDU 2026-08-28, canli PB'deki 14 urun analizi (katalog techScore -> AI
   matchScore):

     Apple iPhone 17 Pro (512 GB)      100 -> 92
     Samsung Galaxy S23 Ultra (1 TB)    66 -> 92   <-- ayni puan
     Samsung Galaxy A17 5G              71 -> 88
     Samsung Galaxy S24 Ultra (512)     81 -> 88   <-- ayni puan
     Honor Robot Phone                  89 -> 75
     Samsung Galaxy A07 5G              46 -> 75   <-- ayni puan

   Iki sorun birden: (1) AI puani pratikte 75-95 bandina SIKISIYOR, yani
   aralarinda daglar olan cihazlar birkac puan farkla cikiyor; (2) siralama
   yer yer TERSINE donuyor (tech 66 -> 92, tech 89 -> 75). Okuyucunun
   "bu telefon nasil iPhone ile ayni puani aldi" demesi hakli.

   Kok neden: `matchScore` bir UYGUNLUK puani (quiz cevaplarina gore) ama
   sayfada MUTLAK bir kalite puani gibi okunuyor. Ikisi ayri sey ve ikisi de
   gerekli. Cozum, gosterilen puani ikisinin AGIRLIKLI BILESIMI yapmak:

     gosterilen = 0.60 x techScore  +  0.40 x matchScore

   `techScore` katalogun mutlak donanim puani (segment bagimsiz, iyi
   dagilmis: A17 45 / RTX 5090 98), `matchScore` ise kisiye uygunluk. Ayni
   veriyle sonuc: 97, 97, 84, 83, 78, 76, 68, 58 — siralama dogru ve aralik
   genis.

   KALIBRASYON OKUMA ANINDA YAPILIR, uretim aninda degil. Boylece daha once
   yayinlanmis kayitlar da yeniden uretilmeden duzelir; agirliklar
   degistiginde tek yerden degisir. Depoda ham AI puani durur (iki kez
   kalibre etme riski yok). */
const SCORE_TECH_WEIGHT = 0.60;
const SCORE_AI_WEIGHT = 0.40;

/**
 * Gosterilecek puan. Katalog puani YOKSA (abonelik, link analizi) AI puani
 * oldugu gibi doner — orada mutlak bir donanim olcusu yok.
 */
function calibratedScore(aiScore, techScore) {
  const ai = Number(aiScore);
  if (!Number.isFinite(ai) || ai <= 0) return null;
  const tech = Number(techScore);
  if (!Number.isFinite(tech) || tech <= 0) return Math.max(0, Math.min(100, Math.round(ai)));
  return Math.max(1, Math.min(100, Math.round(SCORE_TECH_WEIGHT * tech + SCORE_AI_WEIGHT * ai)));
}

// Segment esikleri katalog techScore'una gore. Sinirlar katalogun gercek
// dagilimindan secildi (2026-08-28: A07 5G 46, MacBook Neo 61, A17 5G 71,
// S24 Ultra 81, iPhone 17 90, RTX 5090 98).
const SEGMENT_TIERS = [
  { key: 'flagship', min: 88, tr: 'Amiral gemisi sınıfı', en: 'Flagship class' },
  { key: 'upper', min: 75, tr: 'Üst orta segment', en: 'Upper-mid segment' },
  { key: 'mid', min: 58, tr: 'Orta segment', en: 'Mid segment' },
  { key: 'entry', min: 0, tr: 'Giriş segmenti', en: 'Entry segment' },
];

function segmentTier(techScore, lang) {
  const t = Number(techScore);
  if (!Number.isFinite(t) || t <= 0) return null;
  const row = SEGMENT_TIERS.find((x) => t >= x.min) || SEGMENT_TIERS[SEGMENT_TIERS.length - 1];
  return { key: row.key, label: String(lang || 'en').slice(0, 2).toLowerCase() === 'tr' ? row.tr : row.en };
}

/**
 * Puanin NE OLDUGUNU soyleyen tek cumle. Okuyucu "bu telefon nasil iPhone
 * ile yakin puan aldi" diye sormasin diye sayfada puanin YANINDA duruyor.
 */
function scoreBasisNote(techScore, lang) {
  const tr = String(lang || 'en').slice(0, 2).toLowerCase() === 'tr';
  const tier = segmentTier(techScore, lang);
  if (!tier) {
    return tr
      ? 'Bu puan, verdiğin quiz cevaplarıyla uyumu ölçer — mutlak bir kalite notu değildir.'
      : 'This score measures the fit with your quiz answers — it is not an absolute quality grade.';
  }
  const pct = `${Math.round(SCORE_TECH_WEIGHT * 100)}/${Math.round(SCORE_AI_WEIGHT * 100)}`;
  return tr
    // Ek cekimi YOK: "orta segmentnda" gibi bozuk birlesimler cikiyordu.
    // Segment iki nokta ustuste ile ayri bir cumlecik olarak veriliyor.
    ? `Bu puan iki şeyi birleştirir: ürünün mutlak donanım seviyesi (Qor AI Teknik Puanı ${Math.round(Number(techScore))}/100) ve quiz cevaplarınla uyumu — ${pct} ağırlıkla. Ürünün segmenti: ${tier.label}. Kendi segmentinde çok iyi olan bir cihaz bile bir üst segmentin puanına çıkmaz.`
    : `This score combines two things: the product's absolute hardware level (Qor AI Tech Score ${Math.round(Number(techScore))}/100) and how well it fits your quiz answers — weighted ${pct}. Product segment: ${tier.label}. A device that is excellent for its own class still will not reach the score of a higher tier.`;
}

/**
 * Modele yazilan puanlama kurali. Kalibrasyon sayiyi ZATEN duzeltiyor ama
 * modelin ham puani da anlamli olmali: 75-95 bandina sikisan bir girdi,
 * bilesimin uygunluk yarisini ise yaramaz hale getirir.
 */
function scoreScaleGate(product) {
  const tech = Number(product?.techScore) || 0;
  const tier = segmentTier(tech, 'en');
  return (
    'SCORING SCALE — USE THE WHOLE RANGE. matchScore is how well THIS product fits THIS buyer, '
    + 'on this scale: 90-100 = a rare, near-perfect fit; 75-89 = strong fit with minor compromises; '
    + '60-74 = workable but with real trade-offs; 40-59 = poor fit, several needs unmet; below 40 = wrong product. '
    + 'Measured failure to avoid: across 14 published reports every score landed between 75 and 95, so devices '
    + 'that differ enormously came out a few points apart. If your first instinct is a number in the 80s, justify '
    + 'it against the scale above or move it. '
    + (tech
      ? `Absolute hardware context: this product scores ${tech}/100 on the Qor AI Tech Score and sits in the ${tier ? tier.label.toLowerCase() : 'unknown tier'}. `
      + 'Do NOT inflate the fit score to compensate for a modest tier, and do NOT deflate it because the tier is high — '
      + 'score the FIT honestly; the published number already accounts for the hardware level separately. '
      : '')
    + 'NEVER WRITE THE SCORE AS A NUMBER IN PROSE. Do not put "88%", "scores 88/100" or any figure into headline, matchComment, analysis, overallVerdict or any other text field. The published number is computed separately (it combines this fit score with the catalog hardware score), so a number written into the prose contradicts the number the reader sees next to it — that exact contradiction was shipped and had to be patched at read time. Describe the verdict in words instead. '
    + 'Also return "scoreReasoning": one sentence naming the two or three answers that moved the score most.'
  );
}

function languageGate(lang) {
  return (
    `LANGUAGE HARD GATE: Every user-facing sentence, label, list item, source description, button-like value, and explanation must be fully written in ${langName(lang)}. ` +
    'Only brand names, official product/model names, source names such as Reddit/YouTube/Amazon, and technical standards such as Thunderbolt, Wi-Fi, RTX, macOS may remain as-is. ' +
    'Do not output English UI labels such as "quiz answers", "similar products", "retailer reviews", "buy", "wait", "source types", "best time", or "community/review research" when the requested language is not English.'
  );
}

/* ── ARASTIRMANIN DILI ile RAPORUN DILI AYRI SEYLER ────────────────────────
   Olculdu 2026-08-25, canli `analyses` kayitlarindaki kronik sorun sayilari:

     laptops         MacBook Neo          TR 0 · EN 2
     graphics_cards  RTX 5090 TUF         TR 0 · EN 3
     smartphones     iPhone 17            TR 4 · EN 1
     smartphones     Xiaomi 17 Ultra      TR 3 · EN 4

   Iki dil IKI AYRI grounded arastirma kosuyor ve `languageGate` arastirma
   prompt'una da uygulaniyordu: model Turkce cevap verecegi icin Turkce kaynak
   ariyordu. Telefonda Turkce sahiplik tartismasi bol (DonanimHaber, Technopat,
   Sikayetvar); laptop / ekran karti / TV / kulaklikta yok denecek kadar az.
   Sonuc: "kronik sorunlar" bolumu pratikte YALNIZ telefonlarda ciciyor ve
   okuyucu bunun "bu urunun sorunu yok" demek oldugunu saniyor.

   Kural: ARAMA dilden bagimsiz yapilir, CEVAP istenen dilde yazilir. */
function researchSourceGate(lang) {
  return (
    'SEARCH LANGUAGE IS NOT THE REPLY LANGUAGE. Search in whichever languages actually hold the evidence — '
    + 'English first (it carries the deepest ownership discussion for laptops, GPUs, TVs, audio, appliances and components), '
    + 'then Turkish for local retail, warranty and service reality (DonanimHaber, Technopat, Sikayetvar, Eksi Sozluk), '
    + 'then the maker\'s home-market language when that is where owners gather. '
    + 'Never limit the search to one language because of the reply language, and never treat "no Turkish-language thread about it" as "no problem exists". '
    + `Only the WRITTEN ANSWER must be in ${langName(lang)}; translate what you found instead of dropping it.`
  );
}

/* Kronik sorun ARANMAZSA cikmiyor. Genel "yorumlari tara" talimati spec
   sayfasindan da okunabilen eksileri getiriyor; sahiplik sonrasi ariza ancak
   kategorinin kendi ariza bicimleri tek tek sorulursa yuzeye cikiyor. Liste
   KATEGORIYE GORE DOSYA URETMEZ — modelden once kategorinin ariza bicimlerini
   adlandirmasi, sonra her birini bu model icin aramasi isteniyor. */
function chronicResearchGate(category) {
  const kat = String(category || '').replace(/[_-]+/g, ' ').trim();
  return (
    'SEARCH SEPARATELY FOR CHRONIC PROBLEMS — this is a required step for EVERY category, not only phones. '
    + `First name the 4-6 failure modes the ${kat || 'product'} category is known for, then search each one against this exact model. `
    + 'Category anchors: laptops -> hinge cracking, battery swelling, thermal throttling, display-cable/flexgate, keyboard or trackpad failure, coating wear, fan noise; '
    + 'graphics cards -> coil whine, driver crashes and black screens, power-connector melting, fan bearing noise, VRAM/hotspot temperatures, sag; '
    + 'TVs -> panel uniformity and banding, firmware updates that broke a feature, HDMI/eARC handshake, burn-in, backlight failure; '
    + 'audio -> battery ageing, pairing drops, driver rattle, hinge or ear-tip cracking, firmware regressions; '
    + 'phones -> throttling, battery ageing, modem/signal, camera firmware, screen defects; '
    + 'appliances and components -> seals, pumps, bearings, recurring error codes, RMA experience. '
    + 'Also search: owner threads at 6/12/24 months of use, known bad batches or revisions, warranty and RMA experience, '
    + 'a firmware or driver update that broke something and whether it was ever fixed, and class-action or recall notices. '
    + 'For each finding note what fails, how far into ownership it appears, whether a workaround or fix exists, and how widespread it is. '
    // CAPA BULGU DEGILDIR. Olculdu 2026-08-25: capa listesi verilince model
    // capanin KENDISINI bulguymus gibi yaziyor — MacBook Neo icin "pil sismesi"
    // ve "mentese gurultusu" cikti, oysa notlar ikisi icin de "bu modele ozgu
    // kanit yok" diyordu. Ayrim KAYNAKTA yapilir, sonradan temizlenemez.
    + 'LABEL EVERY CANDIDATE. Prefix each one with [MODEL-SPECIFIC] when the evidence names this exact model or its production run, '
    + 'and [CATEGORY-GENERAL] when it is a known trait of the category, standard advice, or a possibility you could not tie to this model. '
    + 'A searched-and-not-found anchor is [CATEGORY-GENERAL], never a finding. '
    + 'If after all of that there is genuinely no [MODEL-SPECIFIC] problem, say so explicitly and list which searches you ran — '
    + 'that is a real finding, but an empty search is not.'
  );
}

/* ── MODEL KIMLIK KAPISI ───────────────────────────────────────────────────
   OLCULDU 2026-08-28, canli grounded arastirma (gemini-2.5-flash +
   googleSearch), urun `samsung-galaxy-s26-512gb` = "Samsung Galaxy S26
   (512 GB)", dil TR. Donen arastirma notlarindan AYNEN:

     "Bazi kullanicilar, Galaxy S26 Ultra'da isinma, gecikme ve pil tuketimi
      sorunlari yasadiklarini belirtmislerdir."          <- ULTRA'nin sorunu
     "Galaxy S26 Ultra'da bazi kullanicilar ekranin ortasinda kirmizimsi bir
      leke ... bildirmistir."                            <- ULTRA'nin sorunu
     "Turkiye'deki perakendecilerde Samsung Galaxy S26 Ultra 512 GB ...
      83.999 TL ile 131.999 TL arasinda degismektedir."  <- ULTRA'nin fiyati
     "Gizlilik Ekrani ozelligi (S26 Ultra'ya ozel)."     <- ARTILAR listesinde

   Sonuncusu en agiri: kardes modele OZEL oldugu cumlenin KENDISINDE yazan bir
   ozellik, temel modelin artisi diye raporlandi.

   KOK NEDEN prompt'un ne dedigi degil NE DEMEDIGI: modele yalnizca ad
   veriliyordu. Katalogda ayni seriden sekiz kayit var (S26, S26+, S26 Ultra
   x3, S26 FE) ve web aramasinda seri adi Ultra icerigini getiriyor — teknoloji
   basini tabani degil amiral gemisini yazar. Model "Galaxy S26 Ultra" baslikli
   kaynagi "Galaxy S26" sanip aktariyor.

   UC KATMAN, cunku tek katman yetmez:
     1) KAPI      — prompt'a hangi adlarin BASKA URUN oldugu tek tek yazilir.
     2) TEMIZLIK  — arastirma notlarindan kardes-only cumleler ATILIR. Kapi
                    uretimi azaltir, temizlik kacani rapora GECIRMEZ. Notlar
                    dahili baglamdir, kullaniciya hicbir zaman gosterilmez.
     3) DENETIM   — rapor ayristirildiktan sonra yalniz KENDI urununu anlatan
                    bolumler taranir; sizinti varsa tazelik kapisiyla ayni
                    desende tekrar istenir.

   Kapi LEKSIK calisir, KATALOG SORGUSU YAPMAZ: prompt ureticileri senkron ve
   web + admin + app ucu birden cagiriyor. */

// "Pro Max" once gelmeli: eslesince "Pro" ve "Max" ayri ayri sayilmasin.
// "Ti" / "XT" ekran karti kademesidir ve her zaman AYRI token olarak gecer.
const VARIANT_WORDS = [
  'Pro Max', 'Ultra', 'Pro', 'Max', 'Plus', 'Edge', 'FE', 'SE',
  'Mini', 'Air', 'Lite', 'Neo', 'Turbo', 'Super', 'Ti', 'XT',
];

/** Adin KENDI tasidigi varyant isaretcileri. Bunlar yasak listesine girmez. */
function variantMarkersIn(name) {
  let rest = ` ${String(name || '').replace(/[()/,]/g, ' ').replace(/\s{2,}/g, ' ')} `;
  const found = [];
  for (const w of VARIANT_WORDS) {
    const re = new RegExp(`\\s${w.replace(/ /g, '\\s+')}\\s`, 'i');
    if (re.test(rest)) { found.push(w); rest = rest.replace(re, ' '); }
  }
  if (/\+/.test(String(name || ''))) found.push('Plus');
  return [...new Set(found)];
}

/** Seri capasi: "Samsung Galaxy S26 (512 GB)" -> stem "Samsung Galaxy S26",
 *  prefix "S", num 26. Kapasite/birim ("32GB") ve sebeke kusagi ("5G") ELENIR:
 *  ikisi de nesil sayisi degildir. */
function seriesAnchor(name) {
  const cleaned = String(name || '').replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const toks = cleaned.split(/\s+/);
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i].replace(/[^\w+]/g, '');
    if (!t) continue;
    if (/\d\s*(?:GB|TB|MB|W|Wh|mAh|Hz|nm|MP|K)$/i.test(t)) continue;
    const m = t.match(/^([A-Za-z]{0,2})(\d{2,4})([A-Za-z+]{0,3})$/);
    if (!m) continue;
    const num = Number(m[2]);
    if (num < 10) continue;                       // "5G", "4G" nesil degil
    return { index: i, prefix: m[1], num, token: t, stem: toks.slice(0, i + 1).join(' ') };
  }
  return null;
}

/** KOMSU NESIL adimi urun sinifina gore degisir. Telefon/laptop kusagi birer
 *  birer sayilir (S26 -> S25/S27, iPhone 17 -> 16/18). Ekran karti dort haneli
 *  ve KADEME ile ilerler: 5090'in komsusu 5089 degil 5080'dir. */
function generationSteps(num) {
  if (num >= 1000) return num % 10 === 0 ? [-10, 10] : [];
  return [-1, 1];
}

/** Metinde urunu ARAYAN capa. Marka cogu kaynakta dusuyor ("Samsung Galaxy S26
 *  Ultra" yerine yalnizca "Galaxy S26 Ultra" ya da "S26 Ultra"), bu yuzden tam
 *  ad ARANMAZ — ayirt edici KUYRUK aranir. Capa harf onekliyse ("S26", "K100")
 *  tek token yeter; saf sayiysa ("17", "5090") onundeki token da alinir, yoksa
 *  "17" her yerde eslesir. */
function anchorTail(name) {
  const a = seriesAnchor(name);
  if (!a) return '';
  const toks = a.stem.split(/\s+/);
  return a.prefix ? toks[a.index] : toks.slice(Math.max(0, a.index - 1), a.index + 1).join(' ');
}

function reEsc(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

/** Bu urunle KARISTIRILABILECEK ad listesi — PROMPT ICIN, insan okur.
 *  Ayni serinin obur varyantlari + komsu nesiller. Urunun kendi varyanti varsa
 *  TABAN MODEL de kardestir. */
function siblingModelNames(name) {
  const anchor = seriesAnchor(name);
  if (!anchor) return [];
  const own = variantMarkersIn(name);
  const out = [];
  for (const w of VARIANT_WORDS) {
    if (own.includes(w)) continue;
    out.push(`${anchor.stem} ${w}`);
  }
  if (own.length) out.push(anchor.stem);          // taban model de BASKA urun
  const head = anchor.stem.split(/\s+/).slice(0, anchor.index).join(' ');
  for (const d of generationSteps(anchor.num)) {
    const n = anchor.num + d;
    if (n < 1) continue;
    out.push(`${head} ${anchor.prefix}${n}`.trim());
  }
  return [...new Set(out)];
}

/** Konuyu ADIYLA yakalayan regex — kardes adinin ICINDE eslesmez.
 *  "S26" kalibi "S26 Ultra" cumlesini KONU saymaz. */
function subjectNameRegex(name) {
  const tail = anchorTail(name) || cleanProductName(name);
  if (!tail) return null;
  const own = variantMarkersIn(name);
  const tabu = VARIANT_WORDS.filter((w) => !own.includes(w)).map((w) => w.replace(/ /g, '\\s+'));
  if (!own.includes('Plus')) tabu.push('\\+');
  return new RegExp(`${reEsc(tail)}(?!\\s*(?:${tabu.join('|')}))`, 'i');
}

/** "oncekine gore", "compared to" — cumlenin KONUYU anlattigini, komsu neslin
 *  yalnizca olcut oldugunu gosteren ipuclari. */
const COMPARATIVE_CUE = /(?:\bgöre\b|kıyas|kıyasla|\bkarşın\b|selef|önceki\s+nesil|bir önceki|\bcompared\b|\bcompares\b|\bversus\b|\bvs\.?\b|\bthan\b|predecessor|previous\s+generation|\bupgrade\s+from\b|\bover\s+the\b)/i;

/** Kardesi metinde ARAYAN regexler — IKI EKSEN AYRI.
 *   varyantRe : capa + BASKA varyant ("S26 Ultra", "RTX 5090 Ti"). Kosulsuz.
 *   nesilRe   : komsu nesil capasi ("S25", "S27", "RTX 5080"). Yalnizca
 *               karsilastirma ipucu YOKKEN kardes sayilir.
 *  Taban modelin CIPLAK capasi BILEREK aranmaz: kaynaklar "S26 Ultra"yi kisaca
 *  "S26" diye yazar ve ciplak capayi kardes saymak gercek icerigi siler. */
function siblingDetectParts(name) {
  const anchor = seriesAnchor(name);
  if (!anchor) return null;
  const tail = anchorTail(name);
  if (!tail) return null;
  const own = variantMarkersIn(name);
  const tabu = VARIANT_WORDS.filter((w) => !own.includes(w)).map((w) => w.replace(/ /g, '\\s+'));
  if (!own.includes('Plus')) tabu.push('\\+');
  const varyantRe = new RegExp(`${reEsc(tail)}\\s*(?:${tabu.join('|')})\\b`, 'i');
  const tailHead = tail.split(/\s+/).slice(0, -1).join(' ');
  const nesil = [];
  for (const d of generationSteps(anchor.num)) {
    const n = anchor.num + d;
    if (n < 1) continue;
    nesil.push(`\\b${reEsc(`${tailHead} ${anchor.prefix}${n}`.trim())}\\b`);
  }
  return { varyantRe, nesilRe: nesil.length ? new RegExp(`(?:${nesil.join('|')})`, 'i') : null };
}

/** Cumle bu urunun KARDESINDEN baska bir sey anlatmiyor mu? */
function sentenceIsSiblingOnly(sent, parts) {
  if (!parts) return false;
  if (parts.varyantRe.test(sent)) return true;
  if (parts.nesilRe && parts.nesilRe.test(sent)) return !COMPARATIVE_CUE.test(sent);
  return false;
}
function subjectNamesOf(subjects, lang) {
  return (Array.isArray(subjects) ? subjects : [subjects])
    .filter(Boolean)
    .map((s) => (typeof s === 'string' ? cleanProductName(s) : displayProductName(s, lang)))
    .filter(Boolean);
}

/** Prompt kapisi. Tek urun de liste de kabul eder — karsilastirmada TUM
 *  urunler konudur, birbirlerinin kardesi SAYILMAZ. */
function modelIdentityGate(subjects, lang) {
  const names = subjectNamesOf(subjects, lang);
  if (!names.length) return '';
  // Seri capasi YOKSA kapi SUSAR. Abonelik ("Netflix") ve sayisiz urun
  // ("Honor Robot Phone") adlarinda varyant ekseni yok; yine de metin
  // basmak modele "taban modelsin" diye olmayan bir eksen ogretirdi.
  if (!names.some((n) => seriesAnchor(n))) return '';
  const konu = new Set(names.map((n) => n.toLowerCase()));
  const rows = names.map((n) => {
    const own = variantMarkersIn(n);
    const sibs = siblingModelNames(n).filter((s) => !konu.has(s.toLowerCase()));
    const stand = own.length
      ? `this is the ${own.join(' ')} version — NOT the base model and not any other suffix`
      : 'this is the BASE model of its line — it carries no Ultra/Pro/Max/Plus/FE suffix';
    return `- "${n}": ${stand}.`
      + (sibs.length ? ` Different products that will surface in the same searches: ${sibs.join(', ')}.` : '');
  }).join('\n');
  return (
    'MODEL IDENTITY HARD GATE — measured as the most common failure in these reports.\n'
    + `The subject${names.length > 1 ? 's are' : ' is'} EXACTLY: ${names.map((n) => `"${n}"`).join(', ')}.\n`
    + `${rows}\n`
    + '- A defect, complaint, price, benchmark, camera or battery result, or feature that a source attributes to one of those other models is NOT evidence about the subject. Never carry it over, not even as "likely applies here too".\n'
    + '- NEVER list a feature among the strengths when the source says it belongs to another model. A sentence that itself names a different model disqualifies that claim.\n'
    + '- Pin every search query to the exact model. Review titles and press coverage default to the flagship of a line, so a page carrying the series name is usually about the top variant — read it before attributing anything.\n'
    + '- If a section has no subject-specific evidence, say so plainly. An honest gap is a correct report; a sibling’s material is a wrong one.\n'
    + '- You may mention another model only for explicit contrast, named in full, and stated to be a different product.'
  );
}

/** ARASTIRMA NOTU TEMIZLIGI — kapinin kacirdigini rapora GECIRMEZ.
 *  Kural: kardes modeli anan ama konuyu ANMAYAN cumle atilir. Iki adi birden
 *  gecen cumle KALIR (o bilincli bir karsilastirmadir). */
function scrubSiblingResearch(notes, subjects, lang) {
  const text = String(notes || '');
  if (!text.trim()) return text;
  const names = subjectNamesOf(subjects, lang);
  if (!names.length) return text;
  const subjectRes = names.map(subjectNameRegex).filter(Boolean);
  const sibParts = names.map(siblingDetectParts).filter(Boolean);
  if (!sibParts.length) return text;

  let dropped = 0;
  const out = text.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    // Markdown basligi / kalin etiket satiri: iddia tasimaz, dokunma.
    if (/^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$)/.test(line)) return line;
    const lead = (line.match(/^\s*(?:[-*•]\s*|\d+[.)]\s*)?/) || [''])[0];
    const body = line.slice(lead.length);
    const kept = body.split(/(?<=[.!?])\s+/).filter((s) => {
      if (!sibParts.some((pr) => sentenceIsSiblingOnly(s, pr))) return true;
      if (subjectRes.some((re) => re.test(s))) return true;   // konu da var
      dropped += 1;
      return false;
    });
    if (!kept.length) return null;
    return lead + kept.join(' ');
  }).filter((l) => l !== null).join('\n');

  return dropped
    ? `${out}\n\n[Qor AI note] ${dropped} sentence(s) about a DIFFERENT model in the same product line were removed from these notes. Do not reconstruct them.`
    : out;
}

/** RAPOR DENETIMI — yalniz KENDI urununu anlatmasi gereken bolumler.
 *  `alternatives` ve `priceForecast` DISARIDA: orada baska model adi dogru. */
const OWN_SUBJECT_KEYS = {
  product: ['strengths', 'weaknesses', 'criticalPoints', 'reliabilityNotes', 'factors',
    'featureMatches', 'analysis', 'headline', 'overallVerdict', 'pros', 'cons',
    'bestFor', 'notFor', 'matchComment'],
  community: ['chronicIssues', 'lovedFeatures', 'summary', 'themes'],
};

function collectStrings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => collectStrings(v, out));
  return out;
}

function leaksInEntry(entry, name) {
  const parts = siblingDetectParts(name);
  if (!parts || !entry || typeof entry !== 'object') return [];
  const subjRe = subjectNameRegex(name);
  const found = [];
  const scan = (bag, keys, label) => {
    if (!bag || typeof bag !== 'object') return;
    for (const k of keys) {
      if (bag[k] == null) continue;
      for (const s of collectStrings(bag[k])) {
        for (const sent of String(s).split(/(?<=[.!?])\s+/)) {
          if (!sentenceIsSiblingOnly(sent, parts)) continue;
          if (subjRe && subjRe.test(sent)) continue;
          found.push({ path: `${label}.${k}`, text: sent.trim().slice(0, 180) });
        }
      }
    }
  };
  // Tek urun raporu: { product: {...}, community: {...} }
  // Karsilastirma girdisi: alanlar DUZ durur, `community` ic ictedir.
  scan(entry.product || entry, OWN_SUBJECT_KEYS.product, 'product');
  scan(entry.community || (entry.product && entry.product.community), OWN_SUBJECT_KEYS.community, 'community');
  return found;
}

/** Rapordaki kardes-model sizintilari. Bos dizi = temiz. */
function crossModelLeaks(report, subjects, lang) {
  if (!report || typeof report !== 'object') return [];
  const names = subjectNamesOf(subjects, lang);
  if (!names.length) return [];
  if (Array.isArray(report.products)) {
    const out = [];
    for (const entry of report.products) {
      const nm = names.find((n) => String(entry?.name || '').toLowerCase().includes(String(n).toLowerCase()))
        || (entry?.name ? cleanProductName(entry.name) : names[0]);
      if (!nm) continue;
      // Karsilastirmada obur KONU urunu kardes degil: onu anan cumle mesru.
      // Alt-dize ARANMAZ — kaynak markayi dusurur ("Galaxy S26 Ultra"), tam ad
      // hicbir zaman tutmaz; obur konunun KENDI capa regexi kullanilir.
      const others = names.filter((n) => n !== nm).map(subjectNameRegex).filter(Boolean);
      for (const f of leaksInEntry(entry, nm)) {
        if (others.some((re) => re.test(f.text))) continue;
        out.push({ product: nm, ...f });
      }
    }
    return out;
  }
  return leaksInEntry(report, names[0]).map((f) => ({ product: names[0], ...f }));
}

function withModelIdentityRetryInstruction(prompt, subjects, lang, leaks = []) {
  const names = subjectNamesOf(subjects, lang);
  const ornek = leaks.slice(0, 5).map((l) => `- ${l.path}: "${l.text}"`).join('\n');
  return (
    `${prompt}\n\nMODEL IDENTITY RETRY:\n`
    + 'The previous answer was rejected: it attributed material from a DIFFERENT model in the same product line to the subject. Rewrite the JSON from scratch.\n'
    + (ornek ? `Rejected sentences:\n${ornek}\n` : '')
    + `${modelIdentityGate(subjects, lang)}\n`
    + (names.length ? `Subject names that must stay exact: ${names.join(', ')}\n` : '')
    + 'Drop every claim you cannot tie to the subject itself. A shorter honest section is required; a sibling’s material is not acceptable.'
  );
}

function quizLines(answers = []) {
  const list = (Array.isArray(answers) ? answers : [])
    .filter((a) => a?.answer != null)
    .map((a, i) => `${i + 1}. ${a.question}: ${a.answer}`);
  return list.length ? list.join('\n') : 'No product-specific quiz answers were provided.';
}

// -- DEGERLENDIRME EKSENI: QUIZIN YERINE GECEN BLOK ------------------------
//
// Yayinlanan analizlerde quiz ARTIK YANITLANMIYOR (bkz. analyses.js ->
// quizUret). Onceden quizi adminde biz cozuyorduk ve sayfadaki hukum
// ("orta uyum") o bes cevaba aitti; okuyucu o cevaplari vermedigi icin
// sayfa kimseye hitap etmiyordu.
//
// Yerine gecen sey BOSLUK DEGIL: kategoriden DETERMINISTIK turemis eksen.
// compareFactorAxis zaten karsilastirmada kullaniliyordu (eksen olmadan
// her cagri kendi etiketini uydurup tabloyu sifirla dolduruyordu); ayni
// eksen tek urunde de gecerli. EK AI ISTEGI YOK, eksen koddan geliyor.
//
// Ikinci parca kullanim profilleri: tek bir uyum yuzdesi yerine "kim icin
// evet, kim icin hayir". Long-tail sorgulari karsilayan da bu.
function evaluationAxisBlock(axis, lang) {
  const list = (Array.isArray(axis) ? axis : []).map((f) => f && f.label).filter(Boolean);
  const tr = String(lang || 'en').slice(0, 2).toLowerCase() === 'tr';
  // KRITIK: BURADAN EK CIKTI ISTENMEZ.
  //
  // Ilk surum "3-4 kullanim profili icin ayri hukum ver" diyordu ve semada o
  // hukumlerin gidecegi ALAN YOKTU. Model onlari serbest metin alanlarina
  // (analysis zaten 8-11 paragraf) sikistirdi, cikti 16384 jeton tavanini
  // asti, JSON ortasinda kesildi ve parseAiJson null dondu: adminde
  // "Rapor cozulemedi (en)". Ayni tuzak 2026-08-22'de priceForecast'te de
  // yasanmisti (bkz. runProductReport'taki olcum notu).
  //
  // Cozum: yeni alan degil, VAR OLAN alanlari yonlendirmek. `factors` zaten
  // 8-10 etiket istiyor -> eksen oraya oturur. `bestFor`/`notFor` zaten var
  // -> kullanim profilleri oraya girer. Cikti hacmi ARTMAZ.
  const axisPart = list.length
    ? 'Use these as the labels of product.factors, in this order, before adding any of your own:\n'
      + list.map((l, i) => (i + 1) + '. ' + l).join('\n')
    : 'Choose product.factors labels from the dimensions that actually matter in this category.';
  return 'NO QUIZ WAS ANSWERED. Write for EVERY reader, not one assumed buyer.\n'
    + axisPart + '\n'
    + 'product.bestFor must name 2-3 concrete use profiles this product suits, '
    + 'each with the number that justifies it. product.notFor must name at least '
    + 'one profile it is clearly WRONG for, with the number that proves it.\n'
    + 'product.matchScore is the product level on its own merits, NOT a fit with '
    + 'any reader. Never address the reader as if they had answered questions, '
    + 'and never write "your needs" or "your answers".'
    + (tr ? '\nWrite every user-facing string in Turkish.' : '');
}

function promptContext({ quizAnswers = [], factorAxis = [], research = '', similarProducts = [], offers = [], heroSpecs = [] } = {}, lang) {
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
    factorAxis: Array.isArray(factorAxis) ? factorAxis : [],
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
    `${modelIdentityGate(p, lang)}\n\n` +
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
    `${modelIdentityGate(p, lang)}\n\n` +
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
    `${modelIdentityGate(p, lang)}\n\n` +
    `${freshnessRules()}\n${languageGate(lang)}\n${researchSourceGate(lang)}\n\n` +
    'Use current web search. Focus on official spec pages, current retailer/store pages, public ownership/review sentiment from Reddit, YouTube reviews, large retailer reviews, specialist review sites, and recent market/price-cycle signals. '
    // TARTISMALI SPEC'LERI ACIKCA SOR.
    // Katalog bazi alanlari HIC tasimiyor: olculdu 2026-09-03, iPhone 17e
    // kaydinda ekran YENILEME HIZI yok (tek "Hz" degerleri islemci
    // frekansi). Arastirma da sormadigi icin rapor 60 Hz tartismasindan hic
    // soz etmedi — oysa alicinin en cok konustugu konu oydu.
    + 'ALSO ask explicitly about the spec areas buyers argue about in this category and report what you find, even when the catalog does not list them: display refresh rate (60 Hz vs 120 Hz and whether owners complain about it), charging wattage and real charge time, RAM amount, storage type/expandability, port and connectivity generation, and anything the maker was criticised for leaving out of the box. If a source says the product is behind its rivals on one of these, say so plainly with the number. '
    + `${chronicResearchGate(category)} `
    + 'Also note what owners bring up unprompted as the best part. ' +
    'First determine whether the product is announced/released/available today, then summarize ownership evidence. Do not invent direct quotes, exact review counts, or exact current prices. If evidence is weak, say so clearly.\n\n' +
    (Array.isArray(context.quizAnswers) && context.quizAnswers.length
      ? `Product-specific quiz answers:\n${quizLines(context.quizAnswers)}\n\n`
      : `EVALUATION AXIS (no quiz was answered):\n${evaluationAxisBlock(context.factorAxis, lang)}\n\n`) +
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
    `${modelIdentityGate(products, lang)}\n\n` +
    `${freshnessRules()}\n${languageGate(lang)}\n${researchSourceGate(lang)}\n\n` +
    'Use current web search. For each product, gather current availability/status, public sentiment from Reddit, YouTube, specialist reviews, retailer reviews, official spec pages, and price-cycle signals. '
    // Karsilastirmada da kronik sorun ARANMAK zorunda: `buildCompareProductPrompt`
    // her urun icin `community.chronicIssues` istiyor ve arastirma notlarinda
    // yoksa liste bos donuyor.
    + `${chronicResearchGate((products || []).map((p) => p?.category).find(Boolean))} ` +
    'Then note the decisive differences that matter for a buyer choosing one. Do not invent quotes, exact counts, or exact live prices.\n\n' +
    `Comparison quiz answers:\n${quizLines(context.quizAnswers)}\n\n` +
    `Reply in ${langName(lang)} with concise research notes only; no JSON is required.`
  );
}

// Consolidated single-call prompt: quiz answers + catalog specs + optional web
// research become one continuous report in the requested order.
/* ── IKINCI DILIN AYNASI: OLGU URETME, CEVIR ───────────────────────────────
   Analiz iki AYRI cagriyla uretiliyor ve her cagri KENDI grounded aramasini
   yapiyordu. Arama sorgulari o dilde uretildigi icin iki dil BASKA
   kaynaklara gidiyordu — olculdu 2026-09-03, canli grounding metadata:
     TR sorgulari "iPhone 17 Pro sorunlari" -> sikayetvar.com x4,
        donanimhaber.com, samsungazetesi.com
     EN sorgulari ise ingilizce kaynaklara
   Sonuc: ayni urunun iki dilde BAMBASKA kronik sorunlari ve yuzdeleri.
   Olculdu, dort kaydin dordunde de:
     iPhone 17 Pro  TR "Kamera Kalitesi 90%"  EN "Camera Quality 95%"
     TR kronik: kamera parlaklik / ekran arizasi / garanti
     EN kronik: scratchgate / renk solmasi / Wi-Fi
   Ayni urun, ayni hafta, iki farkli gercek. Savunulacak tarafi yok.

   COZUM: ikinci dil ILK DILIN raporunu ayna olarak alir. Yeni olgu uretmez,
   var olani cevirir — ayni sayi, ayni sira, ayni adet.

   FIYAT BILEREK DISARIDA: kullanicinin kurali — "sadece fiyat kisminda
   farkli yorum yapilabilir, o da ulkeden ulkeye degistigi icin". TL kuru ve
   Turkiye stok durumu Ingilizce okuyucunun pazariyla ayni degil. */
function mirrorFactsBlock(mirror, lang) {
  if (!mirror || typeof mirror !== 'object') return '';
  const pr = mirror.product || {};
  const co = mirror.community || pr.community || {};
  const dil = languageName(lang);
  const satir = (v) => JSON.stringify(v);
  const bolum = [];
  if (pr.matchScore != null || pr.confidence != null || pr.decision) {
    bolum.push(`verdict: matchScore=${pr.matchScore}, confidence=${pr.confidence}, decision=${satir(pr.decision)}`);
  }
  if (Array.isArray(pr.factors) && pr.factors.length) {
    bolum.push(`factors (${pr.factors.length}, SAME ORDER):\n` + pr.factors
      .map((f, i) => `  ${i + 1}. ${f.label} = ${f.score}`).join('\n'));
  }
  if (Array.isArray(pr.criticalPoints) && pr.criticalPoints.length) {
    bolum.push(`criticalPoints (${pr.criticalPoints.length}, SAME ORDER):\n` + pr.criticalPoints
      .map((c, i) => `  ${i + 1}. ${c.title} [severity: ${c.severity}]`).join('\n'));
  }
  if (co.satisfaction != null) bolum.push(`community.satisfaction = ${co.satisfaction}`);
  if (co.sentimentBreakdown) bolum.push(`community.sentimentBreakdown = ${satir(co.sentimentBreakdown)}`);
  if (Array.isArray(co.themes) && co.themes.length) {
    bolum.push(`community.themes (${co.themes.length}, SAME ORDER):\n` + co.themes
      .map((t, i) => `  ${i + 1}. ${t.label} = ${t.strength} [${t.sentiment}]`).join('\n'));
  }
  if (Array.isArray(co.chronicIssues) && co.chronicIssues.length) {
    bolum.push(`community.chronicIssues (${co.chronicIssues.length}, SAME ORDER):\n` + co.chronicIssues
      .map((c, i) => `  ${i + 1}. ${c.title} [${c.frequency}]`).join('\n'));
  }
  if (Array.isArray(co.lovedFeatures) && co.lovedFeatures.length) {
    bolum.push(`community.lovedFeatures (${co.lovedFeatures.length}, SAME ORDER):\n` + co.lovedFeatures
      .map((c, i) => `  ${i + 1}. ${c.title}`).join('\n'));
  }
  if (!bolum.length) return '';
  return 'MIRROR THESE FACTS — THIS ANALYSIS ALREADY EXISTS IN ANOTHER LANGUAGE.\n'
    + `The same product was analysed from the same research. Your job is to write it in ${dil}, NOT to research it again.\n\n`
    + bolum.join('\n') + '\n\n'
    + 'HARD RULES FOR THE MIRRORED PARTS:\n'
    + `- Reproduce every list above with the SAME NUMBER of entries, in the SAME ORDER. Translate the label/title into ${dil}; keep brand, model and technical terms as they are.\n`
    + '- Copy every NUMBER exactly: scores, strengths, satisfaction, the sentiment breakdown, severity and frequency values. Do not round, adjust or "improve" them.\n'
    + '- Do NOT add an item that is not listed, and do NOT drop one that is. If you believe an item is wrong, still reproduce it — consistency between the two language versions outweighs your own second opinion.\n'
    + '- The prose (analysis, summary, detail, verdict, bestFor, notFor) is yours to write naturally in the target language; it must describe THESE facts and no others.\n'
    + '- EXCEPTION — priceForecast is NOT mirrored. Price, currency, availability and the buy/wait timing differ by market, so write that section for the reader of this language on its own merits.\n\n';
}

function buildFullPrompt(p, lang, profile = {}, context = {}) {
  // Quiz yanitlandi mi? Semanin quiz'e dayanan kurallari buna bagli.
  const quizVar = Array.isArray(context.quizAnswers) && context.quizAnswers.length > 0;
  const { name, brand, category, score, price, ks } = productLine(p, lang);
  const ctx = promptContext(context, lang);
  const prof = Object.entries(profile).filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).slice(0, 18).join('; ');
  return (
    `You are Qor AI's senior product analyst and product advisor. Analyse "${name}" by ${brand || 'unknown'} (category: ${category}). ` +
    'Use the product name exactly as given. Do not replace it with a similar model.\n\n' +
    `${modelIdentityGate(p, lang)}\n\n` +
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
    '    "matchComment": ' + (quizVar
      ? '"5-7 detailed sentences explaining quiz/profile fit, trade-offs, and who should care",'
      : '"5-7 detailed sentences on what this product actually delivers, its trade-offs, and which buyers should care",') + '\n' +
    '    "reviewedInputs": ["<input/source label in requested language>", "<input/source label in requested language>"],\n' +
    '    "factors": [{"label": "Usage fit", "score": <0-100>, "detail": "2 detailed sentences with evidence"}],\n' +
    '    "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences on why it changes the decision", "severity": "high|mid|low"}],\n' +
    '    "quizInsights": [{"topic": "what the question was about", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences on how it moved the score"}],\n' +
    '    "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": '
      + (quizVar ? '"need inferred from quiz/profile"' : '"the buyer need this spec serves in this category"')
      + ', "score": <0-100>, "comment": "2 detailed sentences with evidence"}],\n' +
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
    // PARAGRAF DUYGUSU METINLE BIRLIKTE URETILIR. Onceden on yuz bunu
    // KELIME SOZLUGUYLE tahmin ediyordu ve gercek cumlelerde yaniliyordu
    // ("impacting the smoothness" -> yesil, "no problems" -> kirmizi).
    //
    // ANAHTARI MODELDEN NORMALIZE ISTEMIYORUZ ARTIK.
    // Eski metin "lowercased, punctuation stripped, single-spaced, max 90
    // chars" diyordu; model bunu UYGULAMIYORDU (olculdu 2026-09-02: 54
    // etiketin 54'u ham cumle, noktalamali ve 90 karakterden uzun). Okuma
    // tarafi ise `paragraphKey`den geciyordu, yani hicbir anahtar tutmuyor
    // ve yeni analizlerin TEK BIR paragrafi bile renklenmiyordu.
    // Normalizasyon artik okuma tarafinda TEK yerde yapiliyor
    // (web/src/lib/sentiment.js -> sentimentIndex); modelden istenen sey
    // yalnizca cumleyi OLDUGU GIBI kopyalamak.
    '  "paragraphSentiment": {"<the paragraph\'s opening sentence, copied verbatim>": "positive|negative"},\n' +
    '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "specific month/season/window", "buyOrWait": "buy|wait|watch", "drivers": ["5 concrete drivers"], "analysis": "5-7 substantial paragraphs with researched reasoning and caveats"}\n' +
    '}\n\n' +
    'Rules:\n' +
    // PARAGRAF SINIRINI MODEL CIZMELI — YOKSA BIZ UYDURUYORUZ.
    //
    // OLCULDU 2026-09-02 (canli apple-iphone-17-pro-512gb kaydi):
    //   report_tr.product.analysis  2985 karakter, satir sonu 0
    //   report_en.product.analysis  2936 karakter, satir sonu 0
    // Yani "5-7 substantial paragraphs" isteyip TEK SATIR aliyorduk ve
    // `web/src/lib/prose.js -> proseBlocks` metni UCER CUMLELIK bloklara
    // kendi paketliyordu. Bunun iki bedeli var:
    //   1. Paragraf ritmi modelin degil, bir bolme kuralinin eseri.
    //   2. `paragraphSentiment` anahtari "paragrafin ilk cumlesi" demek,
    //      ama model hangi cumlenin paragraf basina denk gelecegini
    //      BILEMEZ. Olculdu: 22 paragrafin yalnizca 6'si etiketle bulustu.
    // Bos satir istemek ikisini birden cozuyor; uydurma bolme kalkiyor.
    '- PARAGRAPH BREAKS ARE MANDATORY: in every prose field that asks for more than one paragraph (product.analysis, community.summary, priceForecast.analysis), separate the paragraphs with a blank line (\\n\\n) inside the JSON string. Never return a multi-paragraph field as one unbroken run of sentences — the reader splits on those blank lines, and without them the paragraph boundaries are invented for you.\n' +
    '- community.sentimentBreakdown must be integer percentages summing to ~100, realistic (never all-positive) and consistent with community.summary.\n' +
    '- community.themes must include 5-6 recurring discussion topics with varied sentiment (never all positive).\n' +
    // KRONIK SORUN != EKSI. Eksiler urunun ozelliklerinden cikarilabilir
    // ("pahali", "agir"); kronik sorun ancak SAHIPLIK sonrasi ortaya cikar ve
    // forumlarda TEKRAR EDER. Ikisini ayni sey saymak raporda ayni listeyi
    // iki kez basiyordu.
    '- community.chronicIssues: 3-5 problems owners keep reporting AFTER living with it — failures that appear over months, a batch with a known defect, a firmware/driver issue that keeps returning, support that keeps disappointing. NOT a restatement of product.weaknesses: a weakness is visible on the spec sheet, a chronic issue only shows up in ownership. If research covers none, return an empty array and say so in verificationNotes — do NOT invent one and do NOT downgrade a spec-sheet drawback into this list.\n'
    // Olculdu 2026-08-25: arastirma notlarinda ariza ANLATILDIGI halde liste
    // bos donebiliyordu (MacBook Neo TR 0 / EN 2, ayni urun). Notlarda gecen
    // bir ariza listeye girmek ZORUNDA; "bos birak" izni yalnizca arama
    // gercekten bos dondugunde gecerli.
    + '- If the research notes name ANY recurring failure, defect, RMA pattern, firmware regression or degradation, it MUST appear in community.chronicIssues. Leaving it out because it reads like a minor problem, because it is only documented in another language, or because the section feels negative is a reporting error. The empty array is permitted only when the research itself reports that it searched and found nothing.\n'
    + '- This applies to EVERY category. A laptop, a graphics card, a TV, a pair of headphones and a washing machine all have ownership failure modes; only the phone category has a large Turkish-language forum trail. Never conclude "no chronic issues" from the absence of Turkish-language threads.\n'
    + '- ONLY the findings the research marks [MODEL-SPECIFIC] belong in this list. Anything the research marks [CATEGORY-GENERAL] — a known trait of the category, standard advice, or a failure mode that was searched and not tied to this model — must be left out. "Laptops can have battery swelling" is not a chronic issue of THIS laptop.\n' +
    '- community.lovedFeatures: 3-5 things owners single out unprompted as the best part. Same rule: what OWNERS keep saying, not what the spec sheet implies.\n' +
    // TEK YONLU KURAL YETMIYOR. Olculdu (iPhone 16 Pro Max, 2026-08-22):
    // kronik sorunlar temizdi ama zayif yanlar listesine "yazilimsal hatalar
    // ve asiri isinma" sizmisti — ayni sey iki bolumde. Sinir IKI TARAFA da
    // yazilmali.
    '- product.weaknesses must stay on the DECISION side: size, weight, price, a missing accessory, a spec that falls short, ecosystem lock-in — things a buyer can judge before paying. Do NOT list failures, crashes, overheating, defects or support problems there; those belong to community.chronicIssues and repeating them makes the report say the same thing twice.\n' +
    '- product.criticalPoints: 4-6 things that would CHANGE THE DECISION ITSELF — a compatibility trap, a hidden cost, ecosystem lock-in, an accessory you must buy separately, patchy service coverage, a regional limitation. Denetim olcumu: bu bolum en cok TEKRARLANAN bolum. A criticalPoint is NOT a strength, NOT a weakness and NOT a chronic issue restated with a scarier title. Test each one: if the buyer already learned it from strengths/weaknesses/chronicIssues, it does not belong here. If fewer than 4 survive that test, return fewer — an honest short list beats a padded one.\n' +
    // TEK OLGU, TEK YER. Olculdu: bu sinir yokken model ayni 4-5 olguyu
    // weaknesses + criticalPoints + reliabilityNotes + chronicIssues +
    // summary icine kopyaliyordu, yani okuyucu ayni sikayeti BES KEZ
    // goruyordu. Alan alan sinir yazmak yetmedi; birlestiren kural sart.
    '- ONE FACT, ONE PLACE. product.strengths, product.weaknesses, product.criticalPoints, product.reliabilityNotes, community.lovedFeatures and community.chronicIssues must not share a single fact between them. Before writing an item, check whether another list already covers it; if it does, drop it or write the genuinely different angle. Each list answers its own question: strengths/weaknesses = what a buyer can judge BEFORE paying · criticalPoints = what would flip the decision itself · reliabilityNotes = what the maker promises · lovedFeatures/chronicIssues = what owners report AFTER living with it.\n' +
    // Quiz yanitlanmadiginda bu kural KENDI KENDINE CELISIYORDU: model hem
    // "cevaplanmis her soru icin bir kayit (4-6)" hem "verilmemis cevap
    // uydurma" emrini birden aliyordu. Bos dizi istemek celiskiyi kaldirir.
    (quizVar
      ? '- product.quizInsights must reference the ACTUAL quiz answers listed below, one entry per answered question (4-6). impact is negative when the answer works against this product. Never invent an answer that was not given.\n'
      : '- product.quizInsights MUST be an empty array []. No quiz was answered; do not invent questions or answers.\n') +
    '- product.factors must include 8-10 varied factor scores for chart bars. Use labels that a buyer understands.\n' +
    '- featureMatches must include 8-10 spec/need matches using real catalog spec values where possible.\n' +
    '- alternatives must include 3 products. Prefer Qor catalog alternatives if they fit; copy imageUrl/url exactly from the context for those. External alternatives may have empty imageUrl/url.\n' +
    `- ${segmentGate(p)}\n` +
    `- ${scoreScaleGate(p)}\n` +
    '- paragraphSentiment: for EVERY multi-sentence prose field you write (product.analysis, community.summary, priceForecast.analysis, bestFor, notFor, overallVerdict, matchComment and each factors[].detail / criticalPoints[].detail), add one entry per paragraph. THE KEY IS THE PARAGRAPH\'S OPENING SENTENCE COPIED VERBATIM — same words, same punctuation, same casing, do not shorten, do not rewrite, do not lowercase it. Judge ONLY that opening sentence, and only as an evaluation OF THE PRODUCT: positive = it praises or states a strength; negative = it criticises, names a weakness, a limitation, a risk or a mismatch with the buyer need. Concessive openers carry the judgement in the SECOND clause (\"While the display is bright, its 60Hz feels dated\" is negative; \"Although expensive, performance is exceptional\" is positive). Negation reverses (\"no problems reported\" is positive). Never label from a single word.\n' +
    // NOTR OLMAK ARTIK ISTISNA, VARSAYILAN DEGIL.
    // Onceki metin "OMIT neutral paragraphs entirely" diyordu ve model bunu
    // asiri uyguluyordu: olculdu (canli iPhone 17 Pro kaydi) "This device
    // excels with its powerful Apple A19 Pro chip" gibi acikca OVGU olan
    // paragraflar etiketsiz kaliyor, ekranda duz siyah ciiziliyordu.
    // Etiketlemek ucuz, etiketsiz birakmak gorunur bir kayip.
    '- paragraphSentiment coverage: a paragraph you wrote to EVALUATE the product must be labelled. Only leave a paragraph out when its opening sentence is purely factual with no judgement at all (a bare spec list, a date, a plain price observation). If you hesitate between neutral and a judgement, label the judgement: an evaluative paragraph left unlabelled is rendered as flat unmarked text. Extra entries are harmless, missing ones are not.\n' +
    '- paragraphSentiment, reported faults: a sentence that reports a defect, a failure, a complaint, a return or a difficulty owners ran into is NEGATIVE even when it is phrased as a flat observation with no judging word ("Some users received units with dead pixels out of the box"). A flatly worded report of something working well is POSITIVE. In Turkish the concessive suffix "-sa da / -se de" ("olumlu olsa da, bazı endişeler var") carries the judgement in the SECOND clause exactly like "ancak" and "rağmen".\n' +
    // FIYAT BOLUMU KOMPLE RENKSIZ KALIYORDU.
    // Onceki kural "plain price observation" -> notr diyordu ve model bunu
    // priceForecast'in TAMAMINA uyguluyordu: olculdu 2026-09-03, canli
    // iPhone 17 Pro sayfasinda fiyat bolumunun DORT paragrafinin dordu de
    // siyahti. Hata kurali uygulamakta degil KURALIN KENDISINDEYDI: fiyat
    // cumlesi urun hakkinda degil ALICI hakkinda hukum tasir.
    '- paragraphSentiment, price and timing: priceForecast paragraphs are judged FROM THE BUYER\'S SIDE, not as product traits. positive = good news for the buyer (price falling, a discount window coming, waiting pays off, good time to buy, fair value); negative = bad news for the buyer (price high or rising, no meaningful drop expected, you pay a premium, poor value, scarcity pushing prices up). Leave neutral ONLY a bare figure or date with no direction. "Its price tends to remain stable, with significant drops rare" is NEGATIVE (the buyer saves nothing); "Waiting until Q1 could yield better deals" is POSITIVE. Do not leave a whole price section unlabelled.\n' +
    '- priceForecast must not pretend to know live prices unless research notes include them. Use market cycles, product age, availability, successor timing and retailer behavior.\n' +
    // FIYATI CEVIRME. Katalog fiyati YEREL para biriminde ve pazariyla
    // birlikte veriliyor. Model onu baska bir para birimine cevirdiginde
    // kendi kafasindaki kuru kullaniyor ve sonuc sacma cikiyor (olculdu:
    // 68.999 TL'lik butce telefonu "yaklasik 1973 USD'lik amiral gemisi"
    // diye yazildi). Cevrim yapilacaksa VERI KATMANINDA yapilir.
    '- CURRENCY: the catalog price is given in its OWN currency with the market named. Quote it EXACTLY as given, in that currency. NEVER convert it to another currency and never restate it as a global/US price — you do not have an exchange rate and the converted figure is always wrong. If the reader\'s market is not the one given, say which market the figure belongs to instead of converting it.\n' +
    // SAGDUYU KAPISI. Veri katmani bozuk olabilir; model bunu YUTMAMALI.
    '- PRICE SANITY: if the given catalog price contradicts what the product plainly is (a budget model quoted above flagship money, or a flagship quoted at throwaway money), do NOT build an argument on that number. Say the listed price and note that it looks inconsistent with the segment, or omit the figure — never reason from a number you can see is wrong.\n' +
    // FIYAT "DIKKAT EDILMESI GEREKENLER"E YAZILMAZ.
    // Kullanicinin karari (2026-09-03): "fiyat bilgisi dogru degilse illa
    // fiyat bilgisi cekmesine gerek yok, oraya eklemese de olur".
    // Sayfada ZATEN ayri bir fiyat bolumu var (priceForecast + canli magaza
    // listesi). Ayni sayiyi bir de uyari maddesi diye tekrarlamak hem yer
    // israfi hem de sayi yanlissa hatayi IKINCI KEZ basmak demek — olculdu
    // 2026-09-03: "Yaklasik 1973 USD'lik fiyatiyla yuksek bir maliyete
    // sahiptir" satiri tam da `weaknesses` icindeydi.
    '- NEVER put a price figure in weaknesses, criticalPoints, factors[].detail or notFor. Those lists are for what the product IS and DOES — something the reader can check on a spec sheet or in ownership reports. "It costs X" is not a weakness; the price already has its own section (priceForecast) and its own live store list on the page. You may still judge VALUE there, just without quoting an amount: name the tier it competes in and what it gives up or gains against that tier. The ONLY field that may contain a price figure is priceForecast.\n\n' +
    // AYNA BLOGU: model sema kurallarini okumadan once "bu analiz zaten
    // var, sen ceviriyorsun" bilgisini almali.
    (context.mirror ? mirrorFactsBlock(context.mirror, lang) : '') +
    `MARKET / AVAILABILITY CONTEXT:\n${availabilityContextForProduct(p, context.offers)}\n\n` +
    `PRODUCT CONTEXT:\nName: ${name}\nBrand: ${brand || '-'}\nCategory: ${category || '-'}\nQor AI Tech Score: ${score}/100\nApprox catalog price: ${price}\nCatalog specs: ${ks || '-'}\nHero specs: ${JSON.stringify(ctx.heroSpecs)}\n\n` +
    (Array.isArray(context.quizAnswers) && context.quizAnswers.length
      ? `PRODUCT-SPECIFIC QUIZ ANSWERS:\n${ctx.quizAnswers}\n\n`
      : `EVALUATION AXIS - NO QUIZ WAS ANSWERED:\n${evaluationAxisBlock(ctx.factorAxis, lang)}\n\n`) +
    (prof ? `USER PROFILE / USER-RECOGNITION SIGNALS:\n${prof}\n\n` : '') +
    `QOR CATALOG ALTERNATIVES:\n${JSON.stringify(ctx.similarProducts, null, 2)}\n\n` +
    `OFFER CONTEXT:\n${JSON.stringify(ctx.offers, null, 2)}\n\n` +
    `WEB RESEARCH NOTES:\n${ctx.research || 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}`
  );
}

/* ── 7.5) KARSILASTIRMA FAKTOR EKSENI · TEK ORTAK EKSEN ────────────────────

   KOK NEDEN (olculdu 2026-08-29, canli kayit "S26 Ultra vs iPhone 17 Pro Max
   vs Xiaomi 17 Ultra"): karsilastirma raporu her urunu KENDI cagrisinda
   uretiyor (buildCompareProductPrompt) ve her cagri kendi faktor ETIKETLERINI
   uyduruyordu — Samsung "Islemci Performansi", iPhone "Performans", Xiaomi
   "Kamera Performansi". Site tarafindaki faktor matrisi etiketlerin BIRLESIMINI
   aliyor, dolayisiyla her urun kendi etiketlerinde puan aliyor, otekilerde
   0 goruunuyordu: 14 satirlik tablonun 42 hucresinden 28'i sifirdi. Okuyucu
   bunu "iPhone'un islemcisi 0 puan" diye okuyor.

   COZUM: eksen ARTIK MODELDEN GELMIYOR. Kategoriden deterministik olarak
   secilir, butun urun cagrilarina AYNI liste AYNI SIRAYLA verilir ve donen
   cikti tekrar bu eksene hizalanir (alignFactorsToAxis). Ek AI istegi YOK —
   eksen veriden turuyor, yani hem bedava hem de iki dilde ayni.

   Link karsilastirmasi bu deseni zaten kullaniyordu (qor_ai_link.js ->
   compareFactorLabels); orada 8 sabit jenerik etiket var. Urun tarafinda
   kategoriye gore uyarlanmis eksen kullaniyoruz: "Kamera Kalitesi" bir
   telefonda anlamli, bir ekran kartinda degil. */

// Slot sirasi SABIT (emoji de oyle) cunku radar grafigi ve isi matrisi satir
// sirasini bu listeden aliyor.
const COMPARE_AXIS_EMOJI = ['⚡', '📸', '🖥', '🔋', '🧩', '🛡', '🌐', '💰'];

const COMPARE_AXIS = {
  phone: {
    en: ['Performance', 'Camera', 'Display', 'Battery and charging', 'Software support', 'Build and durability', 'Ecosystem and connectivity', 'Value for money'],
    tr: ['Performans', 'Kamera', 'Ekran', 'Pil ve şarj', 'Yazılım desteği', 'Yapı ve dayanıklılık', 'Ekosistem ve bağlantı', 'Fiyat/performans'],
  },
  computer: {
    en: ['Processor performance', 'Graphics performance', 'Display quality', 'Battery and thermals', 'Memory and storage', 'Build and keyboard', 'Ports and expandability', 'Value for money'],
    tr: ['İşlemci performansı', 'Grafik performansı', 'Ekran kalitesi', 'Pil ve ısınma', 'Bellek ve depolama', 'Yapı ve klavye', 'Bağlantı ve genişletme', 'Fiyat/performans'],
  },
  screen: {
    en: ['Picture quality', 'Panel and refresh rate', 'HDR and colour', 'Sound', 'Smart platform', 'Gaming latency', 'Connectivity', 'Value for money'],
    tr: ['Görüntü kalitesi', 'Panel ve yenileme hızı', 'HDR ve renk', 'Ses', 'Akıllı platform', 'Oyun gecikmesi', 'Bağlantı', 'Fiyat/performans'],
  },
  audio: {
    en: ['Sound quality', 'Noise cancelling', 'Battery life', 'Comfort and fit', 'Microphone and calls', 'Connectivity', 'Build quality', 'Value for money'],
    tr: ['Ses kalitesi', 'Gürültü engelleme', 'Pil ömrü', 'Konfor ve oturma', 'Mikrofon ve arama', 'Bağlantı', 'Yapı kalitesi', 'Fiyat/performans'],
  },
  component: {
    en: ['Raw performance', 'Power efficiency', 'Thermals and noise', 'Compatibility', 'Feature set', 'Build quality', 'Longevity and support', 'Value for money'],
    tr: ['Ham performans', 'Enerji verimliliği', 'Isı ve gürültü', 'Uyumluluk', 'Özellik seti', 'Yapı kalitesi', 'Uzun ömür ve destek', 'Fiyat/performans'],
  },
  wearable: {
    en: ['Everyday performance', 'Health and sensors', 'Display', 'Battery life', 'App ecosystem', 'Comfort and build', 'Phone compatibility', 'Value for money'],
    tr: ['Günlük performans', 'Sağlık ve sensörler', 'Ekran', 'Pil ömrü', 'Uygulama ekosistemi', 'Konfor ve yapı', 'Telefon uyumluluğu', 'Fiyat/performans'],
  },
  console: {
    en: ['Gaming performance', 'Game library', 'Storage', 'Online services', 'Controller and comfort', 'Noise and thermals', 'Media features', 'Value for money'],
    tr: ['Oyun performansı', 'Oyun kütüphanesi', 'Depolama', 'Çevrim içi servisler', 'Kumanda ve konfor', 'Gürültü ve ısınma', 'Medya özellikleri', 'Fiyat/performans'],
  },
  home: {
    en: ['Core performance', 'Energy efficiency', 'Capacity', 'Noise level', 'Smart features', 'Build quality', 'Service and parts', 'Value for money'],
    tr: ['Temel performans', 'Enerji verimliliği', 'Kapasite', 'Gürültü seviyesi', 'Akıllı özellikler', 'Yapı kalitesi', 'Servis ve yedek parça', 'Fiyat/performans'],
  },
  generic: {
    en: ['Usage fit', 'Performance', 'Build quality', 'Feature set', 'Ergonomics and portability', 'Reliability and risk', 'Community signal', 'Long-term value'],
    tr: ['Kullanım uyumu', 'Performans', 'Yapı kalitesi', 'Özellik seti', 'Ergonomi ve taşınabilirlik', 'Güvenilirlik ve risk', 'Topluluk sinyali', 'Uzun vadeli değer'],
  },
};

// Katalog kategorisi -> eksen ailesi. Eslesmeyen her sey `generic`e duser
// (eksen yine ORTAK kalir, yalnizca etiketler jeneriklesir).
const COMPARE_AXIS_FAMILY = {
  smartphones: 'phone', feature_phones: 'phone', tablets: 'phone', e_readers: 'phone',
  laptops: 'computer', desktops: 'computer', mini_pcs: 'computer', all_in_one: 'computer',
  monitors: 'screen', tvs: 'screen', projectors: 'screen',
  headphones: 'audio', earbuds: 'audio', earphones: 'audio', speakers: 'audio',
  soundbars: 'audio', microphones: 'audio',
  graphics_cards: 'component', cpus: 'component', motherboards: 'component',
  ram: 'component', ssd: 'component', ssds: 'component', storage: 'component',
  psu: 'component', psus: 'component', cases: 'component', coolers: 'component',
  flash_drives: 'component', keyboards: 'component', mice: 'component',
  smartwatches: 'wearable', fitness_trackers: 'wearable', smart_bands: 'wearable',
  gaming_consoles: 'console', consoles: 'console',
  vacuum_cleaners: 'home', washing_machines: 'home', refrigerators: 'home',
  dishwashers: 'home', air_conditioners: 'home', ovens: 'home', coffee_machines: 'home',
  air_purifiers: 'home',
};

function compareAxisFamily(category) {
  const key = String(category || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (COMPARE_AXIS_FAMILY[key]) return COMPARE_AXIS_FAMILY[key];
  // Kategori adi katalogdakiyle birebir tutmayabilir (link analizinden gelen
  // serbest metin). Kelime bazli ikinci kapi.
  if (/phone|telefon|tablet/.test(key)) return 'phone';
  if (/laptop|notebook|desktop|bilgisayar/.test(key)) return 'computer';
  if (/tv|televizyon|monitor|projeksiyon|projector/.test(key)) return 'screen';
  if (/kulak|headphone|earbud|speaker|hoparlor/.test(key)) return 'audio';
  if (/gpu|ekran_karti|cpu|islemci|ram|ssd|anakart|motherboard|psu/.test(key)) return 'component';
  if (/watch|saat|band|bileklik/.test(key)) return 'wearable';
  if (/konsol|console|playstation|xbox/.test(key)) return 'console';
  if (/supurge|camasir|bulasik|buzdolabi|klima|firin/.test(key)) return 'home';
  return 'generic';
}

/**
 * Karsilastirmadaki BUTUN urunlerin uzerinde puanlanacagi ortak eksen.
 * Urunler farkli ailelerdense jenerik eksene duser — yarim ortak eksen
 * (kimisinde kamera, kimisinde yok) tam da duzeltmeye calistigimiz hatayi
 * uretir.
 *
 * @returns [{key, label, emoji}] — 8 slot, SABIT sirada.
 */
function compareFactorAxis(products, lang) {
  const list = Array.isArray(products) ? products : [products];
  const families = [...new Set(list.filter(Boolean).map((p) => compareAxisFamily(p && p.category)))];
  const family = families.length === 1 ? families[0] : 'generic';
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const table = COMPARE_AXIS[family] || COMPARE_AXIS.generic;
  const labels = table[code === 'tr' ? 'tr' : 'en'];
  return labels.map((label, i) => ({
    key: family + '_' + i,
    label: label,
    emoji: COMPARE_AXIS_EMOJI[i] || '📊',
  }));
}

// Etiket eslestirme icin normalizasyon: aksan, noktalama ve dolgu kelimeleri
// duser. "Ekran Parlakligi ve Kalitesi" ile "Ekran" ayni slota dusmeli.
const AXIS_STOPWORDS = new Set([
  've', 'ile', 'and', 'or', 'the', 'of', 'for', 'a', 'an', 'ya', 'veya',
]);

// AYNI SEYIN IKINCI ADI. Yalnizca gercekten es anlamli olanlar; "islemci"
// -> "performans" gibi genisletmeler yanlis slota dusurur.
const AXIS_SYNONYM = {
  batarya: 'pil', aku: 'pil', battery: 'pil',
  saglamlik: 'dayaniklilik', dayanim: 'dayaniklilik',
  goruntu: 'ekran', display: 'ekran', panel: 'ekran',
  fotograf: 'kamera', camera: 'kamera',
  hiz: 'performans', performance: 'performans',
  gpu: 'graphics', grafik: 'graphics',
  cpu: 'processor', islemci: 'processor',
  yazilim: 'yazilim', guncelleme: 'yazilim', guncellik: 'yazilim',
  deger: 'fiyat', value: 'fiyat', maliyet: 'fiyat', price: 'fiyat',
};

function axisTokens(label) {
  return String(label || '')
    .replace(/[İI]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !AXIS_STOPWORDS.has(t))
    .map((t) => AXIS_SYNONYM[t] || t);
}

// Kok eslesmesi: "performans" ~ "performansi", "kamera" ~ "kameralar".
function axisTokenHit(t, tokens) {
  return tokens.some((u) => u === t
    || (u.length > 4 && t.length > 4 && u.slice(0, 5) === t.slice(0, 5)));
}

/**
 * `a` = eksen slotu, `b` = modelin yazdigi etiket. Simetrik DEGIL: asil soru
 * "modelin etiketi bu slotun kavramini KAPSIYOR mu". "Ekran" slotu ile
 * "Ekran Parlakligi ve Kalitesi" ayni seydir; simetrik olcum bunu 0.33'e
 * dusurup eslesmeyi kaciriyordu (olculdu: canli S26 kaydinin etiketleri).
 *
 * Bas kelime bonusu, "Kamera Performansi"nin `Performans` slotuna degil
 * `Kamera` slotuna dusmesini saglar — Turkce'de tamlamanin BASI konuyu verir.
 */
function axisSimilarity(a, b) {
  const ta = axisTokens(a);
  const tb = axisTokens(b);
  if (!ta.length || !tb.length) return 0;
  const cover = ta.filter((t) => axisTokenHit(t, tb)).length / ta.length;
  const back = tb.filter((t) => axisTokenHit(t, ta)).length / tb.length;
  const head = (ta[0] && tb[0] && axisTokenHit(ta[0], [tb[0]])) ? 0.15 : 0;
  return Math.min(1, cover * 0.7 + back * 0.3 + head);
}

/**
 * Eksen slotlari ile satirlari EN IYI CIFTTEN baslayarak eslestirir.
 * Slot-slot ilerleyen aç gözlü eşleştirme ilk slotun en iyi adayi calmasina
 * yol aciyordu ("Performans" slotu "Kamera Performansi"ni aliyordu).
 * @returns Map<slotIndex, rowIndex>
 */
function axisGreedyPairs(axis, rows, threshold = 0.5) {
  const pairs = [];
  axis.forEach((slot, si) => {
    rows.forEach((row, ri) => {
      const s = axisSimilarity(slot.label, row.label);
      if (s >= threshold) pairs.push({ si, ri, s });
    });
  });
  pairs.sort((x, y) => y.s - x.s || x.si - y.si);
  const bySlot = new Map();
  const takenRow = new Set();
  pairs.forEach((p) => {
    if (bySlot.has(p.si) || takenRow.has(p.ri)) return;
    bySlot.set(p.si, p.ri);
    takenRow.add(p.ri);
  });
  return bySlot;
}

/**
 * Modelin donderdigi faktorleri ORTAK eksene oturtur.
 *
 * · Once birebir/benzer etiket eslestirilir (esik 0.5).
 * · Eslesmeyen slot ATLANIR — 0 YAZILMAZ. Sifir "bu urun bu konuda kotu"
 *   demektir ve tam da duzeltmeye calistigimiz yalani uretir.
 * · Eksene hic uymayan ekstra faktorler SONA `offAxis` isaretiyle eklenir
 *   (bilgi kaybi olmasin); isi matrisi yalnizca ortak satirlari cizer.
 */
function alignFactorsToAxis(factors, axis) {
  const rows = (Array.isArray(factors) ? factors : []).filter((f) => f && f.label);
  if (!Array.isArray(axis) || !axis.length) return rows;
  const bySlot = axisGreedyPairs(axis, rows);
  const used = new Set(bySlot.values());
  const out = [];
  axis.forEach((slot, si) => {
    if (!bySlot.has(si)) return;
    const f = rows[bySlot.get(si)];
    out.push({
      label: slot.label,
      emoji: f.emoji || slot.emoji,
      score: Math.max(0, Math.min(100, Math.round(Number(f.score) || 0))),
      detail: String(f.detail || ''),
    });
  });
  rows.forEach((f, i) => {
    if (used.has(i)) return;
    out.push({
      label: String(f.label),
      emoji: f.emoji || '📊',
      score: Math.max(0, Math.min(100, Math.round(Number(f.score) || 0))),
      detail: String(f.detail || ''),
      offAxis: true,
    });
  });
  return out;
}

/** Hukum cagrisinin donderdigi factorMatrix'i ayni eksene oturtur. */
function alignFactorMatrixToAxis(matrix, axis, names) {
  const rows = (Array.isArray(matrix) ? matrix : []).filter((r) => r && r.label);
  if (!rows.length) return rows;
  const wanted = (Array.isArray(names) ? names : []).filter(Boolean);
  const normName = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const fix = (row) => ({
    label: row.label,
    scores: (Array.isArray(row.scores) ? row.scores : [])
      .map((s) => ({ name: s && s.name, score: Math.max(0, Math.min(100, Math.round(Number(s && s.score) || 0))) }))
      .filter((s) => s.name),
  });
  const slots = Array.isArray(axis) ? axis : [];
  const bySlot = axisGreedyPairs(slots, rows);
  const seen = new Set(bySlot.values());
  const out = [];
  slots.forEach((slot, si) => {
    if (!bySlot.has(si)) return;
    const fixed = fix(rows[bySlot.get(si)]);
    fixed.label = slot.label;
    out.push(fixed);
  });
  rows.forEach((r, i) => { if (!seen.has(i)) out.push(fix(r)); });
  // Her satir HER urunu tasimali; eksik kalan satir yarim tablo demektir.
  return wanted.length
    ? out.filter((r) => wanted.every((n) => r.scores.some((s) => normName(s.name) === normName(n))))
    : out;
}

/** Prompt'a yazilan eksen sozlesmesi — hem urun hem hukum cagrisi kullanir. */
function factorAxisContract(axis) {
  const rows = (Array.isArray(axis) ? axis : []);
  if (!rows.length) return '';
  return (
    'SHARED FACTOR AXIS (mandatory). Every compared product is scored on the SAME '
    + rows.length + ' factors, in THIS exact order, with THESE exact labels:\n'
    + rows.map((s, i) => (i + 1) + '. ' + s.label).join('\n') + '\n'
    + '- Do NOT rename, translate differently, merge, split, reorder, add or drop a factor. '
    + 'The comparison table places these labels side by side; a renamed label lands in a '
    + 'different row and the product reads as scoring zero there.\n'
    + '- Every one of the ' + rows.length + ' factors MUST carry a real 0-100 score. Never omit one, '
    + 'never write 0 as a placeholder for "not measured".\n'
    // MUTLAK TABAN DAYATMA YOK. Ilk surumde "en az 2 faktor 65'in altinda"
    // yaziyordu; amiral gemisi karsilastirmasinda bu, olmayan bir zaafi
    // UYDURMAK demek — kullanicinin "sacma sapan puanlama" dedigi seyin ta
    // kendisi. Istenen sey mutlak dusuk puan degil AYRISMA.
    + '- ANTI-INFLATION: the eight scores must SPREAD. Highest minus lowest must be at least 25 '
    + 'points; a flat 85-95 profile is a reporting failure, not a compliment. Find the genuinely '
    + 'weakest of the eight for THIS buyer and score it honestly instead of inventing a fault that '
    + 'does not exist. Reserve 90+ for a real class leader.\n'
    + '- Every factor score must be defensible from the specs, the quiz answers or the research '
    + 'notes. If the evidence for a factor is thin, say so in its detail and keep the score mid-range '
    + 'rather than guessing high.\n'
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
    `${modelIdentityGate(products, lang)}\n\n` +
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
    `${factorAxisContract(compareFactorAxis(products, lang))}\n` +
    `Rules:\n- Include one products[] entry for EVERY product (${n} total). Names must match exactly.\n- First evaluate products separately; only then decide the final winner.\n- Each product must be scored on the SHARED FACTOR AXIS above (same labels, same order) and include ${v.featN} feature matches so the UI can render charts and spec-fit grids.\n- Write concrete professional prose, not generic summaries. Mention exact specs, compatibility, availability uncertainty, buyer profile, and trade-offs.\n- Stay within the requested paragraph/item counts so the JSON object is COMPLETE and valid for all ${n} products — never truncate mid-object.\n- Scores must be realistic, varied and based on quiz answers, profile signals, catalog specs and research notes.\n- Cite uncertainty instead of inventing live prices, review counts or quotes.\n\n` +
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
  // ORTAK EKSEN. Cagiran genelde eksen verir (butun urunler icin BIR kez
  // hesaplanir); vermediyse bu urunun kategorisinden turetilir — o durumda
  // bile ayni kategorideki iki urun ayni ekseni alir.
  const axis = Array.isArray(context.factorAxis) && context.factorAxis.length
    ? context.factorAxis
    : compareFactorAxis([product], lang);
  const axisSchema = axis
    .map((s) => `{"label": "${s.label}", "emoji": "${s.emoji}", "score": <0-100>, "detail": "2 evidence-based sentences"}`)
    .join(', ');
  const prof = Object.entries(profile).filter(([, val]) => val != null && val !== '' && (!Array.isArray(val) || val.length))
    .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(', ') : JSON.stringify(val)}`).slice(0, 18).join('; ');
  return (
    `You are Qor AI's senior product analyst. Produce ONE product's section of a multi-product comparison report. Evaluate ONLY "${name}" by ${brand || 'unknown'} (category: ${category}), but judge it in the CONTEXT of being compared against: ${peers.join(', ') || 'the other selected products'}.\n\n` +
    `${languageGate(lang)}\n\n${freshnessRules()}\n\n` +
    `${factorAxisContract(axis)}\n` +
    'Use catalog specs and quiz answers as verified inputs; use research notes only when they support a claim. Write like a professional buyer lab report: concrete, decisive, detailed. Never invent direct quotes, exact review counts, or exact live prices.\n\n' +
    'Return ONLY one valid JSON object for THIS product with this exact structure:\n' +
    '{\n' +
    '  "name": "exact product name",\n' +
    '  "matchScore": <0-100>,\n' +
    '  "decision": "buy|consider|skip",\n' +
    '  "confidence": <0-100>,\n' +
    '  "headline": "one decisive sentence",\n' +
    '  "matchComment": "5-6 detailed sentences on fit, trade-offs and who should care, relative to the other compared products",\n' +
    `  "factors": [${axisSchema}],\n` +
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
    `Rules:\n- factors: EXACTLY the ${axis.length} shared-axis entries listed above, same labels, same order. 8-10 feature matches so the UI can render spec-fit grids.\n- Include 4-6 criticalPoints, 4-6 quizInsights tied to the ACTUAL quiz answers below (impact negative when an answer works against this product), and 4-6 community.themes with varied sentiment.\n- Scores realistic and varied, based on quiz answers, profile signals, catalog specs and research notes.\n- Stay within the requested counts so the JSON object is COMPLETE and valid — never truncate mid-object.\n- Cite uncertainty instead of inventing live prices, review counts or quotes.\n\n` +
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
  const axis = Array.isArray(context.factorAxis) && context.factorAxis.length
    ? context.factorAxis
    : compareFactorAxis(products, lang);
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
    // ONCEDEN DUZ NESIRDI ("headToHead": 5-7 paragraf) ve okunmuyordu.
    // Olculdu 2026-08-30 (canli S26/iPhone/Xiaomi kaydi): metin urun urun
    // yazilmiyor — her paragraf iki-uc urunu birden konusuyor ve cumleler
    // birbirine bagli ("on the other hand", "however"). Site tarafi o metni
    // urun basliklarina bolmeye calisinca YANLIS ATIF uretti: iPhone
    // basliginin altindaki ilk paragraf Samsung'u anlatiyordu. Nesre olmayan
    // bir yapi dayatilamaz; yapi BURADA, uretim aninda istenir.
    '  "headToHeadByProduct": [{"name": "exact product name", "case": "2-3 sentences on what genuinely argues FOR this product against the others", "against": "1-2 sentences on what argues AGAINST it"}],\n' +
    '  "recommendation": "4-5 substantial paragraphs explaining which one to buy and why"\n' +
    '}\n\n' +
    `${factorAxisContract(axis)}\n` +
    `Rules:\n- chart must include EVERY product (${names.length} total) by exact name.\n- factorMatrix: EXACTLY the ${axis.length} shared-axis factors above, in that order, each scored for EVERY product by exact name (${names.length} entries per row, no product missing).\n- headToHeadByProduct: one entry per product (${names.length} total), names EXACTLY as listed. Each entry is about THAT product only — never open an entry with a sentence about the previous product and never carry a thought across entries. The reader sees these as separate, headed blocks.\n- winner MUST be one of the listed names exactly.\n- Be decisive and concrete; ground it in the per-product summaries, quiz answers and research.\n`
    /* TEK OLGU, TEK BOLUM. Olculdu 2026-08-30: ayni olgu ("asiri isinma ->
       throttling -> batarya yipranmasi") tek sayfada BES kez geciyordu —
       decisiveDifferences'ta iki madde, headToHead'de bir paragraf,
       recommendation'da iki paragraf. Okunma olasiligini dusuren sey uzunluk
       degil TEKRAR: okuyucu ayni cumleyi ikinci kez gorunce gerisini atliyor.
       Ayni sinir urun raporunda VAR (ONE FACT, ONE PLACE), hukum cagrisinda
       yoktu. */
    + '- ONE FACT, ONE SECTION. The three prose blocks answer DIFFERENT questions and must not repeat each other:\n'
    + '  · decisiveDifferences = the head-to-head FACTS that separate the products (specs, measured behaviour).\n'
    + '  · headToHeadByProduct = what each product is LIKE to live with, on its own terms.\n'
    + '  · recommendation = the DECISION and who each product is for — it may name a fact once to justify the call, never to re-explain it.\n'
    + '  Before writing an item, check whether another block already carries it; if it does, drop it or write the genuinely different angle. Repeating one fact across all three is the most common failure here.\n'
    + '- Stay within the counts so the JSON is COMPLETE and valid.\n\n' +
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
    // Arastirmanin dili cevabin diline BAGLI DEGIL — bkz. researchSourceGate().
    // Bu satir olmadan Turkce kosan her arastirma yalnizca Turkce kaynak
    // tariyordu ve telefon disindaki kategorilerde eli bos donuyordu.
    'Issue your search queries in whichever language holds the evidence (English first, then Turkish, then the local market language); '
    + 'the reply language does not restrict which sources you may read. ' +
    `Reply in ${langName(lang)}. Summarize evidence, source types, current market status, and uncertainty. ` +
    'Do not invent quotes, exact prices, or review counts.'
  );
}

/* ── 9) YAYIN META'SI ──────────────────────────────────────────────────────
   Yayinlanan analizin BASLIGI, OZETI, meta etiketleri ve SSS'i. Iki dil TEK
   cagrida uretilir; ayni dilde iki analizin ayni meta'yi tasimamasi icin
   `usedTitles` / `usedDescriptions` yasakli liste olarak gonderilir. */
/* Karsilastirma konusu "A vs B vs C" bicimindedir (bkz. admin/js/analyses.js
   -> runKonu). Hem prompt hem yayin kapisi ayni ayristirmayi kullanir. */
function compareSubjects(subject) {
  return String(subject || '').split(/\s+vs\s+/i).map((x) => x.trim()).filter(Boolean);
}

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
      /* "or say X vs Y" BOSLUGU URUN DUSURUYORDU. Olculdu 2026-08-31,
         canli kayit (uc telefon): title_tr "Samsung S26 Ultra mi iPhone 17
         Pro Max mi?" — Xiaomi 17 Ultra ne baslikta, ne meta baslikta, ne de
         ozette geciyordu. Model iki urunle "X vs Y" kalibini saglamis
         sayiyordu. Artik urun SAYISI ve adlarin TAMAMI prompt'ta yaziyor. */
      ? `- THIS IS A COMPARISON OF ${compareSubjects(subject).length} PRODUCTS: `
        + `${compareSubjects(subject).join(' | ')}\n`
        + '- title, metaTitle AND lead must name EVERY ONE of those products. Naming only '
        + 'some of them is WRONG: a reader who owns the omitted product will never find '
        + 'this page, and the page claims to compare something it does not mention. '
        + 'Shorten a name if you must, but never drop one.\n'
        + '- The title must also state WHICH ONE WINS and for whom. The lead gives the '
        + 'verdict in one sentence: which product, for which buyer, on what evidence.\n'
        + '- FAQ questions must be comparison questions, never single-product questions.\n'
      : '') +
    '- NEVER PUT A SCORE NUMBER IN title, lead, metaTitle OR metaDescription ("%88 skorla", "scores 88/100"). The published score is computed from the report separately, so a figure baked into the title goes stale the moment the scoring changes — this already happened and had to be rewritten at read time. Say the verdict in words.\n' +
    '- title: the on-page H1. Max 70 characters. Must name the subject and say what the page decides, not just what it is. Never a bare product name.\n' +
    '- lead: 1-2 sentences, max 200 characters, the answer a reader came for. No marketing wording, no "in this article".\n' +
    '- metaTitle: max 60 characters INCLUDING spaces. Different wording from `title` — not a truncation of it.\n' +
    '- metaDescription: 140-155 characters — COUNT THEM. Olculdu: model surekli 126-132 yaziyor ve arama sonucunda satirin sonu bos kaliyor. If your draft is under 140, add a concrete detail from the report (a number, a verdict word, who it suits) until it fits the range; do not pad with filler. Must contain one concrete number or verdict word from the report so it cannot be confused with another page.\n' +
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
  cleanProductForPrompt, languageGate, researchSourceGate, chronicResearchGate,
  // model kimlik kapisi — kardes varyant sizintisi
  modelIdentityGate, scrubSiblingResearch, crossModelLeaks,
  withModelIdentityRetryInstruction, siblingModelNames, variantMarkersIn,
  siblingDetectParts, sentenceIsSiblingOnly,
  quizLines, promptContext,
  // alternatif segment kapisi + katalog eslestirme
  segmentPriceUSD, peerFilterExpr, peerModelKey, rankPeerCandidates, segmentGate,
  pickCatalogMatch, resolveCatalogAlternatives,
  // rapor metninden urun kodu temizligi
  cleanProductCodes,
  lockScoresToBase,
  PARAGRAF_SINIFLANDIRICI,
  proseBlocks,
  // puan kalibrasyonu + segment kunyesi
  calibratedScore, segmentTier, scoreBasisNote, scoreScaleGate,
  SCORE_TECH_WEIGHT, SCORE_AI_WEIGHT,
  // rapor promptlari
  buildDeepPrompt, buildAltPrompt, buildAdvisorPrompt, buildPredictionPrompt,
  buildForumPrompt, buildProductResearchPrompt, buildCompareResearchPrompt,
  buildFullPrompt, buildComparePrompt, buildCompareProductPrompt,
  buildCompareVerdictPrompt,
  // karsilastirma faktor ekseni — butun urunler AYNI 8 faktorde puanlanir
  compareFactorAxis, compareAxisFamily, alignFactorsToAxis, alignFactorMatrixToAxis,
  factorAxisContract, axisSimilarity,
  // yayin metasi
  groundedResearchSystemPrompt, buildPublishMetaPrompt, compareSubjects,
  // ayristirma
  parseAiJson,
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
