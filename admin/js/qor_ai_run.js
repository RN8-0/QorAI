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

// Rapordaki "akilli alternatifler" blogunun ADAY HAVUZU.
//
// ONCEDEN: ayni kategoriden `techScore:desc` ilk 8 urun. Olculdu 2026-08-28
// (`category:=smartphones`): ilk dokuz sonucun HEPSI 100 puan ve 1500-5000
// USD. Yani 286 USD'lik Galaxy A07 5G analiz edilirken de modele ayni dokuz
// amiral gemisi veriliyordu — kullanicinin bildirdigi "hep pahali cihaz
// oneriyor" hatasinin kaynagi prompt degil BU SORGUYDU.
//
// ARTIK: fiyat + puan bandi (P.peerFilterExpr) ve hedefe YAKINLIGA gore
// siralama (P.rankPeerCandidates). Bant kurali site ile ORTAK
// (admin/js/qor_ai_prompts.js), yoksa admin'de yayinlanan analiz ile sitede
// canli kosan analiz farkli alternatifler uretirdi.
async function similarProducts(product, limit) {
  var cat = String((product && product.category) || '').trim();
  if (!cat) return [];
  var n = limit || 8;
  async function cek(wide) {
    var filter = P.peerFilterExpr(product, wide);
    if (!filter) return [];
    var r = await window.TsClient.search('*', {
      // Havuz genis: bandi Typesense uygular, siralamayi (hedefe yakinlik,
      // varyant ve marka tekrarinin kirpilmasi) JS yapar.
      perPage: 40,
      filterBy: filter,
      sortBy: 'techScore:desc',
      includeFields: LEAN,
    });
    return (r.hits || []).map(function (h) { return h.document; });
  }
  // HAVUZ LEAN, SECILENLER ZENGIN. `_raw` (kayit basina onlarca KB) 40
  // dokumanlik havuz icin cekilemez; secilen adaylar icin ISE SART, cunku
  // `cleanProductForPrompt` spec satirlarini oradan okuyor ve spec'siz aday
  // modelin "keySpecs"i hafizadan uydurmasi demek.
  async function zenginlestir(list) {
    var ids = list.map(function (d) { return d.id; }).filter(Boolean);
    if (!ids.length) return list;
    var r = await window.TsClient.search('*', {
      perPage: ids.length,
      // TERS TIRNAK, cift tirnak DEGIL. Olculdu 2026-08-28: `id:["<id>"]`
      // canli indekste 0 sonuc donduruyor, `id:[`<id>`]` dogru calisiyor.
      // (`category:="..."` ise cift tirnakla sorunsuz — kural alana gore.)
      filterBy: 'id:[' + ids.map(function (id) { return '`' + String(id).replace(/`/g, '') + '`'; }).join(',') + ']',
      includeFields: 'id,_raw',
    });
    var ham = {};
    (r.hits || []).forEach(function (h) {
      var d = h.document || {};
      if (!d.id || !d._raw) return;
      try { ham[d.id] = JSON.parse(d._raw); } catch (_) { /* bozuk kayit atlanir */ }
    });
    return list.map(function (d) {
      var full = ham[d.id];
      // Indekslenmis alanlar KAZANIR: `_raw` son tam upsert'te donmus olabilir.
      return full ? Object.assign({}, full, d) : d;
    });
  }

  try {
    var havuz = await cek(false);
    // Dar bant 3 adaydan az verdiyse (nis kategori, fiyati bilinmeyen urun)
    // genis bantla tamamla.
    if (havuz.length < 3) havuz = havuz.concat(await cek(true));
    var secilen = P.rankPeerCandidates(product, havuz, n);
    try { return await zenginlestir(secilen); } catch (_) { return secilen; }
  } catch (_) { return []; }
}

// AI'in adini verdigi alternatifi katalogta arayan geri cagirim. Ad gercekten
// katalogdaysa kartin gorseli ve `/product/<slug>` adresi oradan gelir.
function katalogAra(ad) {
  return searchProducts(ad, 8);
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

// N istegi ayni anda degil, en fazla `limit` tanesi kosar — sitedeki
// mapWithConcurrency ile ayni is. Admin tek kullanicilik ama AI proxy'si
// site ve app ile PAYLASIMLI ve 429 tam da burada patliyor.
async function mapWithConcurrency(items, limit, fn) {
  var out = new Array(items.length);
  var sirada = 0;
  async function isci() {
    for (;;) {
      var i = sirada; sirada += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  var n = Math.max(1, Math.min(limit, items.length));
  var isciler = [];
  for (var k = 0; k < n; k += 1) isciler.push(isci());
  await Promise.all(isciler);
  return out;
}

/**
 * TEK DILDE karsilastirma raporu — SITEDEKI HATTIN AYNISI
 * (web/src/lib/compareAnalysisJobs.js -> runCompareAnalysisJob).
 *
 * ONCEKI SURUM tek bir `buildComparePrompt` cagrisiyla butun urunleri tek
 * JSON'a yazdiriyordu ve bunun iki bedeli vardi:
 *   1. O prompt urun sayisi arttikca kendi istedigi paragraf sayisini
 *      DUSURUYOR (`big = n >= 4`), yani 5. urunun raporu 2 urunlu bir
 *      karsilastirmadakinin yarisi kadar oluyordu.
 *   2. Tek cikti 16k jetonu zorladigi icin 6 urun pratik tavandi; ustunde
 *      JSON yarida kesiliyordu.
 * Site bunu zaten cozmus: her urun KENDI cagrisinda tam derinlikte yazilir
 * (8192 jeton, es zamanli 5), sonra ozetlerden TEK hukum cagrisi yapilir.
 * Cikti sekli birebir ayni (`compare_full_report`) — ne site cizimi ne
 * on-render degisiyor, yalnizca urun basina derinlik SABIT kaliyor.
 */
async function runCompareReport(o) {
  var products = o.products || [];
  var lang = o.lang;
  var answers = o.answers || [];
  var stage = o.onStage || function () {};
  var sistem = 'You are Qor AI. Return only valid JSON in language code ' + lang
    + '. Use current research and Qor catalog context over stale model memory. '
    + 'Every user-facing text field must be in the requested language; keep only '
    + 'brand/product names and technical terms as-is.';

  stage('research', lang);
  var research = '';
  try {
    research = await askGrounded(
      P.buildCompareResearchPrompt(products, lang, { quizAnswers: answers }),
      lang, 2048
    );
  } catch (_) { research = ''; }

  stage('report', lang);
  var peerNames = products.map(function (p) { return P.displayProductName(p, lang); });
  var biten = 0;
  stage('progress', lang, { done: 0, total: products.length });

  function urunRaporu(p) {
    return askRaw({
      system: sistem,
      user: P.buildCompareProductPrompt(p, lang, {}, {
        quizAnswers: answers, research: research, peerNames: peerNames,
      }),
      maxOutputTokens: 8192,
      temperature: 0.42,
      jsonMode: true,
    }).then(function (txt) { return P.parseAiJson(txt); }, function () { return null; });
  }

  var raporlar = await mapWithConcurrency(products, 5, async function (p) {
    // TEK SEFER YENIDEN DENE. Site tek deneme yapip basarisiz urunu sessizce
    // DUSURUYOR; orada bir ziyaretci bekliyor. Adminde ise dusurulen urun,
    // "6 urun karsilastirdim" diye yayinlanan bir sayfanin 5 urun icermesi
    // demek — bir deneme daha, on dakikalik kosuyu kurtarmaya deger.
    var parsed = await urunRaporu(p);
    if (!parsed || typeof parsed !== 'object') parsed = await urunRaporu(p);
    biten += 1;
    stage('progress', lang, { done: biten, total: products.length });
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.assign({}, parsed, {
      name: parsed.name || P.displayProductName(p, lang),
      imageUrl: p.imageUrl || parsed.imageUrl || '',
      url: P.productPath(p),
    });
  });

  var ok = raporlar.filter(Boolean);
  var dusen = products.filter(function (p, i) { return !raporlar[i]; })
    .map(function (p) { return P.displayProductName(p, lang); });
  if (ok.length < 2) throw new Error('Karşılaştırma raporu üretilemedi (' + lang + ')');

  stage('verdict', lang);
  var verdict = {};
  try {
    verdict = P.parseAiJson(await askRaw({
      system: sistem,
      user: P.buildCompareVerdictPrompt(products, ok, lang, {}, {
        quizAnswers: answers, research: research,
      }),
      maxOutputTokens: 6144,
      temperature: 0.4,
      jsonMode: true,
    })) || {};
  } catch (_) { verdict = {}; }

  return {
    data: { type: 'compare_full_report', products: ok, comparison: verdict },
    researched: Boolean(research),
    dropped: dusen,
  };
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
  // Alternatif adi katalogda varsa gorsel + adres oradan yazilir; kayit
  // YAYINLANIRKEN sabitlenir, boylece yayinlanan sayfa da tiklanabilir olur.
  try {
    data.alternatives = await P.resolveCatalogAlternatives(data.alternatives, {
      search: katalogAra,
      category: product && product.category,
      lang: lang,
    });
  } catch (_) { /* eslestirme raporu bozmaz */ }
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
  // Tek linkli raporda alternatif listesi var; katalogda bulunani gorselli ve
  // tiklanabilir yap. Karsilastirma raporunda boyle bir liste yok.
  if (bases.length === 1) {
    try {
      data.alternatives = await P.resolveCatalogAlternatives(data.alternatives, {
        search: katalogAra,
        category: bases[0] && bases[0].category,
        lang: lang,
      });
    } catch (_) { /* eslestirme raporu bozmaz */ }
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
  // BASLIK cok uzun YA DA ACIKLAMA cok kisa olabilir. Onceden yalnizca
  // baslik denetleniyordu; denetim (scripts/audit_analyses.mjs) acikamalarin
  // surekli 126-132 karakterde kaldigini gosterdi — arama sonucunda satirin
  // sonu bos kaliyor, yani ucretsiz bir alan harcaniyor.
  var uzun = ['tr', 'en'].filter(function (l) {
    var v = res[l] && res[l].metaTitle;
    return v && String(v).length > 60;
  });
  var kisa = ['tr', 'en'].filter(function (l) {
    var v = res[l] && res[l].metaDescription;
    return v && String(v).length < 140;
  });
  if (uzun.length || kisa.length) {
    try {
      var tekrar = await askJson({
        system: 'You are Qor AI SEO editor. Return only valid JSON. Never repeat a forbidden value.',
        user: P.buildPublishMetaPrompt(o)
          + '\n\nRETRY — LENGTH VIOLATION:\n'
          + uzun.map(function (l) {
            return '- ' + l + '.metaTitle was ' + String(res[l].metaTitle).length
              + ' characters ("' + res[l].metaTitle + '"). It MUST be 60 or fewer, INCLUDING spaces. '
              + 'Rewrite it shorter — drop qualifiers, not the product name.';
          }).concat(kisa.map(function (l) {
            return '- ' + l + '.metaDescription was ' + String(res[l].metaDescription).length
              + ' characters ("' + res[l].metaDescription + '"). It MUST be 140-155, INCLUDING spaces. '
              + 'Rewrite it LONGER by adding a concrete detail from the report — a number, the verdict, '
              + 'or who it suits. Do not pad with filler.';
          })).join('\n'),
        maxOutputTokens: 4096,
        temperature: 0.4,
      });
      // Yalniz SINIRA UYAN dili degistir: uyan dili bozma.
      uzun.forEach(function (l) {
        var yeni = tekrar[l] && tekrar[l].metaTitle;
        if (yeni && String(yeni).length <= 60) res[l].metaTitle = yeni;
      });
      kisa.forEach(function (l) {
        var yeni = tekrar[l] && tekrar[l].metaDescription;
        var u = yeni ? String(yeni).length : 0;
        if (u >= 140 && u <= 158) res[l].metaDescription = yeni;
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
