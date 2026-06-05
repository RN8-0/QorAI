// ═══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Tech Score Runner v7
//  3-phase progress (Load → Compute → Persist) + parallel writes
// ═══════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  let _running = false;
  let _abort = false;
  let _startTime = 0;
  let _activeWorker = null;
  let _activeWorkerReject = null;
  let _activeWorkerCleanup = null;
  let _lastProgressPaint = 0;
  const SCORE_WORKER_CACHE_BUSTER = '20260531-fast-yield';

  // ─── UI helpers ─────────────────────────────────────────────
  function _slog(msg, type) {
    if (typeof slog === 'function') return slog(msg, type || 'info');
    console.log(`[score] ${msg}`);
  }
  function _setProgress(phase, cur, total, extra, force) {
    const now = Date.now();
    const done = total > 0 && cur >= total;
    if (!force && !done && now - _lastProgressPaint < 120) return;
    _lastProgressPaint = now;
    const bar = document.getElementById('scoreEngineProgressBar');
    const counter = document.getElementById('scoreEngineCounter');
    const pct = total > 0 ? (cur / total) * 100 : 0;
    if (bar) bar.style.width = `${pct}%`;
    if (counter) {
      const extraTxt = extra ? ` · ${extra}` : '';
      counter.textContent = `${phase}: ${cur} / ${total}${extraTxt} (${pct.toFixed(0)}%)`;
    }
  }
  function _showSummary(html) {
    const el = document.getElementById('scoreEngineSummary');
    if (el) { el.innerHTML = html; el.style.display = 'block'; }
  }
  function _hideSummary() {
    const el = document.getElementById('scoreEngineSummary');
    if (el) el.style.display = 'none';
  }
  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // MessageChannel-based yield. requestAnimationFrame + setTimeout(0) used to
  // throttle catastrophically when the admin tab was backgrounded:
  //   - rAF pauses entirely for hidden tabs
  //   - setTimeout clamps to 1000ms in most browsers when hidden
  //   - the runner could go from 4 ms/yield to ~1 s/yield, turning a
  //     6-min write phase into 30+ minutes (matches the 21:23 → 21:30 gap
  //     in the user's log: 100 products in 6 min while the tab was hidden).
  // MessageChannel posts are NOT throttled when the tab is hidden, so the
  // yield latency stays under 1 ms in either state. And when the tab is
  // genuinely hidden there is no UI to feed, so we skip yielding entirely.
  const _yieldChannel = (typeof MessageChannel === 'function') ? new MessageChannel() : null;
  const _yieldQueue = [];
  if (_yieldChannel) {
    _yieldChannel.port1.onmessage = () => {
      const cb = _yieldQueue.shift();
      if (cb) cb();
    };
  }
  function _yieldToUi() {
    // Tab hidden → no UI to paint, just continue. This is the single biggest
    // speedup for "I switched tabs and it crawled."
    if (typeof document !== 'undefined' && document.hidden) return Promise.resolve();
    if (!_yieldChannel) return new Promise(resolve => setTimeout(resolve, 0));
    return new Promise(resolve => {
      _yieldQueue.push(resolve);
      _yieldChannel.port2.postMessage(0);
    });
  }

  // Hold a screen wake lock during the run so OS-level throttling (battery
  // saver, mobile / dock display sleep) doesn't suspend the page mid-write.
  let _wakeLockHandle = null;
  async function _acquireWakeLock() {
    try {
      if (navigator?.wakeLock?.request) {
        _wakeLockHandle = await navigator.wakeLock.request('screen');
        _wakeLockHandle.addEventListener?.('release', () => { _wakeLockHandle = null; });
      }
    } catch (_) { /* not fatal — older browsers / permission denied */ }
  }
  async function _releaseWakeLock() {
    try { await _wakeLockHandle?.release?.(); } catch (_) {}
    _wakeLockHandle = null;
  }
  function _formatPbError(e) {
    const parts = [];
    if (e?.status) parts.push(`HTTP ${e.status}`);
    if (e?.url) parts.push(e.url);
    if (e?.message) parts.push(e.message);
    const data = e?.data || e?.response?.data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || '';
      if (msg && !parts.includes(msg)) parts.push(msg);
      const fields = data.data && typeof data.data === 'object'
        ? Object.entries(data.data).slice(0, 5).map(([k, v]) => `${k}: ${v?.message || JSON.stringify(v)}`).join(' | ')
        : '';
      if (fields) parts.push(fields);
    }
    return parts.filter(Boolean).join(' · ') || String(e || 'Unknown error');
  }
  async function _withHeartbeat(promise, label, everyMs) {
    const started = Date.now();
    const timer = setInterval(() => {
      const seconds = ((Date.now() - started) / 1000).toFixed(0);
      _slog(`  … ${label} still waiting (${seconds}s)`, 'warn');
    }, everyMs || 10000);
    try {
      return await promise;
    } finally {
      clearInterval(timer);
    }
  }

  // ─── Data ────────────────────────────────────────────────────
  // Score engine reads from specs / specsEn / specSections / multiLangSpecs /
  // keySpecs as a unified surface. Loading ONLY keySpecs (the old behavior)
  // made every product look "sparsely specced", confidence dropped below 0.45
  // and every score got clamped to 82 (the low-confidence evidence cap).
  // Loading the full spec surface restores the real 1–100 distribution.
  const SCORE_LOAD_FIELDS = [
    'id', 'name', 'brand', 'category', 'source', 'sourceUrl',
    'keySpecs', 'specs', 'specsEn', 'specSections', 'multiLangSpecs',
    'techScore', 'specsCount', 'scrapedAt', 'created',
  ].join(',');

  async function _loadProducts(category) {
    const baseFilter = category ? `category="${category}"` : '';
    const perPage = 250;
    const loaded = [];

    _slog(`  • Load filter: ${baseFilter || '(all products)'}`);
    _slog(`  • Fields: ${SCORE_LOAD_FIELDS}`);
    _slog(`  • Page size: ${perPage} · cursor pagination by id · UI-friendly batches`);

    try {
      _slog('  • Counting products with a lightweight query...');
      var total = await _withHeartbeat(
        pbCountWhere('products', baseFilter),
        'PocketBase count',
        10000,
      );
    } catch (e) {
      throw new Error(`count failed · ${_formatPbError(e)}`);
    }

    const totalPages = Math.max(1, Math.ceil((total || 0) / perPage));
    _slog(`  • PocketBase count: ${total} products · ~${totalPages} cursor pages`);

    let page = 1;
    let lastId = '';
    while (!_abort) {
      if (_abort) break;
      const started = Date.now();
      const cursorFilter = lastId ? `id>"${lastId.replace(/"/g, '\\"')}"` : '';
      const filter = [baseFilter, cursorFilter].filter(Boolean).join(' && ');
      try {
        const res = await _withHeartbeat(
          pbGetList('products', 1, perPage, {
            ...(filter ? { filter } : {}),
            fields: SCORE_LOAD_FIELDS,
            sort: 'id',
            skipTotal: true,
          }),
          `PocketBase page ${page}/${totalPages}`,
          10000,
        );
        const items = res.items || [];
        loaded.push(...items.map(item => ({ id: item.id, ...(typeof item.data === 'function' ? item.data() : item) })));
        if (!items.length) break;
        lastId = items[items.length - 1].id;
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        _setProgress('Loading', Math.min(loaded.length, total || loaded.length), total || loaded.length, `page ${page}/${totalPages}`, true);
        _slog(`  ✓ page ${page}/${totalPages}: ${items.length} products · ${elapsed}s · total ${loaded.length}/${total} · cursor ${lastId}`);
        if (items.length < perPage || (total && loaded.length >= total)) break;
        page++;
        await _yieldToUi();
      } catch (e) {
        throw new Error(`page ${page}/${totalPages} failed after ${((Date.now() - started) / 1000).toFixed(1)}s · ${_formatPbError(e)}`);
      }
    }
    return loaded;
  }
  function _groupByCategory(products) {
    const groups = {};
    for (const p of products) {
      const c = p.category || '_uncategorized';
      (groups[c] = groups[c] || []).push(p);
    }
    return groups;
  }

  // ─── Distribution helpers ────────────────────────────────────
  function _distribution(scored) {
    const buckets = { flagship: 0, 'upper-mid': 0, mid: 0, entry: 0, budget: 0, '?': 0 };
    let sum = 0, max = 0, min = 100, missingTotal = 0;
    let noAnchorCount = 0, bayesianTouchCount = 0;
    for (const s of scored) {
      buckets[s.tier || '?'] = (buckets[s.tier || '?'] || 0) + 1;
      sum += s.score;
      if (s.score > max) max = s.score;
      if (s.score < min) min = s.score;
      missingTotal += (s.missing || []).length;
      if (s.noAnchorCapped) noAnchorCount++;
      // Bayesian "touched" = pull strong enough to actually move the score >0.5pt
      if (s.bayesianBefore != null && s.cappedBase != null &&
          Math.abs(s.bayesianBefore - s.cappedBase) >= 0.5) {
        bayesianTouchCount++;
      }
    }
    const avg = scored.length ? +(sum / scored.length).toFixed(1) : 0;
    const avgMissing = scored.length ? +(missingTotal / scored.length).toFixed(1) : 0;
    return {
      buckets, avg, max, min, avgMissing, count: scored.length,
      noAnchorCount, bayesianTouchCount,
    };
  }
  function _topN(scored, n) {
    return [...scored].sort((a, b) => b.score - a.score).slice(0, n);
  }

  function _scoreWorkerUrl() {
    const url = new URL('js/scoring/score_worker.js', global.location?.href || document.baseURI);
    url.searchParams.set('v', SCORE_WORKER_CACHE_BUSTER);
    return url.href;
  }

  async function _scoreCategoryInWorker(cat, products) {
    if (!products || !products.length) return [];
    if (typeof global.Worker !== 'function') {
      _slog(`  ⚠ Worker unsupported; computing ${cat} on main thread`, 'warn');
      await _yieldToUi();
      return ScoreEngine.scoreCategory(products);
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const worker = new Worker(_scoreWorkerUrl());
      const timeoutMs = Math.max(120000, Math.min(600000, products.length * 250));
      const timer = setTimeout(() => {
        finish(reject, new Error(`Score worker timed out for ${cat} after ${(timeoutMs / 1000).toFixed(0)}s`));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        try { worker.terminate(); } catch (_) { }
        if (_activeWorker === worker) _activeWorker = null;
        if (_activeWorkerReject === reject) _activeWorkerReject = null;
        if (_activeWorkerCleanup === cleanup) _activeWorkerCleanup = null;
      }
      function finish(fn, value) {
        cleanup();
        fn(value);
      }

      _activeWorker = worker;
      _activeWorkerReject = reject;
      _activeWorkerCleanup = cleanup;
      worker.onmessage = ev => {
        const data = ev.data || {};
        if (data.requestId !== requestId) return;
        if (data.ok) {
          finish(resolve, data.scored || []);
        } else {
          finish(reject, new Error(data.error || data.stack || `Score worker failed for ${cat}`));
        }
      };
      worker.onerror = ev => {
        finish(reject, new Error(ev?.message || `Score worker crashed for ${cat}`));
      };
      worker.postMessage({ requestId, products });
    });
  }

  // ─── Parallel batch persist ──────────────────────────────────
  // Concurrent writers reduce wall time ~5× vs sequential, while still
  // respecting PB rate limits (10 in flight is safe for sqlite-backed PB).
  async function _persistInParallel(toUpdate, byId, concurrency, onProgress, adminProductById) {
    let cursor = 0;
    let updated = 0, failed = 0;
    const errors = [];

    async function worker() {
      while (!_abort) {
        const i = cursor++;
        if (i >= toUpdate.length) return;
        const row = toUpdate[i];
        try {
          await pbUpdateDoc('products', row.id, {
            techScore: row.score,
            techSubscores: {
              ...(row.subscores || {}),
              overall: row.score,
              confidence: row.confidence,
              tier: row.tier || null,
              anchorKey: row.anchorKey || null,
              evidence: row.evidence || null,
              engine: 'v7',
            },
            scoreUpdatedAt: new Date().toISOString(),
          });
          updated++;
          const mem = byId.get(row.id);
          if (mem) mem.techScore = row.score;
          const m2 = adminProductById?.get(row.id);
          if (m2) m2.techScore = row.score;
        } catch (e) {
          failed++;
          errors.push({ id: row.id, name: row.name, error: e.message });
        }
        onProgress(updated + failed, row);
        // Yield less aggressively. The old "every 25 writes" yield meant 6
        // workers all paused at the same time, and when the tab was hidden
        // the (clamped) setTimeout(0) added a ~1 s stall per pause — that's
        // why one screenshot batch showed 100 products in 6 minutes.
        // 100 writes between yields is fine; the writes themselves are
        // already async so the UI isn't starved while the tab is visible.
        if ((updated + failed) % 100 === 0) await _yieldToUi();
      }
    }

    const workers = [];
    for (let w = 0; w < concurrency; w++) workers.push(worker());
    await Promise.all(workers);
    return { updated, failed, errors };
  }

  // ─── Main ────────────────────────────────────────────────────
  /**
   * @param {string} category  empty = all categories
   * @param {object} opts      { overwrite, concurrency }
   */
  async function startScoreEngine(category, opts) {
    if (_running) { if (typeof toast === 'function') toast('Score engine already running', 'w'); return; }
    if (!global.ScoreEngine) { _slog('ScoreEngine not loaded', 'error'); return; }
    opts = opts || {};
    const overwrite = opts.overwrite !== false;
    const requestedConcurrency = Number(opts.concurrency || 10);
    const concurrency = Math.max(1, Math.min(16, Number.isFinite(requestedConcurrency) ? requestedConcurrency : 10));
    const auto = !!opts.auto;
    const onlyProductIds = new Set(
      []
        .concat(opts.onlyProductIds || [])
        .concat(opts.onlyProductId ? [opts.onlyProductId] : [])
        .map(id => String(id || '').trim())
        .filter(Boolean)
    );

    _running = true; _abort = false; _startTime = Date.now();
    _lastProgressPaint = 0;
    _hideSummary();
    _acquireWakeLock();
    if (!auto && typeof clearScraperLog === 'function') clearScraperLog();
    _slog(
      `🚀 Score Engine v7 started${category ? ' — category: ' + category : ' — all categories'}${auto ? ' · auto' : ''}` +
      (onlyProductIds.size ? ` · target ${onlyProductIds.size} product` : '')
    );
    _slog('⚙️ Heavy scoring now runs in a browser worker so the admin panel stays responsive.');

    // ── PHASE 1: LOAD ───────────────────────────────────────
    _setProgress('Loading', 0, 1, '', true);
    _slog('📥 [1/3] Loading products from PocketBase...');
    let products;
    try {
      products = await _loadProducts(category);
    } catch (e) {
      _slog(`✗ Load error: ${e.message}`, 'error');
      _running = false; _releaseWakeLock(); return;
    }
    if (!products.length) {
      _slog('No products found.', 'warn');
      _running = false; _releaseWakeLock(); return;
    }
    _setProgress('Loaded', products.length, products.length, '', true);
    _slog(`✓ ${products.length} products loaded`);

    // ── PHASE 2: COMPUTE ────────────────────────────────────
    _slog('🧮 [2/3] Calculating scores by category...');
    const groups = _groupByCategory(products);
    const groupKeys = Object.keys(groups);
    const allComputed = [];
    let gi = 0;
    for (const cat of groupKeys) {
      if (_abort) break;
      gi++;
      const categoryProducts = groups[cat];
      _setProgress(`Hesaplanıyor (${cat})`, gi - 1, groupKeys.length, `${categoryProducts.length} products · worker`, true);
      await _yieldToUi();
      let scored;
      try {
        scored = await _withHeartbeat(
          _scoreCategoryInWorker(cat, categoryProducts),
          `score worker ${cat}`,
          10000,
        );
      } catch (e) {
        if (_abort) break;
        _slog(`✗ Compute error (${cat}): ${e.message || e}`, 'error');
        _running = false; _releaseWakeLock(); return;
      }
      if (_abort) break;
      _setProgress(`Computed (${cat})`, gi, groupKeys.length, `${categoryProducts.length} products`, true);
      const dist = _distribution(scored);
      const bk = dist.buckets;
      const calibTags = [];
      if (dist.noAnchorCount > 0) {
        calibTags.push(`no-anchor cap: ${dist.noAnchorCount}`);
      }
      if (dist.bayesianTouchCount > 0) {
        calibTags.push(`bayes pull: ${dist.bayesianTouchCount}`);
      }
      _slog(
        `  • ${cat}: ${dist.count} products — max ${dist.max}, avg ${dist.avg}, min ${dist.min} ` +
        `| flagship:${bk.flagship||0} upper:${bk['upper-mid']||0} mid:${bk.mid||0} entry:${bk.entry||0} budget:${bk.budget||0}` +
        (dist.avgMissing > 0 ? ` | avg missing specs: ${dist.avgMissing}` : '') +
        (calibTags.length ? ` | ${calibTags.join(' · ')}` : '')
      );
      allComputed.push(...scored.map(s => ({ ...s, category: cat })));
      // Yield to UI thread between heavy categories
      if (groupKeys.length > 1) await _yieldToUi();
    }

    if (_abort) {
      _slog('⏹ Stopped before writing scores.', 'warn');
      _running = false; _abort = false; _releaseWakeLock(); return;
    }

    // Filter: only what actually changes (unless overwrite=true → force write all)
    const byId = new Map(products.map(p => [p.id, p]));
    const computedForTarget = onlyProductIds.size
      ? allComputed.filter(s => onlyProductIds.has(String(s.id || '')))
      : allComputed;
    const toUpdate = computedForTarget.filter(s => {
      const existing = byId.get(s.id);
      if (!existing) return false;
      if (overwrite) return true; // force re-persist every score
      if (existing.techScore != null && existing.techScore !== 0) return false;
      return existing.techScore !== s.score;
    });
    const unchanged = computedForTarget.length - toUpdate.length;

    // Top-3 winners log
    const top3 = _topN(allComputed, 3);
    if (top3.length) {
      _slog('🏆 Highest scores:');
      top3.forEach((t, i) => {
        _slog(`    ${i + 1}. ${t.name || t.id} — ${t.score} (${t.tier || '?'}, ${t.category})`);
      });
    }
    _slog(
      `📊 Calculation done: ${allComputed.length} products scored` +
      (onlyProductIds.size ? `, ${computedForTarget.length}/${onlyProductIds.size} target matched` : '') +
      `, ${toUpdate.length} changed, ${unchanged} unchanged`
    );

    if (!toUpdate.length) {
      _setProgress('Done', 1, 1);
      _showSummary(`<div><strong>✅ All scores are already current</strong> — ${computedForTarget.length || allComputed.length} products checked · <strong>⏱️ ${((Date.now()-_startTime)/1000).toFixed(1)}s</strong></div>`);
      _running = false; _releaseWakeLock(); return;
    }

    // ── PHASE 3: PERSIST ────────────────────────────────────
    _slog(`💾 [3/3] Writing to PocketBase + Typesense (${concurrency} parallel)...`);
    _setProgress('Writing', 0, toUpdate.length, `total ${products.length} products, ${unchanged} unchanged`, true);

    let lastLogged = 0;
    const adminProductById = (typeof allProducts !== 'undefined' && Array.isArray(allProducts))
      ? new Map(allProducts.map(p => [p.id, p]))
      : null;
    const result = await _persistInParallel(toUpdate, byId, concurrency, (done, lastRow) => {
      _setProgress('Writing', done, toUpdate.length, `total ${products.length} products, ${unchanged} unchanged`);
      // Log a sample every ~10% or every 100, whichever is smaller
      const step = Math.max(1, Math.min(100, Math.floor(toUpdate.length / 10)));
      if (done - lastLogged >= step || done === toUpdate.length) {
        lastLogged = done;
        const sample = lastRow ? ` · last: ${(lastRow.name || lastRow.id).slice(0, 40)} → ${lastRow.score}` : '';
        _slog(`  → ${done}/${toUpdate.length} written${sample}`);
      }
    }, adminProductById);

    // ── DONE ───────────────────────────────────────────────
    const seconds = ((Date.now() - _startTime) / 1000).toFixed(1);
    const finalDist = _distribution(allComputed);
    const fb = finalDist.buckets;

    _slog(`✅ Completed — ${result.updated} updated, ${result.failed} errors, ${seconds}s`, result.failed ? 'warn' : 'success');

    const summaryHtml = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
        <div><strong>✅ ${result.updated}</strong> updated</div>
        <div><strong>⏸️ ${unchanged}</strong> unchanged</div>
        <div><strong>⚠️ ${result.failed}</strong> errors</div>
        <div><strong>⏱️ ${seconds}s</strong></div>
        <div style="opacity:.7">total ${products.length} products</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;font-size:12px">
        <span style="padding:2px 8px;background:#7C3AED;border-radius:10px">Flagship: ${fb.flagship||0}</span>
        <span style="padding:2px 8px;background:#5B21B6;border-radius:10px">Upper-Mid: ${fb['upper-mid']||0}</span>
        <span style="padding:2px 8px;background:#6366F1;border-radius:10px">Mid: ${fb.mid||0}</span>
        <span style="padding:2px 8px;background:#475569;border-radius:10px">Entry: ${fb.entry||0}</span>
        <span style="padding:2px 8px;background:#334155;border-radius:10px">Budget: ${fb.budget||0}</span>
        <span style="padding:2px 8px;background:#1f2937;border-radius:10px">Max ${finalDist.max} · Avg ${finalDist.avg} · Min ${finalDist.min}</span>
      </div>
      ${result.errors.length ? `<details style="margin-top:8px"><summary>${result.errors.length} error details</summary><ul style="margin:8px 0 0 16px;font-size:12px">${result.errors.slice(0,30).map(e=>`<li><code>${e.id}</code> ${e.name||''} — ${e.error}</li>`).join('')}</ul></details>` : ''}
    `;
    _showSummary(summaryHtml);

    try { if (typeof renderProducts === 'function') renderProducts(); } catch (_) { }
    _running = false; _abort = false;
    _releaseWakeLock();
  }

  function stopScoreEngine() {
    if (!_running) return;
    _abort = true;
    _releaseWakeLock();
    if (_activeWorker) {
      const reject = _activeWorkerReject;
      const cleanup = _activeWorkerCleanup;
      if (cleanup) cleanup();
      else {
        try { _activeWorker.terminate(); } catch (_) { }
        _activeWorker = null;
        _activeWorkerReject = null;
        _activeWorkerCleanup = null;
      }
      if (reject) reject(new Error('Score engine stopped by user'));
    }
    _slog('⏹ Stop requested; stopping after in-flight operations finish...', 'warn');
  }

  // UI handlers
  global.runScoreEngineAll = function () {
    const overwrite = document.getElementById('scoreEngineOverwrite')?.checked !== false;
    startScoreEngine('', { overwrite });
  };
  global.runScoreEngineCategory = function () {
    const cat = document.getElementById('scoreEngineCategory')?.value || '';
    if (!cat) { if (typeof toast === 'function') toast('Select a category first', 'w'); return; }
    const overwrite = document.getElementById('scoreEngineOverwrite')?.checked !== false;
    startScoreEngine(cat, { overwrite });
  };
  global.stopScoreEngine = stopScoreEngine;
  global.startScoreEngine = startScoreEngine;

  const _autoQueue = new Map();
  let _autoTimer = null;
  // Turned ON 2026-05-31 per user request: every scraped/saved product fires
  // `qorai:product-saved`, the touched category goes into _autoQueue, and the
  // debounced flush re-scores only that category once the scrape settles. This
  // is the "scraper otomatik puanlasın" behaviour — the admin no longer has
  // to manually click Score Engine after a scrape batch.
  const AUTO_SCORE_FROM_PRODUCT_SAVE = true;
  async function _flushAutoScoreQueue() {
    // Defer when:
    //   - a manual score run is already in flight (`_running`)
    //   - OR a bulk scrape is active — running a 4000-product score
    //     calculation in parallel with the scraper was eating CPU + PB
    //     bandwidth and froze the admin UI for 2-3 minutes at a time.
    //     The queue is preserved; we'll flush once the scrape ends.
    if (_running || global.qoraiScrapeActive) {
      _autoTimer = setTimeout(_flushAutoScoreQueue, 15000);
      return;
    }
    const queued = [..._autoQueue.entries()].filter(([cat]) => cat);
    _autoQueue.clear();
    for (const [cat, productIds] of queued) {
      if (_abort) break;
      await startScoreEngine(cat, {
        overwrite: true,
        concurrency: 6,
        auto: true,
        onlyProductIds: [...(productIds || [])],
      });
      await _sleep(250);
    }
  }
  global.qoraiQueueScoreUpdate = function (category, opts) {
    if (!category) return;
    if (!AUTO_SCORE_FROM_PRODUCT_SAVE) return;
    if (global.qoraiAutoScoreSuppressed) return;
    const cat = String(category);
    const productId = String(opts?.productId || '').trim();
    if (!_autoQueue.has(cat)) _autoQueue.set(cat, new Set());
    if (productId) _autoQueue.get(cat).add(productId);
    clearTimeout(_autoTimer);
    // Use a longer debounce while a scrape is active so we don't burn CPU
    // re-arming the timer for every saved product. 30s is plenty: the final
    // flush will catch the whole batch once the scrape finishes.
    const debounce = opts?.immediate ? 750 : (global.qoraiScrapeActive ? 30000 : 15000);
    _autoTimer = setTimeout(_flushAutoScoreQueue, debounce);
  };
  global.addEventListener?.('qorai:product-saved', ev => {
    const cat = ev?.detail?.product?.category || '';
    const productId = ev?.detail?.id || ev?.detail?.product?.id || '';
    global.qoraiQueueScoreUpdate(cat, { productId });
  });
  global.qoraiCancelQueuedScoreUpdates = function () {
    _autoQueue.clear();
    clearTimeout(_autoTimer);
    _autoTimer = null;
    if (_running) stopScoreEngine();
  };
})(typeof window !== 'undefined' ? window : globalThis);
