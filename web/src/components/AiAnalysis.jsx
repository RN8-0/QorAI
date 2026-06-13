// ─────────────────────────────────────────────────────────────────────────
//  AI analysis — web port of the mobile app's premium AI cards.
//  Same prompts (structured JSON) + same visuals: animated score ring,
//  strength/weakness bars, pros/cons cards, verdict, smart alternatives,
//  advisor and price prediction. Shared by the product detail + compare pages.
// ─────────────────────────────────────────────────────────────────────────
import './AiAnalysis.css';
import ProductImg from './ProductImg.jsx';
import { productPath } from '../lib/routes';

const LANG_NAME = { tr: 'Turkish', en: 'English', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian' };
function langName(lang) { return LANG_NAME[String(lang || 'en').slice(0, 2).toLowerCase()] || 'English'; }

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
  const name = p?.nameTranslated?.[String(lang).slice(0, 2)] || p?.name || '';
  return { name, brand: p?.brand || '', category: p?.category || '', score: p?.techScore || '-', price, ks };
}

function cleanProductForPrompt(p, lang) {
  const name = p?.nameTranslated?.[String(lang).slice(0, 2)] || p?.name || '';
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
    'Use current web search if available. Focus on public ownership/review sentiment from Reddit, YouTube reviews, large retailer reviews, specialist review sites, official spec pages, and recent market/price-cycle signals. ' +
    'Do not invent direct quotes, exact review counts, or exact current prices. If evidence is weak, say so clearly.\n\n' +
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
    'Use current web search if available. For each product, gather public sentiment from Reddit, YouTube, specialist reviews, retailer reviews, official spec pages, and price-cycle/availability signals. ' +
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
    `LANGUAGE: Every user-facing text field must be fully written in ${langName(lang)}. Keep official product/model names as-is.\n\n` +
    'CRITICAL OUTPUT ORDER: one single continuous report: match/advisor/deep analysis first, internet/community sentiment second, smart alternatives third, price forecast last.\n' +
    'Use catalog specs and quiz answers as verified inputs. Use research notes only when they support a claim; if something is not verified, say it is uncertain. Never invent direct quotes, exact review counts, or exact live prices.\n' +
    'Write like a professional buyer lab report: concrete, decisive, and detailed. Avoid generic praise. Mention exact catalog specs, compatibility constraints, who benefits, who should avoid it, and why.\n\n' +
    'Return ONLY one valid JSON object with this exact structure:\n' +
    '{\n' +
    '  "type": "product_full_report",\n' +
    '  "product": {\n' +
    '    "name": "exact product name",\n' +
    '    "matchScore": <0-100>,\n' +
    '    "matchComment": "5-7 detailed sentences explaining quiz/profile fit, trade-offs, and who should care",\n' +
    '    "reviewedInputs": ["quiz answers", "Qor catalog specs", "community/review research", "similar products"],\n' +
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
    '    "sources": ["Reddit", "YouTube reviews", "retailer reviews"],\n' +
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
  return (
    'You are Qor AI\'s senior product comparison analyst. Evaluate every listed product separately using the same system as product detail, then give a final recommendation.\n\n' +
    `LANGUAGE: Every user-facing text field must be fully written in ${langName(lang)}. Keep official product/model names as-is.\n\n` +
    'Return ONLY one valid JSON object with this exact structure:\n' +
    '{\n' +
    '  "type": "compare_full_report",\n' +
    '  "products": [\n' +
    '    {"name": "exact product name", "imageUrl": "copy from product context", "url": "copy from product context", "matchScore": <0-100>, "matchComment": "5-7 detailed sentences", "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}], "featureMatches": [{"label": "feature/spec", "productValue": "value", "userNeed": "need", "score": <0-100>, "comment": "2 evidence-based sentences"}], "analysis": "7-10 substantial paragraphs, each 45-85 words", "pros": ["6 detailed pros"], "cons": ["5 detailed cons"], "community": {"satisfaction": <0-100>, "summary": "5-7 substantial paragraphs", "pros": ["themes"], "cons": ["themes"], "sources": ["source types"]}, "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "5-7 substantial paragraphs"}}\n' +
    '  ],\n' +
    '  "comparison": {"winner": "exact product name", "winnerScore": <0-100>, "scoreGap": <number>, "chart": [{"name": "product", "score": <0-100>, "reason": "short reason"}], "factorMatrix": [{"label": "factor", "scores": [{"name": "product", "score": <0-100>}]}], "decisiveDifferences": ["6 detailed differences"], "headToHead": "6-8 substantial paragraphs", "recommendation": "6-9 substantial paragraphs explaining which one to buy and why"}\n' +
    '}\n\n' +
    'Rules:\n- Include one products[] entry for EVERY product. Names must match exactly.\n- First evaluate products separately; only then decide the final winner.\n- Each product must include 8-10 factor scores and 8-10 feature matches so the UI can render charts and spec-fit grids.\n- Write concrete professional prose, not generic summaries. Mention exact specs, compatibility, availability uncertainty, buyer profile, and trade-offs.\n- Scores must be realistic, varied and based on quiz answers, profile signals, catalog specs and research notes.\n- Cite uncertainty instead of inventing live prices, review counts or quotes.\n\n' +
    `PRODUCTS:\n${lines}\n\nPRODUCT PAYLOAD:\n${JSON.stringify(productPayload, null, 2)}\n\n` +
    `COMPARISON QUIZ ANSWERS:\n${ctx.quizAnswers}\n\n` +
    (prof ? `USER PROFILE / USER-RECOGNITION SIGNALS:\n${prof}\n\n` : '') +
    `WEB RESEARCH NOTES:\n${ctx.research || 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}`
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
          <div className="ai-alt-name">{a.name}</div>
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
  const winner = String(data.winner || '').trim();
  const products = arr(data.products).map((p) => ({
    name: p.name || '', score: toInt(p.score), bestFor: p.bestFor || '',
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
  const sources = arr(data.sources).map(String);
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
  const sources = arr(data.sources).map(String);
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
              {a.imageUrl ? <ProductImg src={a.imageUrl} alt={a.name || ''} size="thumb" /> : <span>{i + 1}</span>}
            </div>
            <div className="ai-alt-copy">
              <div className="ai-alt-card-top">
                <b>{a.name}</b>
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
        {data.buyOrWait && <strong>{String(data.buyOrWait).toUpperCase()}</strong>}
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
            <h3>{product.name || data.name || L('Product report', 'Ürün raporu', 'Produktbericht')}</h3>
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
        <BulletList items={product.reviewedInputs} tone="notes" />
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
  const rows = arr(chart).map((x) => ({ name: x.name || '', score: toInt(x.score), reason: x.reason || '' })).filter((x) => x.name);
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
              return <span key={`${s.name}-${j}`}><small>{s.name}</small><i style={{ width: `${Math.max(4, score)}%`, background: scoreColor(score) }} /><strong>{score}</strong></span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompareFullReport({ data, L }) {
  const products = arr(data.products);
  const cmp = data.comparison || {};
  return (
    <div className="ai-report ai-report-compare">
      {products.map((p, i) => (
        <ReportSection key={`${p.name}-${i}`} eyebrow={`0${i + 1}`} title={p.name}>
          <div className="ai-compare-product-head">
            {p.imageUrl && <ProductImg src={p.imageUrl} alt={p.name || ''} size="thumb" />}
            <div>
              {toInt(p.matchScore) > 0 && <ScoreRing value={toInt(p.matchScore)} />}
            </div>
            <Paragraphs text={p.matchComment} />
          </div>
          <ReportFactors factors={p.factors} L={L} />
          <FeatureMatches items={p.featureMatches} L={L} />
          <Paragraphs text={p.analysis} />
          <div className="ai-procon-row">
            <ProCon icon="✓" title={L('Pros', 'Artılar', 'Pro')} items={arr(p.pros).map(String)} color="#22c55e" />
            <ProCon icon="✕" title={L('Cons', 'Eksiler', 'Contra')} items={arr(p.cons).map(String)} color="#f43f5e" />
          </div>
          <CommunityBlock data={p.community} L={L} />
          <PriceForecastBlock data={p.priceForecast} L={L} />
        </ReportSection>
      ))}

      <ReportSection eyebrow={String(products.length + 1).padStart(2, '0')} title={L('Final comparison', 'Final karşılaştırma', 'Finaler Vergleich')}>
        {cmp.winner && (
          <div className="ai-cmp-winner">
            <span>★</span>
            <div><small>{L('Recommended pick', 'Önerilen seçim', 'Empfohlene Wahl')}</small><b>{cmp.winner}</b></div>
            {toInt(cmp.winnerScore) > 0 && <strong>{toInt(cmp.winnerScore)}</strong>}
          </div>
        )}
        <CompareScoreChartFull chart={cmp.chart} L={L} />
        <FactorMatrix rows={cmp.factorMatrix} />
        <BulletList items={cmp.decisiveDifferences} tone="notes" />
        <Paragraphs text={cmp.headToHead} />
        <div className="ai-verdict"><span>✓</span><div><Paragraphs text={cmp.recommendation} /></div></div>
      </ReportSection>
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────
// kind: 'deep' | 'alts' | 'advisor' | 'pred'. Returns null when JSON is unusable
// so the caller can fall back to plain text.
export default function AiAnalysisView({ kind, raw, data: dataProp, lang }) {
  const data = dataProp && typeof dataProp === 'object' ? dataProp : parseAiJson(raw);
  if (!data || typeof data !== 'object') return null;
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (en, tr, de) => (code === 'tr' ? tr : code === 'de' ? de : en);
  if (kind === 'productFull' || data.type === 'product_full_report') return <ProductFullReport data={data} L={L} />;
  if (kind === 'compareFull' || data.type === 'compare_full_report') return <CompareFullReport data={data} L={L} />;
  if (kind === 'deep') return <DeepView data={data} L={L} />;
  if (kind === 'alts') return <AltView data={data} L={L} />;
  if (kind === 'advisor') return <AdvisorView data={data} L={L} />;
  if (kind === 'pred') return <PredictionView data={data} L={L} />;
  if (kind === 'compare') return <CompareView data={data} L={L} />;
  if (kind === 'forum') return <ForumView data={data} L={L} />;
  return null;
}
