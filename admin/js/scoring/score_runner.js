// ═══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Tech Score Runner v7
//  3-phase progress (Load → Compute → Persist) + parallel writes
// ═══════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  let _running = false;
  let _abort = false;
  let _startTime = 0;

  // ─── UI helpers ─────────────────────────────────────────────
  function _slog(msg, type) {
    if (typeof slog === 'function') return slog(msg, type || 'info');
    console.log(`[score] ${msg}`);
  }
  function _setProgress(phase, cur, total, extra) {
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
  const SCORE_LOAD_FIELDS = [
    'id', 'name', 'brand', 'category', 'source', 'sourceUrl',
    'keySpecs',
    'techScore', 'specsCount', 'scrapedAt', 'created',
  ].join(',');

  async function _loadProducts(category) {
    const baseFilter = category ? `category="${category}"` : '';
    const perPage = 500;
    const loaded = [];

    _slog(`  • Load filter: ${baseFilter || '(all products)'}`);
    _slog(`  • Fields: ${SCORE_LOAD_FIELDS}`);
    _slog(`  • Page size: ${perPage} · cursor pagination by id`);

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
        _setProgress('Loading', Math.min(loaded.length, total || loaded.length), total || loaded.length, `page ${page}/${totalPages}`);
        _slog(`  ✓ page ${page}/${totalPages}: ${items.length} products · ${elapsed}s · total ${loaded.length}/${total} · cursor ${lastId}`);
        if (items.length < perPage || (total && loaded.length >= total)) break;
        page++;
        await _sleep(0);
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

  // ─── Parallel batch persist ──────────────────────────────────
  // Concurrent writers reduce wall time ~5× vs sequential, while still
  // respecting PB rate limits (10 in flight is safe for sqlite-backed PB).
  async function _persistInParallel(toUpdate, byId, concurrency, onProgress) {
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
          if (typeof allProducts !== 'undefined') {
            const m2 = allProducts.find(x => x.id === row.id);
            if (m2) m2.techScore = row.score;
          }
        } catch (e) {
          failed++;
          errors.push({ id: row.id, name: row.name, error: e.message });
        }
        onProgress(updated + failed, row);
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
    const concurrency = opts.concurrency || 20;
    const auto = !!opts.auto;

    _running = true; _abort = false; _startTime = Date.now();
    _hideSummary();
    if (!auto && typeof clearScraperLog === 'function') clearScraperLog();
    _slog(`🚀 Score Engine v7 started${category ? ' — category: ' + category : ' — all categories'}${auto ? ' · auto' : ''}`);

    // ── PHASE 1: LOAD ───────────────────────────────────────
    _setProgress('Loading', 0, 1);
    _slog('📥 [1/3] Loading products from PocketBase...');
    let products;
    try {
      products = await _loadProducts(category);
    } catch (e) {
      _slog(`✗ Load error: ${e.message}`, 'error');
      _running = false; return;
    }
    if (!products.length) {
      _slog('No products found.', 'warn');
      _running = false; return;
    }
    _setProgress('Loaded', products.length, products.length);
    _slog(`✓ ${products.length} products loaded`);

    // ── PHASE 2: COMPUTE ────────────────────────────────────
    _slog('🧮 [2/3] Calculating scores by category...');
    const groups = _groupByCategory(products);
    const groupKeys = Object.keys(groups);
    const allComputed = [];
    let gi = 0;
    for (const cat of groupKeys) {
      gi++;
      _setProgress(`Hesaplanıyor (${cat})`, gi, groupKeys.length);
      const scored = ScoreEngine.scoreCategory(groups[cat]);
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
      if (groupKeys.length > 1) await _sleep(0);
    }

    // Filter: only what actually changes (unless overwrite=true → force write all)
    const byId = new Map(products.map(p => [p.id, p]));
    const toUpdate = allComputed.filter(s => {
      const existing = byId.get(s.id);
      if (!existing) return false;
      if (overwrite) return true; // force re-persist every score
      if (existing.techScore != null && existing.techScore !== 0) return false;
      return existing.techScore !== s.score;
    });
    const unchanged = allComputed.length - toUpdate.length;

    // Top-3 winners log
    const top3 = _topN(allComputed, 3);
    if (top3.length) {
      _slog('🏆 Highest scores:');
      top3.forEach((t, i) => {
        _slog(`    ${i + 1}. ${t.name || t.id} — ${t.score} (${t.tier || '?'}, ${t.category})`);
      });
    }
    _slog(`📊 Calculation done: ${allComputed.length} products scored, ${toUpdate.length} changed, ${unchanged} unchanged`);

    if (!toUpdate.length) {
      _setProgress('Done', 1, 1);
      _showSummary(`<div><strong>✅ All scores are already current</strong> — ${allComputed.length} products checked · <strong>⏱️ ${((Date.now()-_startTime)/1000).toFixed(1)}s</strong></div>`);
      _running = false; return;
    }

    // ── PHASE 3: PERSIST ────────────────────────────────────
    _slog(`💾 [3/3] Writing to PocketBase + Typesense (${concurrency} parallel)...`);
    _setProgress('Writing', 0, toUpdate.length, `total ${products.length} products, ${unchanged} unchanged`);

    let lastLogged = 0;
    const result = await _persistInParallel(toUpdate, byId, concurrency, (done, lastRow) => {
      _setProgress('Writing', done, toUpdate.length, `total ${products.length} products, ${unchanged} unchanged`);
      // Log a sample every ~10% or every 100, whichever is smaller
      const step = Math.max(1, Math.min(100, Math.floor(toUpdate.length / 10)));
      if (done - lastLogged >= step || done === toUpdate.length) {
        lastLogged = done;
        const sample = lastRow ? ` · last: ${(lastRow.name || lastRow.id).slice(0, 40)} → ${lastRow.score}` : '';
        _slog(`  → ${done}/${toUpdate.length} written${sample}`);
      }
    });

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
  }

  function stopScoreEngine() {
    if (!_running) return;
    _abort = true;
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

  const _autoQueue = new Set();
  let _autoTimer = null;
  const AUTO_SCORE_FROM_PRODUCT_SAVE = false;
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
    const cats = [..._autoQueue].filter(Boolean);
    _autoQueue.clear();
    for (const cat of cats) {
      if (_abort) break;
      await startScoreEngine(cat, { overwrite: true, concurrency: 6, auto: true });
      await _sleep(250);
    }
  }
  global.qoraiQueueScoreUpdate = function (category) {
    if (!category) return;
    if (!AUTO_SCORE_FROM_PRODUCT_SAVE) return;
    if (global.qoraiAutoScoreSuppressed) return;
    _autoQueue.add(String(category));
    clearTimeout(_autoTimer);
    // Use a longer debounce while a scrape is active so we don't burn CPU
    // re-arming the timer for every saved product. 30s is plenty: the final
    // flush will catch the whole batch once the scrape finishes.
    const debounce = global.qoraiScrapeActive ? 30000 : 15000;
    _autoTimer = setTimeout(_flushAutoScoreQueue, debounce);
  };
  global.addEventListener?.('qorai:product-saved', ev => {
    const cat = ev?.detail?.product?.category || '';
    global.qoraiQueueScoreUpdate(cat);
  });
  global.qoraiCancelQueuedScoreUpdates = function () {
    _autoQueue.clear();
    clearTimeout(_autoTimer);
    _autoTimer = null;
    if (_running) stopScoreEngine();
  };
})(typeof window !== 'undefined' ? window : globalThis);
