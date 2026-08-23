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

// ── Link/abonelik motoru: TASIMA KATMANINI BAGLA ───────────────────────────
// Motor (admin/js/qor_ai_link.js) hangi saglayiciya gittigini bilmez; site
// kendi ai.js'ini verir, admin burayi verir. Ayni kod, ayni prompt.
var _promptCache = null;
var _promptCacheAt = 0;
async function loadAiPrompts() {
  var now = Date.now();
  if (_promptCache && now - _promptCacheAt < 5 * 60 * 1000) return _promptCache;
  try {
    var rec = await pb().collection('public_config').getFirstListItem('key = "ai_prompts"', { $autoCancel: false });
    _promptCache = (rec && rec.value && typeof rec.value === 'object') ? rec.value : {};
  } catch (_) { _promptCache = {}; }
  _promptCacheAt = now;
  return _promptCache;
}
// Sitedeki adminPrompt() ile AYNI kural: PB'de en az 40 karakterlik bir
// override varsa o, yoksa kodun icindeki varsayilan.
async function adminPrompt(key, fallback) {
  try {
    var prompts = await loadAiPrompts();
    var v = prompts ? prompts[key] : null;
    var t = (v == null ? '' : String(v)).trim();
    if (t.length >= 40) return t;
  } catch (_) { /* varsayilana dus */ }
  return fallback;
}

if (root.QorAiLink) {
  root.QorAiLink.configure({
    askJson: askJson,
    askGrounded: function (prompt, o) {
      o = o || {};
      return askGrounded(prompt, o.language || o.lang || 'en', o.maxOutputTokens);
    },
    adminPrompt: adminPrompt,
  });
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
 * KARSILASTIRMA QUIZI — 2+ urun icin. Tek urun quizinden ayri bir prompt
 * kullanir (`compareQuizGenerationPrompt`): sorular "hangisi sana uygun"
 * ekseninde kurulmali, "bu urun sana uygun mu" ekseninde degil.
 */
async function generateCompareQuiz(products, lang) {
  var count = P.compareQuizCount ? P.compareQuizCount(products.length) : 5;
  var res = await askJson({
    system: P.compareQuizGenerationPrompt(lang, count),
    user: JSON.stringify({
      products: (products || []).map(function (p) {
        return {
          name: P.displayProductName(p, lang),
          brand: p.brand || '',
          category: p.category || '',
          techScore: p.techScore || 0,
        };
      }),
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
 * TEK DILDE karsilastirma raporu. Urun raporuyla ayni iskelet: once GROUNDED
 * arastirma, sonra tek JSON cagrisi. Cikti `compare_full_report` seklinde ve
 * site tarafinda `reportAdapters.js` onu zaten taniyor — yani yayinlanan sayfa
 * hicbir yeni cizim kodu gerektirmiyor.
 */
async function runCompareReport(o) {
  var products = o.products || [];
  var lang = o.lang;
  var answers = o.answers || [];
  var stage = o.onStage || function () {};

  stage('research', lang);
  var research = '';
  try {
    research = await askGrounded(
      P.buildCompareResearchPrompt(products, lang, { quizAnswers: answers }),
      lang, 2048
    );
  } catch (_) { research = ''; }

  stage('report', lang);
  var prompt = P.buildComparePrompt(products, lang, {}, {
    quizAnswers: answers,
    research: research,
  });
  var txt = await askRaw({
    system: 'You are Qor AI. Return only valid JSON in language code ' + lang + '. Use current research and Qor catalog context over stale model memory. Every user-facing text field must be in the requested language; keep only brand/product names and technical terms as-is.',
    user: prompt,
    // Karsilastirmada cikti urun sayisiyla buyuyor; tavan urun raporuyla ayni
    // tutuluyor (bkz. runProductReport: 8192 DeepSeek'in siniriydi ve yalniz
    // Gemini'yi bogazliyordu).
    maxOutputTokens: 16384,
    temperature: 0.45,
    jsonMode: true,
  });
  var data = P.parseAiJson(txt);
  if (!data || !Array.isArray(data.products) || !data.products.length) {
    throw new Error('Karsilastirma raporu bos (' + lang + ')');
  }
  return { data: data, researched: Boolean(research) };
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
  // 16384 jeton: 8192 DeepSeek'in siniriydi ve DeepSeek'e giden istek zaten
  // ayrica kirpiliyor, yani dusuk tavan yalnizca Gemini'yi bogazliyordu.
  // Olculdu (2026-08-22, iPhone 16 Pro Max): 26.2k karakterlik rapor gecti,
  // 28.9k karakterlik olan priceForecast'in ortasinda KESILDI ve ayristirilamadi.
  var prompt = P.buildFullPrompt(product, lang, {}, {
    quizAnswers: answers,
    research: research,
    similarProducts: o.similar || [],
    offers: o.offers || [],
  });
  var txt = await askRaw({
    system: 'You are Qor AI. Return only valid JSON in language code ' + lang + '. Use current research and Qor catalog context over stale model memory. Every user-facing text field must be in the requested language; keep only brand/product names and technical terms as-is.',
    user: prompt,
    maxOutputTokens: 16384,
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
        maxOutputTokens: 16384,
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

/**
 * LINK ANALIZI — sitedeki linkAnalysisJobs.js akisinin AYNISI, ayni motorla.
 * Tek link  -> enhancedAnalysis (ortak "enhanced" sekil)
 * 2+ link   -> compareAnalysis  (products[] + comparison)
 */
async function analyzeLinks(urls, lang) {
  var L = root.QorAiLink;
  var bases = [];
  for (var i = 0; i < urls.length; i++) {
    bases.push(await L.analyzeLink(urls[i], lang, {}));
  }
  return bases;
}

async function linkQuiz(bases, lang) {
  var L = root.QorAiLink;
  if (bases.length > 1) {
    return L.generateCompareQuiz({
      products: bases.map(function (b) { return { title: b.title, category: b.category, url: b.url }; }),
      language: lang,
      userProfile: {},
    });
  }
  var b = bases[0];
  return L.generateQuiz({
    category: b.category,
    productTitle: b.title,
    url: b.url,
    siteName: b.siteName,
    productContext: String(b.analysis || '').slice(0, 1200),
    language: lang,
    userProfile: {},
  });
}

async function runLinkReport(o) {
  var L = root.QorAiLink;
  var bases = o.bases;
  var lang = o.lang;
  var stage = o.onStage || function () {};

  stage('research', lang);
  var research = '';
  try {
    research = bases.length > 1
      ? await L.researchProductsCommunity({ bases: bases, language: lang })
      : await L.researchProductCommunity({
        title: bases[0].title, category: bases[0].category,
        url: bases[0].url, siteName: bases[0].siteName, language: lang,
      });
  } catch (_) { research = ''; }

  stage('report', lang);
  var data = bases.length > 1
    ? await L.compareAnalysis({ bases: bases, answers: o.answers, language: lang, userProfile: {}, research: research })
    : await L.enhancedAnalysis({ base: bases[0], answers: o.answers, language: lang, userProfile: {}, research: research });

  if (!data || typeof data !== 'object') throw new Error('Rapor çözülemedi (' + lang + ')');
  if (bases.length > 1 && !(Array.isArray(data.products) && data.products.length >= 2)) {
    throw new Error('Karşılaştırma raporu eksik (' + lang + ')');
  }
  return { data: data, researched: Boolean(research) };
}

/** ABONELIK ANALIZI — sitedeki subscriptionAnalysisJobs.js akisinin AYNISI. */
async function subscriptionQuiz(names, lang) {
  return root.QorAiLink.generateSubscriptionQuiz({
    subscriptionNames: names, language: lang, userProfile: {},
  });
}

async function runSubscriptionReport(o) {
  var L = root.QorAiLink;
  var names = o.names;
  var lang = o.lang;
  var stage = o.onStage || function () {};

  stage('research', lang);
  var research = '';
  try {
    research = await L.researchSubscriptionsCommunity({ names: names, language: lang });
  } catch (_) { research = ''; }

  stage('report', lang);
  var data = await L.subscriptionAnalysis({
    subscriptionNames: names, answers: o.answers, language: lang, userProfile: {}, research: research,
  });
  if (!data || !Array.isArray(data.services) || !data.services.length) {
    throw new Error('Abonelik raporu boş (' + lang + ')');
  }
  return { data: data, researched: Boolean(research) };
}

/**
 * Yayin meta'si — iki dil TEK cagrida, yasakli meta listesiyle.
 *
 * `metaTitle` 60 KARAKTERI ASARSA BIR KEZ YENIDEN ISTENIR. Prompt zaten sinir
 * koyuyor ama model duzenli olarak 62-65 karakter yaziyordu ve admin ekraninda
 * "62/60" kirmizi kaliyordu. Alanlar elle duzenlenmedigi icin (rapor ve meta
 * AI uretir, insan onaylar) tek care yeniden istemek; kirpmak basligin son
 * kelimesini yariyor ve arama sonucunda "..." birakiyor.
 */
async function publishMeta(o) {
  var res = await askJson({
    system: 'You are Qor AI SEO editor. Return only valid JSON. Never repeat a forbidden value.',
    user: P.buildPublishMetaPrompt(o),
    maxOutputTokens: 4096,
    temperature: 0.6,
  });
  var uzun = ['tr', 'en'].filter(function (l) {
    var v = res[l] && res[l].metaTitle;
    return v && String(v).length > 60;
  });
  if (uzun.length) {
    try {
      var tekrar = await askJson({
        system: 'You are Qor AI SEO editor. Return only valid JSON. Never repeat a forbidden value.',
        user: P.buildPublishMetaPrompt(o)
          + '\n\nRETRY — LENGTH VIOLATION:\n'
          + uzun.map(function (l) {
            return '- ' + l + '.metaTitle was ' + String(res[l].metaTitle).length
              + ' characters ("' + res[l].metaTitle + '"). It MUST be 60 or fewer, INCLUDING spaces. '
              + 'Rewrite it shorter — drop qualifiers, not the product name.';
          }).join('\n'),
        maxOutputTokens: 4096,
        temperature: 0.4,
      });
      // Yalniz SINIRA UYAN dili degistir: uyan dili bozma.
      uzun.forEach(function (l) {
        var yeni = tekrar[l] && tekrar[l].metaTitle;
        if (yeni && String(yeni).length <= 60) res[l].metaTitle = yeni;
      });
    } catch (_) { /* ilk deger duruyor, ekranda uzunluk uyarisi gorunur */ }
  }
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
  generateCompareQuiz: generateCompareQuiz,
  runCompareReport: runCompareReport,
  analyzeLinks: analyzeLinks,
  linkQuiz: linkQuiz,
  runLinkReport: runLinkReport,
  subscriptionQuiz: subscriptionQuiz,
  runSubscriptionReport: runSubscriptionReport,
  publishMeta: publishMeta,
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
