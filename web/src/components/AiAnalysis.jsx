// ─────────────────────────────────────────────────────────────────────────
//  AI analysis — web port of the mobile app's premium AI cards.
//  Same prompts (structured JSON) + same visuals: animated score ring,
//  strength/weakness bars, pros/cons cards, verdict, smart alternatives,
//  advisor and price prediction. Shared by the product detail + compare pages.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AiAnalysis.css';
import ProductImg from './ProductImg.jsx';
import { productPath } from '../lib/routes';
import { displayProductName, cleanProductName } from '../lib/productNames';

const LANG_NAME = { tr: 'Turkish', en: 'English', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian' };
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

export function hasStaleAvailabilityClaims(raw) {
  const text = String(raw || '');
  return STALE_AVAILABILITY_PATTERNS.some((re) => re.test(text));
}

export function withFreshnessRetryInstruction(prompt, productNames = []) {
  const names = (Array.isArray(productNames) ? productNames : [productNames])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ');
  return (
    `${prompt}\n\nQUALITY GATE RETRY:\n` +
    'The previous answer was rejected because it contained stale release/availability claims. Rewrite the JSON from scratch.\n' +
    (names ? `Products that must keep exact names: ${names}\n` : '') +
    freshnessRules() +
    '\nForbidden stale wording includes: unannounced, not on the market, not released, not yet available, based on M4 Max estimates, or equivalent Turkish/German wording unless current web research explicitly proves it.'
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

function localizeAiText(value, L) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase();
  const exact = {
    'quiz answers': L('quiz answers', 'quiz cevapları', 'Quiz-Antworten'),
    'qor catalog specs': L('Qor catalog specs', 'Qor katalog özellikleri', 'Qor-Katalogdaten'),
    'community/review research': L('community/review research', 'topluluk ve yorum araştırması', 'Community- und Review-Recherche'),
    'similar products': L('similar products', 'benzer ürünler', 'ähnliche Produkte'),
    'reddit': 'Reddit',
    'youtube reviews': L('YouTube reviews', 'YouTube incelemeleri', 'YouTube-Reviews'),
    'retailer reviews': L('retailer reviews', 'mağaza yorumları', 'Händlerbewertungen'),
    'specialist sources': L('specialist sources', 'uzman kaynaklar', 'Fachquellen'),
    'source types': L('source types', 'kaynak türleri', 'Quellentypen'),
    buy: L('buy', 'satın al', 'kaufen'),
    wait: L('wait', 'bekle', 'warten'),
    watch: L('watch', 'takip et', 'beobachten'),
  };
  return exact[key] || cleanProductName(raw);
}

function localizedAiList(items, L) {
  return arr(items).map((x) => localizeAiText(x, L));
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
export function buildDeepPrompt(p, lang) {
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
export function buildAltPrompt(p, lang) {
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
export function buildAdvisorPrompt(p, lang, profile = {}) {
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
export function buildPredictionPrompt(p, lang) {
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
export function buildForumPrompt(p, lang) {
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

export function buildProductResearchPrompt(p, lang, context = {}) {
  const { name, brand, category, score, price, ks } = productLine(p, lang);
  return (
    `Research the product "${name}" by ${brand || 'unknown'} for a Qor AI purchase report.\n` +
    `Category: ${category || '-'}\nTech score in catalog: ${score}/100\nApprox catalog price: ${price}\nCatalog specs: ${ks || '-'}\n\n` +
    `MARKET STATUS CONTEXT:\n${availabilityContextForProduct(p)}\n\n` +
    `${freshnessRules()}\n${languageGate(lang)}\n\n` +
    'Use current web search. Focus on official spec pages, current retailer/store pages, public ownership/review sentiment from Reddit, YouTube reviews, large retailer reviews, specialist review sites, and recent market/price-cycle signals. ' +
    'First determine whether the product is announced/released/available today, then summarize ownership evidence. Do not invent direct quotes, exact review counts, or exact current prices. If evidence is weak, say so clearly.\n\n' +
    `Product-specific quiz answers:\n${quizLines(context.quizAnswers)}\n\n` +
    `Reply in ${langName(lang)} with concise research notes only; no JSON is required.`
  );
}

export function buildCompareResearchPrompt(products, lang, context = {}) {
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
export function buildFullPrompt(p, lang, profile = {}, context = {}) {
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
    '    "matchComment": "5-7 detailed sentences explaining quiz/profile fit, trade-offs, and who should care",\n' +
    '    "reviewedInputs": ["<input/source label in requested language>", "<input/source label in requested language>"],\n' +
    '    "factors": [{"label": "Usage fit", "score": <0-100>, "detail": "2 detailed sentences with evidence"}],\n' +
    '    "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 detailed sentences with evidence"}],\n' +
    '    "analysis": "8-11 substantial paragraphs, each 45-85 words: technical overview, performance/quality, compatibility, longevity, risks, buying advice; merge AI product advisor here",\n' +
    '    "strengths": ["6 detailed strengths grounded in specs"],\n' +
    '    "weaknesses": ["5 detailed weaknesses or caveats"]\n' +
    '  },\n' +
    '  "community": {\n' +
    '    "satisfaction": <0-100>,\n' +
    '    "summary": "5-7 substantial paragraphs synthesizing Reddit, YouTube, retailer reviews, forums, and specialist reviews; include uncertainty where needed",\n' +
    '    "pros": ["6 recurring positive themes"],\n' +
    '    "cons": ["5 recurring negative themes"],\n' +
    '    "sources": ["Reddit", "<source type in requested language>", "<source type in requested language>"],\n' +
    '    "verificationNotes": ["what is directly grounded", "what remains uncertain"]\n' +
    '  },\n' +
    '  "alternatives": [\n' +
    '    {"name": "product name", "imageUrl": "copy from Qor catalog context when available, otherwise empty", "url": "copy from Qor catalog context when available, otherwise empty", "source": "qor_catalog|external", "keySpecs": [{"label": "spec", "value": "value"}], "difference": "2-3 sentences vs target", "shortComment": "1-2 sentence recommendation"}\n' +
    '  ],\n' +
    '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "specific month/season/window", "buyOrWait": "buy|wait|watch", "drivers": ["5 concrete drivers"], "analysis": "5-7 substantial paragraphs with researched reasoning and caveats"}\n' +
    '}\n\n' +
    'Rules:\n' +
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
export function buildComparePrompt(products, lang, profile = {}, context = {}) {
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
    `    {"name": "exact product name", "imageUrl": "copy from product context", "url": "copy from product context", "matchScore": <0-100>, "matchComment": "${v.matchSent} detailed sentences", "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}], "featureMatches": [{"label": "feature/spec", "productValue": "value", "userNeed": "need", "score": <0-100>, "comment": "2 evidence-based sentences"}], "analysis": "${v.analysisPara} substantial paragraphs, each 45-85 words", "pros": ["${v.prosN} detailed pros"], "cons": ["${v.consN} detailed cons"], "community": {"satisfaction": <0-100>, "summary": "${v.commPara} substantial paragraphs", "pros": ["themes"], "cons": ["themes"], "sources": ["source types"]}, "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "${v.fcPara} substantial paragraphs"}}\n` +
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
export function buildCompareProductPrompt(product, lang, profile = {}, context = {}) {
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
    '  "matchComment": "5-6 detailed sentences on fit, trade-offs and who should care, relative to the other compared products",\n' +
    '  "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}],\n' +
    '  "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 evidence-based sentences"}],\n' +
    '  "analysis": "5-7 substantial paragraphs, each 45-85 words",\n' +
    '  "pros": ["6 detailed pros"],\n' +
    '  "cons": ["5 detailed cons"],\n' +
    '  "community": {"satisfaction": <0-100>, "summary": "3-4 substantial paragraphs", "pros": ["themes"], "cons": ["themes"], "sources": ["source types"]},\n' +
    '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "2-3 substantial paragraphs"}\n' +
    '}\n\n' +
    'Rules:\n- Include 8-10 factor scores and 8-10 feature matches so the UI can render charts and spec-fit grids.\n- Scores realistic and varied, based on quiz answers, profile signals, catalog specs and research notes.\n- Stay within the requested counts so the JSON object is COMPLETE and valid — never truncate mid-object.\n- Cite uncertainty instead of inventing live prices, review counts or quotes.\n\n' +
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
export function buildCompareVerdictPrompt(products, reports = [], lang, profile = {}, context = {}) {
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
export function parseAiJson(raw) {
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
const toInt = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
const toNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : []);
// First N sentences of a longer text — used for the compact per-product summary
// on the compare columns (the full text lives in the detail modal).
function firstSentences(text, n = 2) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, n).join(' ') : raw;
}

// ─── Shared visual atoms ────────────────────────────────────────────────────
function scoreColor(n) { return n >= 80 ? '#22c55e' : n >= 60 ? '#f59e0b' : '#f43f5e'; }

function ScoreRing({ value, max = 100, suffix = '/ 100' }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = v / max;
  const col = scoreColor((v / max) * 100);
  const R = 44, C = 2 * Math.PI * R;
  return (
    <div className="ai-ring">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeOpacity="0.14" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="ai-ring-t" style={{ color: col }}>
        <b>{Math.round(v)}</b><small>{suffix}</small>
      </div>
    </div>
  );
}

function AttrBar({ name, score, detail, color }) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="ai-attr">
      <div className="ai-attr-top">
        <span className="ai-attr-name">{name}</span>
        <span className="ai-attr-score" style={{ color }}>{v}</span>
      </div>
      <div className="ai-attr-track" style={{ background: `${color}1f` }}>
        <i style={{ width: `${v}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
      </div>
      {detail ? <small className="ai-attr-detail">{detail}</small> : null}
    </div>
  );
}

function ProCon({ icon, title, items, color }) {
  if (!items.length) return null;
  return (
    <div className="ai-procon" style={{ borderColor: `${color}33`, background: `${color}0d` }}>
      <h5 style={{ color }}>{icon} {title}</h5>
      <ul>{items.map((x, i) => <li key={i}><span style={{ color }}>{icon === '✓' ? '✓' : '•'}</span>{x}</li>)}</ul>
    </div>
  );
}

function SectionLabel({ icon, label, color }) {
  return <div className="ai-seclabel" style={{ color }}>{icon} {label}</div>;
}

// ─── DEEP ANALYSIS ──────────────────────────────────────────────────────────
function DeepView({ data, L }) {
  const overall = toInt(data.overallScore);
  const strengths = arr(data.strengths).map((s) => ({ name: s.name || '', score: toInt(s.score), detail: s.detail || '' }));
  const weaknesses = arr(data.weaknesses).map((s) => ({ name: s.name || '', score: toInt(s.score), detail: s.detail || '' }));
  const pros = arr(data.pros).map(String);
  const cons = arr(data.cons).map(String);
  const verdict = String(data.verdict || '').trim();
  return (
    <div className="ai-deep">
      {overall > 0 && <div className="ai-center"><ScoreRing value={overall} /></div>}
      {strengths.length > 0 && (
        <>
          <SectionLabel icon="📈" label={L('Strengths', 'Güçlü Yönler', 'Stärken')} color="#22c55e" />
          {strengths.map((s, i) => <AttrBar key={i} {...s} color="#22c55e" />)}
        </>
      )}
      {weaknesses.length > 0 && (
        <>
          <SectionLabel icon="📉" label={L('Weaknesses', 'Zayıf Yönler', 'Schwächen')} color="#f43f5e" />
          {weaknesses.map((s, i) => <AttrBar key={i} {...s} color="#f43f5e" />)}
        </>
      )}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('Pros', 'Artılar', 'Pro')} items={pros} color="#22c55e" />
          <ProCon icon="✕" title={L('Cons', 'Eksiler', 'Contra')} items={cons} color="#f43f5e" />
        </div>
      )}
      {verdict && <div className="ai-verdict"><span>💡</span><p>{verdict}</p></div>}
    </div>
  );
}

// ─── SMART ALTERNATIVES ─────────────────────────────────────────────────────
function AltView({ data, L }) {
  const alts = arr(data.alternatives);
  if (!alts.length) return null;
  return (
    <div className="ai-alts">
      {alts.map((a, i) => (
        <div className="ai-alt" key={i}>
          <div className="ai-alt-name">{cleanProductName(a.name)}</div>
          {a.whyBetter && <div className="ai-alt-why">★ {a.whyBetter}</div>}
          <div className="ai-alt-grid">
            {a.advantage && <div className="ai-alt-cell ai-alt-adv"><b>{L('Advantage', 'Avantaj', 'Vorteil')}</b><span>{a.advantage}</span></div>}
            {a.tradeoff && <div className="ai-alt-cell ai-alt-trade"><b>{L('Trade-off', 'Dezavantaj', 'Nachteil')}</b><span>{a.tradeoff}</span></div>}
            {a.priceComparison && <div className="ai-alt-cell"><b>{L('Price', 'Fiyat', 'Preis')}</b><span>{a.priceComparison}</span></div>}
            {a.bestFor && <div className="ai-alt-cell"><b>{L('Best for', 'Kime uygun', 'Ideal für')}</b><span>{a.bestFor}</span></div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ADVISOR ────────────────────────────────────────────────────────────────
function AdvisorView({ data, L }) {
  const rating = toNum(data.valueRating);
  const buy = arr(data.reasonsToBuy).map(String);
  const skip = arr(data.reasonsToSkip).map(String);
  const tips = arr(data.proTips).map(String);
  return (
    <div className="ai-advisor">
      {rating > 0 && (
        <div className="ai-center"><ScoreRing value={rating} max={10} suffix="/ 10" /></div>
      )}
      {String(data.ratingExplanation || '').trim() && <p className="ai-advisor-exp">{data.ratingExplanation}</p>}
      {String(data.whoShouldBuy || '').trim() && (
        <div className="ai-advisor-box ai-good"><b>👍 {L('Who should buy', 'Kime uygun', 'Für wen geeignet')}</b><p>{data.whoShouldBuy}</p></div>
      )}
      {String(data.whoShouldAvoid || '').trim() && (
        <div className="ai-advisor-box ai-bad"><b>👎 {L('Who should avoid', 'Kime uygun değil', 'Für wen ungeeignet')}</b><p>{data.whoShouldAvoid}</p></div>
      )}
      {(buy.length > 0 || skip.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('Reasons to buy', 'Alma sebepleri', 'Gründe dafür')} items={buy} color="#22c55e" />
          <ProCon icon="✕" title={L('Reasons to skip', 'Almama sebepleri', 'Gründe dagegen')} items={skip} color="#f43f5e" />
        </div>
      )}
      {tips.length > 0 && (
        <div className="ai-tips"><b>💡 {L('Pro tips', 'İpuçları', 'Profi-Tipps')}</b><ul>{tips.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      )}
    </div>
  );
}

// ─── PRICE PREDICTION ───────────────────────────────────────────────────────
function PredictionView({ data, L }) {
  const trend = String(data.trend || 'stable').toLowerCase();
  const pct = toInt(data.trendPercentage);
  const buyWait = String(data.buyOrWait || 'buy').toLowerCase();
  const arrow = trend === 'down' ? '↓' : trend === 'up' ? '↑' : '→';
  const tColor = trend === 'down' ? '#22c55e' : trend === 'up' ? '#f43f5e' : '#f59e0b';
  return (
    <div className="ai-pred">
      <div className="ai-pred-head">
        <div className="ai-pred-trend" style={{ color: tColor }}>
          <span className="ai-pred-arrow">{arrow}</span>
          <div><b>{trend === 'down' ? L('Falling', 'Düşüyor', 'Fällt') : trend === 'up' ? L('Rising', 'Yükseliyor', 'Steigt') : L('Stable', 'Sabit', 'Stabil')}</b>{pct > 0 && <small>~{pct}%</small>}</div>
        </div>
        <div className={'ai-pred-verdict ' + (buyWait === 'wait' ? 'wait' : 'buy')}>
          {buyWait === 'wait' ? `⏳ ${L('Wait', 'Bekle', 'Warten')}` : `✓ ${L('Buy now', 'Şimdi al', 'Jetzt kaufen')}`}
        </div>
      </div>
      <div className="ai-pred-grid">
        {String(data.bestTimeToBuy || '').trim() && <div className="ai-pred-cell"><b>{L('Best time', 'En iyi zaman', 'Beste Zeit')}</b><span>{data.bestTimeToBuy}</span></div>}
        {String(data.expectedDrop || '').trim() && <div className="ai-pred-cell"><b>{L('Expected drop', 'Beklenen indirim', 'Erwarteter Rückgang')}</b><span>{data.expectedDrop}</span></div>}
      </div>
      {String(data.reasoning || '').trim() && <p className="ai-pred-reason">{data.reasoning}</p>}
    </div>
  );
}

// ─── COMPARE ────────────────────────────────────────────────────────────────
function CompareView({ data, L }) {
  const winner = cleanProductName(data.winner || '');
  const products = arr(data.products).map((p) => ({
    name: cleanProductName(p.name || ''), score: toInt(p.score), bestFor: p.bestFor || '',
    pros: arr(p.pros).map(String), cons: arr(p.cons).map(String),
  }));
  if (!products.length) return null;
  const max = Math.max(1, ...products.map((p) => p.score));
  return (
    <div className="ai-cmp">
      {winner && (
        <div className="ai-cmp-winner"><span>🏆</span><div><small>{L('AI pick', 'AI seçimi', 'KI-Wahl')}</small><b>{winner}</b></div></div>
      )}
      {String(data.verdict || '').trim() && <p className="ai-cmp-verdict">{data.verdict}</p>}
      <div className="ai-cmp-products">
        {products.map((p, i) => {
          const isWin = winner && p.name.toLowerCase() === winner.toLowerCase();
          const col = isWin ? '#22c55e' : '#3b82f6';
          return (
            <div className={'ai-cmp-prod' + (isWin ? ' win' : '')} key={i}>
              <div className="ai-cmp-prod-top">
                <span className="ai-cmp-prod-name">{isWin ? '★ ' : ''}{p.name}</span>
                <span className="ai-cmp-prod-score" style={{ color: col }}>{p.score}</span>
              </div>
              <div className="ai-attr-track" style={{ background: `${col}1f` }}>
                <i style={{ width: `${(p.score / max) * 100}%`, background: `linear-gradient(90deg, ${col}80, ${col})` }} />
              </div>
              {p.bestFor && <div className="ai-cmp-bestfor">{L('Best for', 'Kime uygun', 'Ideal für')}: <b>{p.bestFor}</b></div>}
              {(p.pros.length > 0 || p.cons.length > 0) && (
                <div className="ai-procon-row">
                  <ProCon icon="✓" title={L('Pros', 'Artılar', 'Pro')} items={p.pros} color="#22c55e" />
                  <ProCon icon="✕" title={L('Cons', 'Eksiler', 'Contra')} items={p.cons} color="#f43f5e" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {String(data.recommendation || '').trim() && (
        <div className="ai-verdict"><span>💡</span><p>{data.recommendation}</p></div>
      )}
    </div>
  );
}

// ─── FORUM / COMMUNITY SATISFACTION ─────────────────────────────────────────
function ForumView({ data, L }) {
  const sat = toInt(data.satisfaction);
  const praise = arr(data.praise).map(String);
  const complaints = arr(data.complaints).map(String);
  const sources = localizedAiList(data.sources, L);
  return (
    <div className="ai-forum">
      {sat > 0 && (
        <div className="ai-forum-gauge">
          <ScoreRing value={sat} suffix="%" />
          <div className="ai-forum-gauge-t">
            <b>{L('Community satisfaction', 'Topluluk memnuniyeti', 'Community-Zufriedenheit')}</b>
            <small>{L('Synthesised from public forums & reviews', 'Açık forum ve yorumlardan derlendi', 'Aus öffentlichen Foren & Reviews')}</small>
          </div>
        </div>
      )}
      {String(data.summary || '').trim() && <p className="ai-forum-summary">{data.summary}</p>}
      {(praise.length > 0 || complaints.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('People love', 'Beğenilenler', 'Beliebt')} items={praise} color="#22c55e" />
          <ProCon icon="✕" title={L('Common complaints', 'Şikayetler', 'Häufige Kritik')} items={complaints} color="#f43f5e" />
        </div>
      )}
      {sources.length > 0 && (
        <div className="ai-forum-sources">
          <small>{L('Sources', 'Kaynaklar', 'Quellen')}:</small>
          {sources.map((s, i) => <span key={i} className="ai-forum-src">{s}</span>)}
        </div>
      )}
      {String(data.verdict || '').trim() && <div className="ai-verdict"><span>👥</span><p>{data.verdict}</p></div>}
    </div>
  );
}

// ─── FULL REPORTS ──────────────────────────────────────────────────────────
function Paragraphs({ text }) {
  const raw = String(text || '').trim();
  let parts = raw
    .split(/\n{2,}/g)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    const sentences = raw
      .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/g)
      .map((x) => x.trim())
      .filter(Boolean);
    parts = [];
    for (let i = 0; i < sentences.length; i += 2) {
      parts.push(sentences.slice(i, i + 2).join(' '));
    }
  }
  if (!parts.length) return null;
  return <div className="ai-report-prose">{parts.map((p, i) => <p key={i}>{p}</p>)}</div>;
}

function BulletList({ items, tone = 'neutral' }) {
  const list = arr(items).map(String);
  if (!list.length) return null;
  return (
    <ul className={'ai-report-list ' + tone}>
      {list.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function ReportSection({ eyebrow, title, children }) {
  if (!children) return null;
  return (
    <section className="ai-report-section">
      {eyebrow && <div className="ai-report-eyebrow">{eyebrow}</div>}
      {title && <h4>{title}</h4>}
      {children}
    </section>
  );
}

function ReportFactors({ factors = [], L }) {
  const list = arr(factors).map((f) => ({
    label: f.label || f.name || '',
    score: toInt(f.score),
    detail: f.detail || '',
  })).filter((f) => f.label);
  if (!list.length) return null;
  return (
    <div className="ai-report-factors">
      {list.map((f, i) => {
        const color = scoreColor(f.score);
        return <AttrBar key={`${f.label}-${i}`} name={f.label} score={f.score} detail={f.detail} color={color} />;
      })}
      <small className="ai-report-hint">{L('Scores combine quiz answers, profile signals and catalog specs.', 'Puanlar quiz cevapları, profil sinyalleri ve katalog özellikleriyle hesaplandı.', 'Die Werte kombinieren Quizantworten, Profilsignale und Katalogdaten.')}</small>
    </div>
  );
}

function FeatureMatches({ items = [], L }) {
  const list = arr(items).map((x) => ({
    label: x.label || x.name || '',
    productValue: x.productValue || x.value || '',
    userNeed: x.userNeed || x.need || '',
    score: toInt(x.score),
    comment: x.comment || x.detail || '',
  })).filter((x) => x.label || x.productValue || x.comment);
  if (!list.length) return null;
  return (
    <div className="ai-feature-grid">
      {list.map((x, i) => {
        const color = scoreColor(x.score || 60);
        return (
          <article className="ai-feature-card" key={`${x.label}-${i}`}>
            <div className="ai-feature-top">
              <b>{x.label || L('Feature match', 'Özellik eşleşmesi', 'Merkmalsfit')}</b>
              {x.score > 0 && <span style={{ color }}>{x.score}</span>}
            </div>
            {x.productValue && <div className="ai-feature-kv"><small>{L('Product', 'Ürün', 'Produkt')}</small><strong>{x.productValue}</strong></div>}
            {x.userNeed && <div className="ai-feature-kv"><small>{L('Need', 'İhtiyaç', 'Bedarf')}</small><strong>{x.userNeed}</strong></div>}
            {x.comment && <p>{x.comment}</p>}
          </article>
        );
      })}
    </div>
  );
}

function CommunityBlock({ data = {}, L }) {
  if (!data || typeof data !== 'object') return null;
  const sat = toInt(data.satisfaction);
  const sources = localizedAiList(data.sources, L);
  const notes = arr(data.verificationNotes).map(String);
  return (
    <div className="ai-community-full">
      <div className="ai-community-head">
        {sat > 0 && <ScoreRing value={sat} suffix="%" />}
        <div>
          <b>{L('Internet satisfaction', 'İnternet memnuniyet oranı', 'Internet-Zufriedenheit')}</b>
          <span>{L('Reddit, YouTube, retailer reviews and specialist sources are synthesized together.', 'Reddit, YouTube, alışveriş yorumları ve uzman kaynaklar birlikte özetlenir.', 'Reddit, YouTube, Händlerbewertungen und Fachquellen werden zusammengefasst.')}</span>
        </div>
      </div>
      <Paragraphs text={data.summary} />
      <div className="ai-procon-row">
        <ProCon icon="✓" title={L('Common positives', 'Öne çıkan artılar', 'Häufige Pluspunkte')} items={arr(data.pros).map(String)} color="#22c55e" />
        <ProCon icon="✕" title={L('Common negatives', 'Öne çıkan eksiler', 'Häufige Kritik')} items={arr(data.cons).map(String)} color="#f43f5e" />
      </div>
      {sources.length > 0 && (
        <div className="ai-source-row">
          <small>{L('Source types', 'Kaynak türleri', 'Quellentypen')}</small>
          {sources.map((s, i) => <span key={`${s}-${i}`}>{s}</span>)}
        </div>
      )}
      {notes.length > 0 && <BulletList items={notes} tone="notes" />}
    </div>
  );
}

function AlternativeCards({ alternatives = [], L }) {
  const list = arr(alternatives);
  if (!list.length) return null;
  return (
    <div className="ai-alt-cards">
      {list.map((a, i) => {
        const specs = arr(a.keySpecs);
        const content = (
          <article className="ai-alt-card">
            <div className="ai-alt-media">
              {a.imageUrl ? <ProductImg src={a.imageUrl} alt={cleanProductName(a.name || '')} size="thumb" /> : <span>{i + 1}</span>}
            </div>
            <div className="ai-alt-copy">
              <div className="ai-alt-card-top">
                <b>{cleanProductName(a.name)}</b>
                <small>{a.source === 'qor_catalog' ? L('Qor catalog', 'Qor kataloğu', 'Qor-Katalog') : L('External', 'Harici', 'Extern')}</small>
              </div>
              {a.shortComment && <p>{a.shortComment}</p>}
              {a.difference && <p className="ai-alt-diff">{a.difference}</p>}
              {specs.length > 0 && (
                <div className="ai-alt-specs">
                  {specs.slice(0, 4).map((s, j) => (
                    <span key={j}><small>{s.label}</small><b>{s.value}</b></span>
                  ))}
                </div>
              )}
            </div>
          </article>
        );
        return a.url ? <a key={`${a.name}-${i}`} href={a.url} className="ai-alt-link">{content}</a> : <div key={`${a.name}-${i}`}>{content}</div>;
      })}
    </div>
  );
}

function PriceForecastBlock({ data = {}, L }) {
  if (!data || typeof data !== 'object') return null;
  const trend = String(data.trend || 'stable').toLowerCase();
  const color = trend === 'down' ? '#22c55e' : trend === 'up' ? '#f43f5e' : '#f59e0b';
  const label = trend === 'down'
    ? L('Likely to fall', 'Düşme eğiliminde', 'Fällt wahrscheinlich')
    : trend === 'up'
      ? L('Likely to rise', 'Yükselme eğiliminde', 'Steigt wahrscheinlich')
      : L('Likely stable', 'Sabit kalabilir', 'Bleibt eher stabil');
  return (
    <div className="ai-price-full">
      <div className="ai-price-head">
        <div style={{ color }}>
          <b>{label}</b>
          {toInt(data.confidence) > 0 && <span>{L('Confidence', 'Güven', 'Sicherheit')}: {toInt(data.confidence)}%</span>}
        </div>
        {data.buyOrWait && <strong>{localizeAiText(data.buyOrWait, L)}</strong>}
      </div>
      <div className="ai-price-grid">
        {data.expectedChange && <span><small>{L('Expected change', 'Beklenen değişim', 'Erwartete Änderung')}</small><b>{data.expectedChange}</b></span>}
        {data.bestTimeToBuy && <span><small>{L('Best time', 'En iyi zaman', 'Beste Zeit')}</small><b>{data.bestTimeToBuy}</b></span>}
      </div>
      <Paragraphs text={data.analysis || data.reasoning} />
      <BulletList items={data.drivers} tone="notes" />
    </div>
  );
}

function ProductFullReport({ data, L }) {
  const product = data.product || {};
  const match = toInt(product.matchScore || product.overallScore);
  return (
    <div className="ai-report">
      <ReportSection eyebrow="01" title={L('Match, advisor and deep analysis', 'Uyum, danışman ve derin analiz', 'Match, Beratung und Tiefenanalyse')}>
        <div className="ai-report-hero">
          {match > 0 && <ScoreRing value={match} />}
          <div>
            <h3>{cleanProductName(product.name || data.name || L('Product report', 'Ürün raporu', 'Produktbericht'))}</h3>
            <Paragraphs text={product.matchComment} />
          </div>
        </div>
        <ReportFactors factors={product.factors} L={L} />
        <FeatureMatches items={product.featureMatches} L={L} />
        <Paragraphs text={product.analysis} />
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('Strengths', 'Güçlü yönler', 'Stärken')} items={arr(product.strengths).map(String)} color="#22c55e" />
          <ProCon icon="✕" title={L('Weaknesses', 'Zayıf yönler', 'Schwächen')} items={arr(product.weaknesses).map(String)} color="#f43f5e" />
        </div>
        <BulletList items={localizedAiList(product.reviewedInputs, L)} tone="notes" />
      </ReportSection>

      <ReportSection eyebrow="02" title={L('Internet comments and satisfaction', 'İnternet yorumları ve memnuniyet', 'Internet-Kommentare und Zufriedenheit')}>
        <CommunityBlock data={data.community} L={L} />
      </ReportSection>

      <ReportSection eyebrow="03" title={L('Smart alternatives', 'Akıllı alternatifler', 'Intelligente Alternativen')}>
        <AlternativeCards alternatives={data.alternatives} L={L} />
      </ReportSection>

      <ReportSection eyebrow="04" title={L('Price forecast', 'Fiyat tahmini', 'Preisprognose')}>
        <PriceForecastBlock data={data.priceForecast} L={L} />
      </ReportSection>
    </div>
  );
}

function CompareScoreChartFull({ chart = [], L }) {
  const rows = arr(chart).map((x) => ({ name: cleanProductName(x.name || ''), score: toInt(x.score), reason: x.reason || '' })).filter((x) => x.name);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.score));
  return (
    <div className="ai-compare-chart">
      {rows.map((r, i) => {
        const color = scoreColor(r.score);
        return (
          <div className="ai-compare-chart-row" key={`${r.name}-${i}`}>
            <span>{r.name}</span>
            <div><i style={{ width: `${Math.max(4, (r.score / max) * 100)}%`, background: color }} /></div>
            <b style={{ color }}>{r.score}</b>
            {r.reason && <small>{r.reason}</small>}
          </div>
        );
      })}
      <small className="ai-report-hint">{L('Final scores are personalized to the comparison quiz.', 'Final puanlar karşılaştırma quizine göre kişiselleştirildi.', 'Endwerte sind auf das Vergleichsquiz personalisiert.')}</small>
    </div>
  );
}

function FactorMatrix({ rows = [] }) {
  const list = arr(rows).filter((x) => x?.label && Array.isArray(x.scores));
  if (!list.length) return null;
  return (
    <div className="ai-factor-matrix">
      {list.map((row, i) => (
        <div className="ai-factor-matrix-row" key={`${row.label}-${i}`}>
          <b>{row.label}</b>
          <div>
            {row.scores.map((s, j) => {
              const score = toInt(s.score);
              return <span key={`${s.name}-${j}`}><small>{cleanProductName(s.name)}</small><i style={{ width: `${Math.max(4, score)}%`, background: scoreColor(score) }} /><strong>{score}</strong></span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Compare report — the AI overall comparison is shown first, then one
// clickable evaluation column per product (aligned with the spec-table columns).
// Each column opens a full-screen modal with that product's complete review, so
// the long per-product report stays out of the way until the user asks for it.
function ComparisonOverview({ cmp = {}, L }) {
  const hasContent = cmp.winner || arr(cmp.chart).length || arr(cmp.factorMatrix).length
    || arr(cmp.decisiveDifferences).length || String(cmp.headToHead || '').trim()
    || String(cmp.recommendation || '').trim();
  if (!hasContent) return null;
  return (
    <section className="ai-report-section ai-cmp-overview">
      <div className="ai-report-eyebrow">{L('AI overall comparison', 'AI genel karşılaştırma', 'KI-Gesamtvergleich')}</div>
      <h4>{L('Which one wins for you', 'Senin için hangisi kazanıyor', 'Was für dich gewinnt')}</h4>
      {cmp.winner && (
        <div className="ai-cmp-winner">
          <span>★</span>
          <div><small>{L('Recommended pick', 'Önerilen seçim', 'Empfohlene Wahl')}</small><b>{cleanProductName(cmp.winner)}</b></div>
          {toInt(cmp.winnerScore) > 0 && <strong>{toInt(cmp.winnerScore)}</strong>}
        </div>
      )}
      <CompareScoreChartFull chart={cmp.chart} L={L} />
      <FactorMatrix rows={cmp.factorMatrix} />
      <BulletList items={cmp.decisiveDifferences} tone="notes" />
      <Paragraphs text={cmp.headToHead} />
      {String(cmp.recommendation || '').trim() && (
        <div className="ai-verdict"><span>✓</span><div><Paragraphs text={cmp.recommendation} /></div></div>
      )}
    </section>
  );
}

// One product's complete review — the same blocks the product-detail report
// uses, rendered inside the compare detail modal.
function CompareProductDetail({ data = {}, L }) {
  return (
    <div className="ai-report">
      <div className="ai-compare-product-head">
        {data.imageUrl && <ProductImg src={data.imageUrl} alt={cleanProductName(data.name || '')} size="thumb" />}
        <div>{toInt(data.matchScore) > 0 && <ScoreRing value={toInt(data.matchScore)} />}</div>
        <Paragraphs text={data.matchComment} />
      </div>
      <ReportFactors factors={data.factors} L={L} />
      <FeatureMatches items={data.featureMatches} L={L} />
      <Paragraphs text={data.analysis} />
      <div className="ai-procon-row">
        <ProCon icon="✓" title={L('Pros', 'Artılar', 'Pro')} items={arr(data.pros).map(String)} color="#22c55e" />
        <ProCon icon="✕" title={L('Cons', 'Eksiler', 'Contra')} items={arr(data.cons).map(String)} color="#f43f5e" />
      </div>
      <CommunityBlock data={data.community} L={L} />
      <PriceForecastBlock data={data.priceForecast} L={L} />
    </div>
  );
}

// Full-screen modal — portaled to <body> so a transformed/filtered ancestor
// can't collapse the fixed overlay (a known web-app pitfall). Holds one
// product's complete review; Esc / backdrop / ✕ all close it.
function CompareProductModal({ column, onClose, L }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  if (!column) return null;
  return createPortal(
    <div className="ai-cmp-modal-backdrop" onClick={onClose}>
      <div className="ai-cmp-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ai-cmp-modal-head">
          <div className="ai-cmp-modal-title">
            {column.image && <ProductImg src={column.image} alt={column.name} size="thumb" />}
            <div>
              <small>{L('Full AI review', 'Detaylı AI incelemesi', 'Vollständige KI-Analyse')}</small>
              <b>{column.name}</b>
            </div>
          </div>
          <button type="button" className="ai-cmp-modal-close" onClick={onClose} aria-label={L('Close', 'Kapat', 'Schließen')}>✕</button>
        </header>
        <div className="ai-cmp-modal-body">
          <CompareProductDetail data={column.ai} L={L} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CompareFullReport({ data, L, lang, products = [] }) {
  const aiProducts = arr(data.products);
  const cmp = data.comparison || {};
  const [openIdx, setOpenIdx] = useState(-1);

  const norm = (s) => cleanProductName(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim();
  // Align columns with the spec-table order: iterate the real products and pair
  // each with its AI entry by name (fallback to index) so column N here is the
  // same product as column N in the spec table. Without the real product list
  // (e.g. a history view) fall back to the AI products and their copied images.
  const columns = (products.length ? products : aiProducts).map((item, i) => {
    if (products.length) {
      const name = displayProductName(item, lang);
      const ai = aiProducts.find((ap) => norm(ap.name) === norm(name)) || aiProducts[i] || {};
      return { ai, image: item.imageUrl || ai.imageUrl || '', name, key: item.id || `${name}-${i}` };
    }
    const name = cleanProductName(item.name || '');
    return { ai: item, image: item.imageUrl || '', name, key: `${name}-${i}` };
  }).filter((c) => c.name || (c.ai && Object.keys(c.ai).length));

  const winnerNorm = norm(cmp.winner || '');
  const active = openIdx >= 0 && openIdx < columns.length ? columns[openIdx] : null;

  return (
    <div className="ai-report ai-report-compare">
      <ComparisonOverview cmp={cmp} L={L} />

      {columns.length > 0 && (
        <section className="ai-report-section ai-cmp-eval">
          <div className="ai-report-eyebrow">{L('Per-product analysis', 'Ürün ürün analiz', 'Analyse je Produkt')}</div>
          <h4>{L('Open each detailed review', 'Her ürünün detaylı incelemesini aç', 'Jede Detailanalyse öffnen')}</h4>
          <p className="ai-cmp-eval-hint">{L('Tap a product to open its full AI review in detail.', 'Tam AI incelemesini görmek için bir ürüne dokun.', 'Tippe ein Produkt für die vollständige KI-Analyse.')}</p>
          <div className="ai-cmp-cols" style={{ '--ai-cmp-n': columns.length }}>
            {columns.map((c, i) => {
              const score = toInt(c.ai.matchScore);
              const isWin = winnerNorm && norm(c.name) === winnerNorm;
              const summary = firstSentences(c.ai.matchComment, 2);
              return (
                <button type="button" className={'ai-cmp-col' + (isWin ? ' win' : '')} key={c.key} onClick={() => setOpenIdx(i)}>
                  {isWin && <span className="ai-cmp-col-badge">★ {L('AI pick', 'AI seçimi', 'KI-Wahl')}</span>}
                  <div className="ai-cmp-col-media">
                    {c.image ? <ProductImg src={c.image} alt={c.name} size="card" /> : <span>{i + 1}</span>}
                  </div>
                  <div className="ai-cmp-col-name">{c.name}</div>
                  {score > 0 && (
                    <div className="ai-cmp-col-score" style={{ color: scoreColor(score) }}>
                      {score}<small>/100</small>
                    </div>
                  )}
                  {summary && <p className="ai-cmp-col-sum">{summary}</p>}
                  <span className="ai-cmp-col-cta">{L('View full review', 'Detaylı incele', 'Vollständige Analyse')} →</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {active && <CompareProductModal column={active} onClose={() => setOpenIdx(-1)} L={L} />}
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────
// kind: 'deep' | 'alts' | 'advisor' | 'pred'. Returns null when JSON is unusable
// so the caller can fall back to plain text.
export default function AiAnalysisView({ kind, raw, data: dataProp, lang, products }) {
  const data = dataProp && typeof dataProp === 'object' ? dataProp : parseAiJson(raw);
  if (!data || typeof data !== 'object') return null;
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (en, tr, de) => (code === 'tr' ? tr : code === 'de' ? de : en);
  if (kind === 'productFull' || data.type === 'product_full_report') return <ProductFullReport data={data} L={L} />;
  if (kind === 'compareFull' || data.type === 'compare_full_report') return <CompareFullReport data={data} L={L} lang={lang} products={products} />;
  if (kind === 'deep') return <DeepView data={data} L={L} />;
  if (kind === 'alts') return <AltView data={data} L={L} />;
  if (kind === 'advisor') return <AdvisorView data={data} L={L} />;
  if (kind === 'pred') return <PredictionView data={data} L={L} />;
  if (kind === 'compare') return <CompareView data={data} L={L} />;
  if (kind === 'forum') return <ForumView data={data} L={L} />;
  return null;
}
