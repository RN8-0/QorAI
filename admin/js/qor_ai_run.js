/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — ANALIZ MOTORU
//
//  Analizi ADMIN PANELINDE kosturur: quiz uret -> yanitla -> web arastirmasi
//  -> rapor (TR + EN) -> yayin meta'si.
//
//  PROMPT'LAR BURADA DEGIL. Hepsi admin/js/qor_ai_prompts.js icinde ve siteyle
//  ORTAK (web/src/lib/aiPrompts.js ayni dosyayi ice aktariyor). Burada yalnizca
//  TASIMA katmani var: hangi proxy, hangi sirayla, kac deneme.
//  Sira web/src/lib/ai.js ile ayni: Gemini once (yalniz 5xx'te bir tekrar),
//  sonra DeepSeek. Grounded arastirma yalnizca Gemini'de var (Google Search).
//
//  Anahtarlar istemciye HIC inmez; PocketBase proxy'si (pb_hooks) tasir.
// ═══════════════════════════════════════════════════════════════════════════
(function (root) {
'use strict';

var P = root.QorAiPrompts;

var GEMINI_MODEL = 'gemini-2.5-flash';
var DEEPSEEK_MODEL = 'deepseek-chat';
var DEEPSEEK_MAX_OUTPUT = 8192;

function pb() { return getPb(); }
function base() { return pb().baseUrl.replace(/\/+$/, ''); }
function token() { try { return pb().authStore.token || ''; } catch (_) { return ''; } }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function transientStatus(s) { return s === 404 || s === 429 || s === 500 || s === 502 || s === 503 || s === 504; }
function retryableStatus(s) { return s === 500 || s === 502 || s === 503 || s === 504; }

async function post(path, body, timeoutMs) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 90000);
  try {
    return await fetch(base() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(timer); }
}

async function geminiOnce(o) {
  var generationConfig = {
    temperature: o.temperature,
    maxOutputTokens: o.maxOutputTokens,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (o.jsonMode) generationConfig.responseMimeType = 'application/json';
  var body = {
    model: GEMINI_MODEL,
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: 'user', parts: [{ text: o.user }] }],
    generationConfig: generationConfig,
  };
  if (o.tools && o.tools.length) body.tools = o.tools;
  var res = await post('/api/ai/gemini', body, o.timeoutMs);
  if (!res.ok) {
    var e = new Error('gemini ' + res.status);
    e.transient = transientStatus(res.status);
    e.retryable = retryableStatus(res.status);
    throw e;
  }
  var data = await res.json();
  var cand = (data && data.candidates && data.candidates[0]) || {};
  var parts = (cand.content && cand.content.parts) || [];
  var text = parts.map(function (p) { return p.text || ''; }).join('').trim();
  if (!text) { var e2 = new Error('gemini empty'); e2.transient = true; throw e2; }
  return text;
}

async function deepseekOnce(o) {
  var body = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }],
    max_tokens: Math.min(o.maxOutputTokens, DEEPSEEK_MAX_OUTPUT),
    temperature: o.temperature,
  };
  if (o.jsonMode) body.response_format = { type: 'json_object' };
  var res = await post('/api/ai/deepseek', body, o.timeoutMs);
  if (!res.ok) {
    var e = new Error('deepseek ' + res.status);
    e.transient = transientStatus(res.status);
    e.retryable = retryableStatus(res.status);
    throw e;
  }
  var data = await res.json();
  if (data && data.error) {
    var e2 = new Error('deepseek ' + data.error);
    e2.transient = String(data.error) === 'rate_limited';
    throw e2;
  }
  var c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!c) { var e3 = new Error('deepseek empty'); e3.transient = true; throw e3; }
  return String(c).trim();
}

// Gemini -> DeepSeek. 429/404'te AYNI saglayici tekrar DENENMEZ: ucretsiz
// Gemini anahtari sik 429 veriyor ve beklemek bosuna gecikme demek.
async function askRaw(o) {
  var opt = Object.assign({ maxOutputTokens: 4096, temperature: 0.7, jsonMode: false, timeoutMs: 90000 }, o);
  var lastErr;
  for (var i = 0; i < 2; i++) {
    try { return await geminiOnce(opt); }
    catch (e) { lastErr = e; if (!e.retryable || i === 1) break; await sleep(1200); }
  }
  for (var j = 0; j < 2; j++) {
    try { return await deepseekOnce(opt); }
    catch (e2) { lastErr = e2; if (!e2.retryable || j === 1) break; await sleep(1200); }
  }
  throw lastErr || new Error('AI failed');
}

async function askJson(o) {
  var txt = await askRaw(Object.assign({}, o, { jsonMode: true }));
  var parsed = P.parseAiJson(txt);
  if (!parsed) throw new Error('AI yanıtı çözülemedi');
  return parsed;
}

// Grounded arastirma — YALNIZ Gemini (Google Search araci onda var).
// Basarisiz olursa rapor arastirmasiz kosar; bu bir HATA DEGIL, "kanit zayif"
// demek ve prompt bunu zaten sisteme soyluyor.
async function askGrounded(prompt, lang, maxOutputTokens) {
  var lastErr;
  for (var i = 0; i < 3; i++) {
    try {
      return await geminiOnce({
        system: P.groundedResearchSystemPrompt(lang),
        user: prompt,
        maxOutputTokens: maxOutputTokens || 2048,
        temperature: 0.2,
        tools: [{ googleSearch: {} }],
        jsonMode: false,
        timeoutMs: 35000,
      });
    } catch (e) { lastErr = e; if (!e.transient || i === 2) break; await sleep(700 + i * 500); }
  }
  throw lastErr || new Error('grounded search failed');
}

// ── katalog ────────────────────────────────────────────────────────────────
var LEAN = 'id,name,brand,category,techScore,imageUrl,slug,priceTR,priceUSD,lowestPriceUSD';

async function searchProducts(q, perPage) {
  var r = await window.TsClient.search(q, { perPage: perPage || 12, includeFields: LEAN });
  return (r.hits || []).map(function (h) { return h.document; });
}

async function loadProduct(id) {
  return pb().collection('products').getOne(id, { $autoCancel: false });
}

// Rapordaki "akilli alternatifler" blogu icin ayni kategoriden en yuksek
// puanli urunler. Site de analize AYNI baglami veriyor (ProductDetail'deki
// `similar`); vermezsek model katalog disi urun uyduruyor.
async function similarProducts(product, limit) {
  var cat = String((product && product.category) || '').trim();
  if (!cat) return [];
  try {
    var r = await window.TsClient.search('*', {
      perPage: (limit || 8) + 1,
      filterBy: 'category:=' + JSON.stringify(cat),
      sortBy: 'techScore:desc',
      includeFields: LEAN,
    });
    return (r.hits || []).map(function (h) { return h.document; })
      .filter(function (d) { return d.id !== product.id; })
      .slice(0, limit || 8);
  } catch (_) { return []; }
}

// ── akis ───────────────────────────────────────────────────────────────────

/** Quiz — sitedeki generateQuiz() ile AYNI prompt, ayni soru sayisi. */
async function generateQuiz(product, lang) {
  var count = P.productQuizCount(product.category);
  var ks = product.keySpecs && typeof product.keySpecs === 'object'
    ? 'Key specs: ' + Object.entries(product.keySpecs).slice(0, 10).map(function (kv) { return kv[0] + ': ' + kv[1]; }).join('; ')
    : '';
  var res = await askJson({
    system: P.quizGenerationPrompt(lang, count),
    user: JSON.stringify({
      category: product.category || 'unknown',
      productTitle: P.displayProductName(product, lang),
      url: P.productPath(product),
      store: '',
      productContext: [
        product.brand ? 'Brand: ' + product.brand : '',
        product.category ? 'Category: ' + product.category : '',
        ks,
      ].filter(Boolean).join(' · ').slice(0, 1200),
      userProfile: {},
      variationSeed: P.variationSeed(),
    }),
    maxOutputTokens: 3072,
    temperature: 0.95,
  });
  return (Array.isArray(res.questions) ? res.questions : [])
    .map(function (q, i) {
      return {
        id: 'q' + i,
        text: String(q.question || ''),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
      };
    })
    .filter(function (q) { return q.text && q.options.length >= 2; })
    .slice(0, count);
}

/**
 * TEK DILDE rapor. Sirasi ve tazelik onarimi sitedeki
 * runProductAnalysisJob() ile birebir ayni.
 */
async function runProductReport(o) {
  var product = o.product;
  var lang = o.lang;
  var answers = o.answers || [];
  var stage = o.onStage || function () {};
  var startedAt = Date.now();

  stage('research', lang);
  var research = '';
  try {
    research = await askGrounded(
      P.buildProductResearchPrompt(product, lang, { quizAnswers: answers }),
      lang, 2048
    );
  } catch (_) { research = ''; }

  stage('report', lang);
  var prompt = P.buildFullPrompt(product, lang, {}, {
    quizAnswers: answers,
    research: research,
    similarProducts: o.similar || [],
    offers: o.offers || [],
  });
  var txt = await askRaw({
    system: 'You are Qor AI. Return only valid JSON in language code ' + lang + '. Use current research and Qor catalog context over stale model memory. Every user-facing text field must be in the requested language; keep only brand/product names and technical terms as-is.',
    user: prompt,
    maxOutputTokens: 8192,
    temperature: 0.45,
    jsonMode: true,
  });
  var data = P.parseAiJson(txt);

  if ((!data || typeof data !== 'object' || P.hasStaleAvailabilityClaims(txt)) && Date.now() - startedAt < 95000) {
    stage('freshness', lang);
    try {
      var retry = await askRaw({
        system: 'You are Qor AI. Return only valid JSON in language code ' + lang + '. This is a freshness-critical retry; remove stale launch/availability assumptions. Every user-facing text field must be in the requested language.',
        user: P.withFreshnessRetryInstruction(prompt, [P.displayProductName(product, lang)]),
        maxOutputTokens: 8192,
        temperature: 0.25,
        jsonMode: true,
      });
      var rd = P.parseAiJson(retry);
      if (rd && typeof rd === 'object' && !P.hasStaleAvailabilityClaims(retry)) { txt = retry; data = rd; }
    } catch (_) { /* ilk rapor duruyor */ }
  }
  if (!data || typeof data !== 'object' || !data.product) throw new Error('Rapor çözülemedi (' + lang + ')');
  return { data: data, researched: Boolean(research) };
}

/** Yayin meta'si — iki dil TEK cagrida, yasakli meta listesiyle. */
async function publishMeta(o) {
  var res = await askJson({
    system: 'You are Qor AI SEO editor. Return only valid JSON. Never repeat a forbidden value.',
    user: P.buildPublishMetaPrompt(o),
    maxOutputTokens: 4096,
    temperature: 0.6,
  });
  function pick(v) {
    return {
      title: String((v && v.title) || '').trim(),
      lead: String((v && v.lead) || '').trim(),
      metaTitle: String((v && v.metaTitle) || '').trim(),
      metaDescription: String((v && v.metaDescription) || '').trim(),
      faq: (Array.isArray(v && v.faq) ? v.faq : [])
        .map(function (f) { return { q: String((f && f.q) || '').trim(), a: String((f && f.a) || '').trim() }; })
        .filter(function (f) { return f.q && f.a; })
        .slice(0, 6),
    };
  }
  return { tr: pick(res.tr), en: pick(res.en) };
}

root.QorAiRun = {
  askRaw: askRaw,
  askJson: askJson,
  askGrounded: askGrounded,
  searchProducts: searchProducts,
  loadProduct: loadProduct,
  similarProducts: similarProducts,
  generateQuiz: generateQuiz,
  runProductReport: runProductReport,
  publishMeta: publishMeta,
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
