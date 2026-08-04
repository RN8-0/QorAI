// ═══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — OTOMATİK KEŞİF KOŞUSU (headless orchestrator)
//
//  Neden var: yeni Epey ürünlerini siteye almanın TEK yolu bu admin
//  panelini açıp "Start Scraping" → "Translate" → "Score Engine"
//  düğmelerine sırayla basmaktı. Bütün boru hattı (URL toplama,
//  tekrar-eleme, detay çekme, sözlük çevirisi, teknik puan) tarayıcı
//  tarafında yaşıyor; Node'a taşımak ikinci bir gerçek kaynak yaratır
//  ve iki uygulama sürekli birbirinden ayrışır.
//
//  Bunun yerine: aynı sayfayı Puppeteer başsız açar ve BURADAKİ tek
//  fonksiyonu çağırır (scripts/auto_discover.js). Böylece elle koşu ile
//  gece koşusu BİREBİR aynı kodu çalıştırır.
//
//  Zincir:  scrape (yeni ürünler) → çeviri (TR→EN/DE) → teknik puan
//  Fiyatlar zincirin dışında: gece 03:10'daki fiyat görevi (Epey→Amazon)
//  yeni ürünleri kendi keşif pass'inde toplar (bkz. price_refresh.cmd).
// ═══════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  const AUTO_RUN_BUILD = '2026-08-02';

  function log(msg, type) {
    const line = `[auto-run] ${msg}`;
    // Node tarafı console üzerinden okuyor; slog da panelde göstersin.
    console.log(line);
    if (typeof slog === 'function') { try { slog(line, type || 'info'); } catch (_) { /* yok say */ } }
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function waitFor(label, fn, timeoutMs = 180000, stepMs = 500) {
    const t0 = Date.now();
    for (;;) {
      let ok = false;
      try { ok = !!(await fn()); } catch (_) { ok = false; }
      if (ok) return true;
      if (Date.now() - t0 > timeoutMs) throw new Error(`zaman aşımı: ${label}`);
      await sleep(stepMs);
    }
  }

  function setInput(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setCheckbox(id, checked) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.checked = !!checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // İstenen kategorileri işaretle. 'all' → Epey'i destekleyen HER kategori.
  function selectCategories(wanted) {
    const boxes = [...document.querySelectorAll('#scrapeCategoryChecklist input[type="checkbox"]')];
    if (!boxes.length) return { selected: [], skipped: [] };
    const all = String(wanted || 'all').toLowerCase() === 'all';
    const want = all ? null : new Set((Array.isArray(wanted) ? wanted : String(wanted).split(',')).map((s) => String(s).trim()).filter(Boolean));
    const selected = [];
    const skipped = [];
    for (const cb of boxes) {
      const id = String(cb.value || '').trim();
      const eligible = !cb.disabled && (all || want.has(id));
      cb.checked = eligible;
      if (!eligible && want && want.has(id)) skipped.push(id);
      if (eligible) selected.push(id);
    }
    if (typeof updateScrapeCategorySelectedCount === 'function') updateScrapeCategorySelectedCount();
    // Tek-kategori seçicisi boş kalmalı: dolu olursa startBulkScrape onu
    // "seçili kategori" sanıp checklist'i yok sayar.
    const sel = document.getElementById('scrapeCategory');
    if (sel) sel.value = '';
    return { selected, skipped };
  }

  // ── 0) OTURUM ───────────────────────────────────────────────────
  // index.html betikleri DİNAMİK olarak yüklüyor (async=false). Bu betikler
  // DOMContentLoaded'ı GECİKTİRMEZ: olay çoğu zaman app.js daha yüklenmeden
  // ateşleniyor, dolayısıyla app.js'teki "oturumu geri yükle" dinleyicisi hiç
  // çalışmıyor ve panel giriş ekranında kalıyor — token geçerli olsa bile.
  // (Ölçüldü: authStore.isValid=true iken appContainer display:none.)
  // Başsız koşu buna bel bağlayamaz; oturum geçerliyse paneli biz açıyoruz.
  async function ensureSession() {
    await waitFor('admin betikleri', () => typeof getPb === 'function' && typeof showAdminApp === 'function', 120000);
    const app = document.getElementById('appContainer');
    if (app && app.style.display !== 'none') return;
    const pb = getPb();
    if (!pb.authStore || !pb.authStore.isValid) {
      throw new Error('PocketBase oturumu geçersiz — superuser token yüklenmedi');
    }
    const rec = pb.authStore.record || pb.authStore.model || {};
    const email = String(rec.email || sessionStorage.getItem('admin_email') || 'auto-run');
    log(`oturum geri yükleniyor (${email})`);
    showAdminApp(email);
    await waitFor('panel açılışı', () => document.getElementById('appContainer')?.style.display !== 'none', 60000);
  }

  // ── 1) KEŞİF + ÇEKME ────────────────────────────────────────────
  async function runScrape(opts) {
    if (typeof startBulkScrape !== 'function') throw new Error('scraper modülü yüklenmedi');
    if (typeof checkProxy === 'function' && !(await checkProxy())) {
      throw new Error('yerel scraper proxy yanıt vermiyor (localhost:3456)');
    }

    setInput('scrapeSource', 'epey');
    if (typeof updateScrapeSourceUI === 'function') { try { updateScrapeSourceUI(); } catch (_) { /* yok say */ } }
    setInput('scrapeMaxProducts', opts.limit);
    setInput('scrapeDelay', opts.delay);
    setInput('scrapeConcurrency', opts.concurrency);
    // Gece koşusu NOKTA ATIŞI yapar: her kategorinin en-yeni listesinden yalnız
    // yeni ürünler. Tam katalog taraması (collectAll) yalnız elle istenirse.
    setCheckbox('scrapeNewestOnly', opts.newestOnly !== false);
    setInput('scrapeNewestPages', opts.newestPages);
    setCheckbox('scrapeAllSelectedProducts', opts.newestOnly === false && opts.collectAll === true);

    const picked = selectCategories(opts.categories);
    if (!picked.selected.length) throw new Error('Epey scrape için uygun kategori bulunamadı');
    if (picked.skipped.length) log(`Epey yolu tanımlı olmayan kategoriler atlandı: ${picked.skipped.join(', ')}`, 'warn');
    log(`${picked.selected.length} kategori · paralel ${opts.concurrency} · ` +
      (opts.newestOnly !== false ? `NOKTA ATIŞI (en fazla ${opts.newestPages} sayfa/kategori)` : 'TAM KATALOG'));

    global.qoraiLastScrapeTotals = null;
    await startBulkScrape();
    // startBulkScrape hata durumunda erken dönebiliyor; koşunun gerçekten
    // bittiğinden emin ol (Stop düğmesi gizlenene kadar bekle).
    await waitFor('scrape bitişi', () => document.getElementById('btnStopScrape')?.style.display === 'none', 10000, 250)
      .catch(() => { /* düğme yoksa dert etme */ });

    const totals = global.qoraiLastScrapeTotals || { added: 0, updated: 0, skipped: 0, errors: 0, categories: [] };
    log(`scrape bitti — ${totals.added} eklendi · ${totals.updated} güncellendi · ${totals.skipped} atlandı · ${totals.errors} hata`,
      totals.errors ? 'warn' : 'success');
    return totals;
  }

  // ── 1b) HEDEFLİ ÇEKME (nabız izleyicisinden gelen URL'ler) ──────
  // Hiç TARAMA yok: epey_watch.js ana sayfadan yeni ürün adreslerini bulur ve
  // buraya verir. Kategoriyi URL yolundan çözüp (findCategoryByEpeyUrl) doğrudan
  // çekeriz. Kategori eşleşmiyorsa ürün BİZE AİT DEĞİLDİR (Epey'de bizde
  // olmayan onlarca kategori var: daire-testere, tilki-kuyrugu…) — atlanır.
  async function runScrapeUrls(urls, opts) {
    if (typeof sequentialScrape !== 'function') throw new Error('scraper modülü yüklenmedi');
    if (typeof checkProxy === 'function' && !(await checkProxy())) {
      throw new Error('yerel scraper proxy yanıt vermiyor (localhost:3456)');
    }
    setInput('scrapeConcurrency', opts.concurrency);
    const byCat = new Map();
    const unknown = [];
    for (const raw of urls) {
      const url = typeof normalizeEpeyProductUrl === 'function' ? normalizeEpeyProductUrl(raw) : String(raw || '').trim();
      if (!url) continue;
      const cat = typeof findCategoryByEpeyUrl === 'function' ? findCategoryByEpeyUrl(url) : null;
      if (!cat || !cat.id || cat.scrapeDisabled) { unknown.push(url); continue; }
      if (!byCat.has(cat.id)) byCat.set(cat.id, []);
      byCat.get(cat.id).push({ url, techScore: null, categoryId: cat.id });
    }
    if (unknown.length) log(`${unknown.length} adres bizde olmayan kategoride — atlandı`, 'warn');
    if (!byCat.size) {
      log('hedeflenecek ürün kalmadı');
      return { added: 0, updated: 0, skipped: 0, errors: 0, categories: [] };
    }

    const totals = { added: 0, updated: 0, skipped: 0, errors: 0 };
    const scoreCats = new Set();
    global.qoraiScrapeActive = true;
    global.qoraiAutoScoreSuppressed = true;
    try {
      for (const [catId, items] of byCat) {
        log(`hedefli çekme · ${catId}: ${items.length} ürün`);
        const res = await sequentialScrape(items, catId, opts.delay, opts.concurrency, { skipPreload: true });
        totals.added += res.added || 0;
        totals.updated += res.updated || 0;
        totals.skipped += res.skipped || 0;
        totals.errors += res.errors || 0;
        if ((res.added || 0) + (res.updated || 0) > 0) scoreCats.add(catId);
      }
    } finally {
      global.qoraiScrapeActive = false;
    }
    log(`hedefli çekme bitti — ${totals.added} eklendi · ${totals.skipped} zaten vardı · ${totals.errors} hata`,
      totals.errors ? 'warn' : 'success');
    return { ...totals, categories: [...scoreCats] };
  }

  // ── 2) ÇEVİRİ (TR → EN/DE) ──────────────────────────────────────
  // Bulk scrape ürünleri HAM (Türkçe) kaydeder; çeviri ayrı adımdır ve
  // zaten çevrilmiş ürünlere DOKUNMAZ (bkz. _fetchDictionaryProducts →
  // _needsTranslation). Yani her gece yalnız yeni gelenler çevrilir.
  // `categories` verilirse YALNIZ onlar çevrilir. Nabız modunda bu şart:
  // `__all_epey__` çevrilecek ürünü bulmak için 106k ürünü 429 sayfada tarıyor
  // (~4 dk) — 5 yeni ürün için her 15 dakikada bir bunu yapmak anlamsız.
  async function runTranslate(categories) {
    if (typeof startCategoryTranslation !== 'function') throw new Error('çeviri modülü yüklenmedi');
    const targets = Array.isArray(categories) && categories.length ? categories : ['__all_epey__'];
    for (const cat of targets) {
      if (!setInput('dictXlateCategory', cat)) throw new Error('çeviri kategori seçicisi bulunamadı');
      log(`çeviri: ${cat === '__all_epey__' ? 'tüm Epey' : cat} (yalnız çevrilmemişler)`);
      await startCategoryTranslation();
      await waitFor('çeviri bitişi', () => {
        const stop = document.getElementById('btnDictXlateStop');
        return !stop || stop.style.display === 'none';
      }, 30000, 500).catch(() => { /* düğme yoksa dert etme */ });
    }
    log('çeviri adımı tamam', 'success');
  }

  // ── 3) TEKNİK PUAN ──────────────────────────────────────────────
  // Scrape sırasında otomatik puanlama BİLEREK bastırılıyor (CPU/PB
  // yükü). Burada dokunulan kategoriler için tek tek koşturuyoruz.
  async function runScore(categories) {
    if (typeof startScoreEngine !== 'function') throw new Error('score engine yüklenmedi');
    const cats = [...new Set((categories || []).map((c) => String(c || '').trim()).filter(Boolean))];
    if (!cats.length) { log('puanlanacak kategori yok (yeni ürün gelmedi)'); return 0; }
    global.qoraiAutoScoreSuppressed = false;
    try { global.qoraiCancelQueuedScoreUpdates?.(); } catch (_) { /* yok say */ }
    for (const cat of cats) {
      log(`teknik puan: ${cat}`);
      try {
        await startScoreEngine(cat, { overwrite: true, concurrency: 6, auto: true });
      } catch (e) {
        log(`teknik puan hatası (${cat}): ${e.message}`, 'warn');
      }
      await sleep(500);
    }
    log(`teknik puan tamam — ${cats.length} kategori`, 'success');
    return cats.length;
  }

  // ── ORKESTRA ────────────────────────────────────────────────────
  global.qoraiAutoRun = async function qoraiAutoRun(userOpts) {
    const opts = Object.assign({
      categories: 'all',
      limit: 100000,
      delay: 0,
      concurrency: 24,
      newestOnly: true,   // gece koşusunun varsayılanı: yalnız yeni ürünler
      newestPages: 8,
      collectAll: false,  // tam katalog taraması yalnız açıkça istenirse
      translate: true,
      score: true,
    }, userOpts || {});

    const startedAt = Date.now();
    const result = {
      build: AUTO_RUN_BUILD,
      startedAt: new Date(startedAt).toISOString(),
      ok: false,
      scrape: null,
      translated: false,
      scoredCategories: 0,
      error: '',
    };

    try {
      log(`build ${AUTO_RUN_BUILD} · otomatik keşif koşusu başlıyor`);
      await ensureSession();
      if (typeof showView === 'function') showView('scraper');
      // Yalnız-çeviri modu: scrape hiç yapılmaz. Çeviri sağlayıcısı kapalıyken
      // yarım çevrilmiş ürünleri (Türkçe kalıntı) yeniden çevirmek için.
      const xlateOnly = String(opts.translateOnly || '').split(',').map((s) => s.trim()).filter(Boolean);
      // Nabız modu (epey_watch.js'ten gelen adresler): kategori checklist'i
      // gerekmez, kategori URL yolundan çözülür.
      const urlMode = !xlateOnly.length && Array.isArray(opts.urls) && opts.urls.length > 0;
      if (!urlMode && !xlateOnly.length) {
        // Checklist yalnız kategori seçimli koşuda gerekiyor. Nabız modunda
        // kategori URL yolundan (statik QorAiCategories listesi) çözüldüğü için
        // 47 kategorinin PB sayaçlarını beklemenin anlamı yok.
        if (typeof populateScraperCategories === 'function') await populateScraperCategories().catch(() => {});
        await waitFor('kategori listesi', () => document.querySelectorAll('#scrapeCategoryChecklist input[type="checkbox"]').length > 0, 120000);
      }

      result.scrape = xlateOnly.length
        ? { added: 0, updated: 0, skipped: 0, errors: 0, categories: xlateOnly }
        : (urlMode ? await runScrapeUrls(opts.urls, opts) : await runScrape(opts));

      const touched = (result.scrape && result.scrape.categories) || [];
      // Nabız modunda HİÇ yeni ürün girmediyse çeviri/puan adımlarına girme.
      // (Aksi hâlde boş kategori listesi `__all_epey__`e düşüp 106k ürünü 429
      // sayfada tarıyordu — 15 dakikada bir tekrarlanacak bir iş değil.)
      const nothingNew = urlMode && touched.length === 0;
      if (nothingNew) {
        log('yeni ürün girmedi — çeviri ve puanlama atlandı');
      } else {
        if (opts.translate !== false) {
          // Nabız/yalnız-çeviri modunda dokunulan kategoriler; gece koşusunda
          // tüm Epey (yarım kalmış ürünleri de toparlasın diye).
          try { await runTranslate((urlMode || xlateOnly.length) ? touched : null); result.translated = true; }
          catch (e) { log(`çeviri adımı atlandı: ${e.message}`, 'warn'); }
        }
        if (opts.score !== false) {
          try { result.scoredCategories = await runScore(touched); }
          catch (e) { log(`puanlama adımı atlandı: ${e.message}`, 'warn'); }
        }
      }
      result.ok = true;
    } catch (e) {
      result.error = e && e.message ? e.message : String(e);
      log(`KOŞU HATASI: ${result.error}`, 'error');
    }
    result.durationSec = Math.round((Date.now() - startedAt) / 1000);
    result.finishedAt = new Date().toISOString();
    global.qoraiAutoRunResult = result;
    log(`koşu bitti (${result.durationSec}s) — ${result.ok ? 'tamam' : 'HATA: ' + result.error}`, result.ok ? 'success' : 'error');
    return result;
  };

  global.qoraiAutoRunBuild = AUTO_RUN_BUILD;
})(typeof window !== 'undefined' ? window : globalThis);
