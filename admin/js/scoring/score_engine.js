// ═══════════════════════════════════════════════════════════════
//  COMPAIR ADMIN — Tech Score Engine v2
//  Universal product scoring (0-100) from PB specs.
//
//  Pipeline per category:
//    1. Extract numeric/categorical features from product.specs
//    2. Normalize against the category's min/max
//    3. Weighted sum (only weights for present features count)
//    4. Percentile rank within category
//    5. Power-curve scaling: round(20 + 80 * (p/100)^0.75)
//    6. Release-year decay (-3% per year, floor 0.70)
// ═══════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ── Chipset benchmark table (AnTuTu v10 ref, normalized 0-100) ──
  // Higher = stronger SoC. Used by smartphones/tablets/laptops.
  const CHIPSETS = [
    // Apple — desktop class
    [/m4 ?ultra/i, 100], [/m4 ?max/i, 98], [/m4 ?pro/i, 95], [/m4(?!\w)/i, 90],
    [/m3 ?ultra/i, 97], [/m3 ?max/i, 95], [/m3 ?pro/i, 90], [/m3(?!\w)/i, 85],
    [/m2 ?ultra/i, 92], [/m2 ?max/i, 88], [/m2 ?pro/i, 84], [/m2(?!\w)/i, 78],
    [/m1 ?ultra/i, 85], [/m1 ?max/i, 80], [/m1 ?pro/i, 75], [/m1(?!\w)/i, 68],
    // Apple — A series (phones/tablets)
    [/a19 ?pro/i, 99], [/a19/i, 95], [/a18 ?pro/i, 92], [/a18/i, 88],
    [/a17 ?pro/i, 85], [/a17/i, 80], [/a16/i, 75], [/a15/i, 65], [/a14/i, 55],
    // Snapdragon flagships (8 series)
    [/snapdragon ?8 ?(elite|gen ?5)/i, 96], [/snapdragon ?8 ?gen ?4/i, 92],
    [/snapdragon ?8 ?gen ?3/i, 86], [/snapdragon ?8 ?gen ?2/i, 78], [/snapdragon ?8 ?gen ?1/i, 68],
    [/snapdragon ?8\+? ?gen ?1/i, 72], [/snapdragon ?888/i, 60], [/snapdragon ?870/i, 55],
    // Snapdragon mid-range (7/6/4)
    [/snapdragon ?7 ?gen ?3/i, 60], [/snapdragon ?7 ?gen ?2/i, 55], [/snapdragon ?7 ?gen ?1/i, 50],
    [/snapdragon ?6 ?gen ?3/i, 48], [/snapdragon ?6 ?gen ?1/i, 42],
    [/snapdragon ?695/i, 40], [/snapdragon ?680/i, 35], [/snapdragon ?4 ?gen ?2/i, 30],
    // MediaTek Dimensity
    [/dimensity ?9400/i, 90], [/dimensity ?9300/i, 84], [/dimensity ?9200/i, 76], [/dimensity ?9000/i, 70],
    [/dimensity ?8400/i, 70], [/dimensity ?8300/i, 65], [/dimensity ?8200/i, 60], [/dimensity ?8100/i, 55],
    [/dimensity ?7300/i, 50], [/dimensity ?7200/i, 45], [/dimensity ?7050/i, 40], [/dimensity ?6300/i, 32],
    // Exynos
    [/exynos ?2400/i, 80], [/exynos ?2200/i, 65], [/exynos ?2100/i, 55], [/exynos ?1480/i, 50], [/exynos ?1380/i, 42],
    // Tensor
    [/tensor ?g4/i, 75], [/tensor ?g3/i, 68], [/tensor ?g2/i, 60], [/tensor(?!\w)/i, 55],
    // Intel desktop/laptop
    [/core ?ultra ?9/i, 92], [/core ?ultra ?7/i, 80], [/core ?ultra ?5/i, 65],
    [/i9-1[34][\d]/i, 88], [/i9-12/i, 78], [/i9/i, 75],
    [/i7-1[34][\d]/i, 78], [/i7-12/i, 68], [/i7/i, 62],
    [/i5-1[34][\d]/i, 65], [/i5-12/i, 55], [/i5/i, 50],
    [/i3/i, 35], [/celeron|pentium/i, 20],
    // AMD Ryzen
    [/ryzen ?9 ?9[0-9]{3}/i, 90], [/ryzen ?9 ?7/i, 85], [/ryzen ?9/i, 78],
    [/ryzen ?7 ?9/i, 80], [/ryzen ?7 ?7/i, 72], [/ryzen ?7/i, 65],
    [/ryzen ?5 ?9/i, 65], [/ryzen ?5 ?7/i, 58], [/ryzen ?5/i, 52],
    [/ryzen ?3/i, 38],
  ];

  // ── GPU benchmark (laptop/desktop) ──
  const GPUS = [
    [/rtx ?5090/i, 100], [/rtx ?5080/i, 95], [/rtx ?5070 ?ti/i, 88], [/rtx ?5070/i, 84],
    [/rtx ?4090/i, 95], [/rtx ?4080/i, 88], [/rtx ?4070 ?ti/i, 82], [/rtx ?4070/i, 76],
    [/rtx ?4060 ?ti/i, 70], [/rtx ?4060/i, 64], [/rtx ?4050/i, 56],
    [/rtx ?3090/i, 78], [/rtx ?3080/i, 72], [/rtx ?3070/i, 64], [/rtx ?3060/i, 54], [/rtx ?3050/i, 44],
    [/rx ?7900 ?xtx/i, 90], [/rx ?7900 ?xt/i, 84], [/rx ?7800/i, 76], [/rx ?7700/i, 68], [/rx ?7600/i, 56],
    [/rx ?6900/i, 72], [/rx ?6800/i, 66], [/rx ?6700/i, 56], [/rx ?6600/i, 46],
    [/intel arc/i, 50], [/iris xe/i, 35], [/uhd graphics/i, 20], [/integrated/i, 18],
  ];

  // ── Display panel quality ──
  const PANELS = [
    [/(amoled|oled|super amoled|dynamic amoled|ltpo|qd-?oled|micro ?led)/i, 100],
    [/(retina|liquid retina|p3)/i, 90],
    [/(ips lcd|ips)/i, 70],
    [/(va|pls|tft)/i, 55],
    [/(lcd)/i, 50],
    [/(tn)/i, 25],
    [/(e-?ink)/i, 60],
  ];

  // ── Connectivity tiers ──
  const CONNECTIVITY = {
    wifi: [[/wi-?fi ?7|802\.11be/i, 100], [/wi-?fi ?6e|802\.11ax.*6e/i, 85], [/wi-?fi ?6|802\.11ax/i, 75], [/wi-?fi ?5|802\.11ac/i, 55], [/wi-?fi ?4|802\.11n/i, 30]],
    bluetooth: [[/5\.[34]/i, 100], [/5\.2/i, 85], [/5\.[01]/i, 70], [/4\.[12]/i, 50], [/4\.0/i, 35]],
    network: [[/5g/i, 100], [/lte ?cat ?\d{2}/i, 80], [/4g|lte/i, 70], [/3g/i, 30]],
  };

  // ─────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────

  function _toNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).replace(/\u00a0/g, ' ').trim();
    if (!s) return null;
    // Pull the first numeric chunk (handles "8 GB", "12.4 inch", "5,000 mAh")
    const m = s.match(/-?\d+([.,]\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function _scoreFromTable(value, table) {
    if (value == null) return null;
    const s = String(value);
    for (const [re, score] of table) {
      if (re.test(s)) return score;
    }
    return null;
  }

  // Look through specs (flat + nested specSections) for the first
  // value whose key matches any of the given regexes.
  function _findSpec(specs, sections, regexList) {
    const tries = [];
    if (specs && typeof specs === 'object') {
      for (const [k, v] of Object.entries(specs)) tries.push([k, v]);
    }
    if (sections && typeof sections === 'object') {
      for (const sec of Object.values(sections)) {
        if (sec && typeof sec === 'object') {
          for (const [k, v] of Object.entries(sec)) tries.push([k, v]);
        }
      }
    }
    for (const [k, v] of tries) {
      const key = String(k).toLowerCase();
      for (const re of regexList) {
        if (re.test(key)) return { key: k, value: v };
      }
    }
    return null;
  }

  function _getNum(specs, sections, regexList) {
    const hit = _findSpec(specs, sections, regexList);
    return hit ? _toNum(hit.value) : null;
  }

  function _getStr(specs, sections, regexList) {
    const hit = _findSpec(specs, sections, regexList);
    return hit ? String(hit.value) : null;
  }

  function _hasBool(specs, sections, regexList) {
    const hit = _findSpec(specs, sections, regexList);
    if (!hit) return null;
    const v = String(hit.value).toLowerCase().trim();
    if (/^(var|yes|true|1|✓|✔|evet|destekler|var\.|✅)/.test(v)) return 1;
    if (/^(yok|no|false|0|—|-|✗|✘|hayır|hayir|desteklemez|❌)/.test(v)) return 0;
    return 1; // any non-empty value implies presence
  }

  function _yearOf(p) {
    const specs = p.specs || {}; const sections = p.specSections || {};
    const yearStr = _getStr(specs, sections, [/release|cikis|çıkış|launch|year|yil|yıl|tan[ıi]t[ıi]m/i]);
    if (yearStr) {
      const m = String(yearStr).match(/(20\d{2}|19\d{2})/);
      if (m) return parseInt(m[1], 10);
    }
    if (p.scrapedAt) {
      const d = new Date(p.scrapedAt);
      if (!isNaN(d.getFullYear())) return d.getFullYear();
    }
    if (p.createdAt) {
      const d = new Date(p.createdAt);
      if (!isNaN(d.getFullYear())) return d.getFullYear();
    }
    return null;
  }

  // Percentile rank (0-100): % of values strictly less than v
  function _percentile(v, sorted) {
    if (!sorted || !sorted.length) return 50;
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return (lo / sorted.length) * 100;
  }

  // Power curve: percentile -> 0-100 scaled finalScore
  function _scale(percentile) {
    const p = Math.max(0, Math.min(100, percentile));
    return 20 + 80 * Math.pow(p / 100, 0.75);
  }

  // Year decay: -3%/year from current year, floor 0.70
  function _yearDecay(year) {
    if (!year) return 1.0;
    const now = new Date().getFullYear();
    const age = Math.max(0, now - year);
    return Math.max(0.70, 1.0 - age * 0.03);
  }

  // ─────────────────────────────────────────────────────────────
  //  Per-category feature extractors
  //  Returns { features: { name -> raw 0-100 }, weights: { name -> w } }
  //  Only present features contribute; weights renormalize automatically.
  // ─────────────────────────────────────────────────────────────

  function extractFeatures(p) {
    const cat = String(p.category || '').toLowerCase().trim();
    const specs = p.specs || {}; const sections = p.specSections || {};

    // Universal extractors used across many cats
    const ram = _getNum(specs, sections, [/ram(?!\w)|memory|bellek/i]);
    const storage = _getNum(specs, sections, [/storage|depolama|hard ?disk|ssd|hdd|disk capacity/i]);
    const battery = _getNum(specs, sections, [/battery|pil|batarya|capacity.*mah/i]);
    const displaySize = _getNum(specs, sections, [/display ?size|ekran ?boyut|screen size|ekran/i]);
    const refresh = _getNum(specs, sections, [/refresh ?rate|yenileme|hz/i]);
    const resolutionStr = _getStr(specs, sections, [/resolution|çözünürlük|cozunurluk/i]);
    const resolution = (() => {
      if (!resolutionStr) return null;
      const m = String(resolutionStr).match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/);
      if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
      return null;
    })();
    const panel = _scoreFromTable(_getStr(specs, sections, [/panel ?type|panel|display ?type|ekran ?tipi/i]), PANELS);
    const camMain = _getNum(specs, sections, [/main ?camera|ana ?kamera|primary ?camera|arka ?kamera|rear ?camera/i]);
    const camFront = _getNum(specs, sections, [/front ?camera|selfie|ön ?kamera|on ?kamera/i]);
    const cpu = _scoreFromTable(_getStr(specs, sections, [/processor|işlemci|islemci|chipset|cpu|soc/i]), CHIPSETS);
    const gpu = _scoreFromTable(_getStr(specs, sections, [/graphics|gpu|ekran ?kart/i]), GPUS);
    const weight = _getNum(specs, sections, [/weight|ağırlık|agirlik/i]);
    const wifi = _scoreFromTable(_getStr(specs, sections, [/wi-?fi|wifi|kablosuz/i]), CONNECTIVITY.wifi);
    const bt = _scoreFromTable(_getStr(specs, sections, [/bluetooth/i]), CONNECTIVITY.bluetooth);
    const net = _scoreFromTable(_getStr(specs, sections, [/network|ağ ?bağlantısı|ag ?baglantisi|cellular|hücresel|hucresel|generation/i]), CONNECTIVITY.network);

    // Helpers
    const norm = (v, lo, hi) => v == null ? null : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

    // Defaults for cats without explicit table fall back here
    function generic() {
      const f = {};
      if (cpu != null) f.cpu = cpu;
      if (gpu != null) f.gpu = gpu;
      if (ram != null) f.ram = norm(ram, 2, 64);
      if (storage != null) f.storage = norm(storage, 16, 4000);
      if (battery != null) f.battery = norm(battery, 1500, 10000);
      if (displaySize != null) f.displaySize = norm(displaySize, 4, 17);
      if (refresh != null) f.refresh = norm(refresh, 60, 240);
      if (resolution != null) f.resolution = norm(resolution, 800 * 600, 3840 * 2160);
      if (panel != null) f.panel = panel;
      if (camMain != null) f.camera = norm(camMain, 8, 200);
      const w = { cpu: 0.22, gpu: 0.10, ram: 0.12, storage: 0.10, battery: 0.10, displaySize: 0.06, refresh: 0.06, resolution: 0.10, panel: 0.08, camera: 0.06 };
      return { features: f, weights: w };
    }

    // Smartphones / phones / tablets
    if (/phone|smartphone|tablet/i.test(cat)) {
      const f = {};
      if (cpu != null) f.cpu = cpu;
      if (ram != null) f.ram = norm(ram, 2, 24);
      if (storage != null) f.storage = norm(storage, 32, 2000);
      if (battery != null) f.battery = norm(battery, 2500, 7500);
      if (displaySize != null) f.displaySize = norm(displaySize, 4.5, 14);
      if (refresh != null) f.refresh = norm(refresh, 60, 165);
      if (resolution != null) f.resolution = norm(resolution, 720 * 1280, 1440 * 3200);
      if (panel != null) f.panel = panel;
      if (camMain != null) f.camera = norm(camMain, 8, 200);
      if (camFront != null) f.camFront = norm(camFront, 5, 60);
      if (net != null) f.network = net;
      const w = /tablet/i.test(cat)
        ? { cpu: 0.22, ram: 0.12, storage: 0.10, battery: 0.12, displaySize: 0.10, refresh: 0.06, resolution: 0.10, panel: 0.08, camera: 0.05, network: 0.05 }
        : { cpu: 0.22, ram: 0.10, storage: 0.08, battery: 0.10, displaySize: 0.04, refresh: 0.06, resolution: 0.08, panel: 0.08, camera: 0.16, camFront: 0.04, network: 0.04 };
      return { features: f, weights: w };
    }

    // Laptops / notebooks
    if (/laptop|notebook|macbook/i.test(cat)) {
      const f = {};
      if (cpu != null) f.cpu = cpu;
      if (gpu != null) f.gpu = gpu;
      if (ram != null) f.ram = norm(ram, 4, 128);
      if (storage != null) f.storage = norm(storage, 128, 4000);
      if (battery != null) f.battery = norm(battery, 2500, 9000);
      if (displaySize != null) f.displaySize = norm(displaySize, 11, 18);
      if (refresh != null) f.refresh = norm(refresh, 60, 240);
      if (resolution != null) f.resolution = norm(resolution, 1366 * 768, 3840 * 2400);
      if (panel != null) f.panel = panel;
      if (weight != null) f.weight = 100 - norm(weight, 0.8, 4.0);
      if (wifi != null) f.wifi = wifi;
      const w = { cpu: 0.25, gpu: 0.18, ram: 0.13, storage: 0.10, battery: 0.08, displaySize: 0.04, refresh: 0.04, resolution: 0.06, panel: 0.05, weight: 0.04, wifi: 0.03 };
      return { features: f, weights: w };
    }

    // Smartwatches / wearables
    if (/watch|wearable|smartband|akıllı|akilli/i.test(cat)) {
      const f = {};
      if (battery != null) f.battery = norm(battery, 200, 500);
      if (displaySize != null) f.displaySize = norm(displaySize, 1.0, 2.0);
      if (panel != null) f.panel = panel;
      const sensors = _hasBool(specs, sections, [/spo2|ecg|gps|nabız|heart/i]);
      if (sensors != null) f.sensors = sensors * 100;
      const w = { battery: 0.30, displaySize: 0.20, panel: 0.20, sensors: 0.30 };
      return { features: f, weights: w };
    }

    // Headphones / earbuds
    if (/headphone|earbud|airpod|kulakl/i.test(cat)) {
      const f = {};
      const anc = _hasBool(specs, sections, [/anc|aktif gürültü|gurultu|noise canc/i]);
      if (anc != null) f.anc = anc * 100;
      if (battery != null) f.battery = norm(battery, 4, 60); // hours
      const driver = _getNum(specs, sections, [/driver|sürücü|surucu/i]);
      if (driver != null) f.driver = norm(driver, 6, 50); // mm
      if (bt != null) f.bluetooth = bt;
      const codec = _hasBool(specs, sections, [/ldac|aptx|aac|lhdc/i]);
      if (codec != null) f.codec = codec * 100;
      const w = { anc: 0.25, battery: 0.20, driver: 0.20, bluetooth: 0.15, codec: 0.20 };
      return { features: f, weights: w };
    }

    // TVs / monitors
    if (/tv(?!\w)|television|monitor/i.test(cat)) {
      const f = {};
      if (displaySize != null) f.size = norm(displaySize, 24, 85);
      if (refresh != null) f.refresh = norm(refresh, 60, 240);
      if (resolution != null) f.resolution = norm(resolution, 1920 * 1080, 7680 * 4320);
      if (panel != null) f.panel = panel;
      const hdr = _hasBool(specs, sections, [/hdr10|dolby vision|hdr/i]);
      if (hdr != null) f.hdr = hdr * 100;
      const w = { size: 0.20, refresh: 0.20, resolution: 0.20, panel: 0.25, hdr: 0.15 };
      return { features: f, weights: w };
    }

    // Cameras (DSLR/mirrorless)
    if (/camera(?!\s*phone)/i.test(cat)) {
      const f = {};
      const mp = _getNum(specs, sections, [/megapixel|mp(?!s)|çözünürlük/i]);
      if (mp != null) f.mp = norm(mp, 12, 100);
      const iso = _getNum(specs, sections, [/iso/i]);
      if (iso != null) f.iso = norm(iso, 1600, 102400);
      const fps = _getNum(specs, sections, [/burst|fps|frame|kare/i]);
      if (fps != null) f.fps = norm(fps, 5, 60);
      const w = { mp: 0.30, iso: 0.30, fps: 0.40 };
      return { features: f, weights: w };
    }

    // Default: generic numeric blend
    return generic();
  }

  // ─────────────────────────────────────────────────────────────
  //  Score one product given a category-wide reference
  //  refScores: precomputed map { categoryKey: sortedRawScoresArray }
  //  Two-pass: first call collects raw scores, second computes percentile.
  // ─────────────────────────────────────────────────────────────

  function rawScore(p) {
    const { features, weights } = extractFeatures(p);
    const presentKeys = Object.keys(features);
    if (presentKeys.length < 2) return { raw: 0.5, presentKeys };
    let sumW = 0;
    for (const k of presentKeys) sumW += (weights[k] || 0);
    if (sumW <= 0) return { raw: 0.5, presentKeys };
    let acc = 0;
    for (const k of presentKeys) {
      const w = (weights[k] || 0) / sumW;
      acc += w * (features[k] / 100);
    }
    return { raw: Math.max(0, Math.min(1, acc)), presentKeys };
  }

  // Compute scores for an entire category in a single pass.
  // products: array of PB records all sharing the same category.
  // Returns array of { id, score, year, presentKeys, raw }
  function scoreCategory(products, opts) {
    opts = opts || {};
    const minSpecs = opts.minSpecs || 2;
    // 1st pass: raw scores
    const rows = products.map(p => {
      const { raw, presentKeys } = rawScore(p);
      return { p, raw, presentKeys, year: _yearOf(p) };
    });
    const rawSorted = rows.map(r => r.raw).sort((a, b) => a - b);
    // 2nd pass: percentile + scale + decay
    return rows.map(r => {
      let score;
      if (r.presentKeys.length < minSpecs) {
        score = 50; // neutral when too little data
      } else {
        const pct = _percentile(r.raw, rawSorted);
        const decay = _yearDecay(r.year);
        score = Math.round(_scale(pct) * decay);
      }
      score = Math.max(1, Math.min(100, score));
      return { id: r.p.id, name: r.p.name, score, year: r.year, presentKeys: r.presentKeys, raw: r.raw };
    });
  }

  global.ScoreEngine = {
    extractFeatures,
    rawScore,
    scoreCategory,
    yearOf: _yearOf,
    yearDecay: _yearDecay,
    percentile: _percentile,
    scale: _scale,
  };
})(typeof window !== 'undefined' ? window : globalThis);
