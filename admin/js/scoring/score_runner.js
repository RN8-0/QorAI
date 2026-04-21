// ═══════════════════════════════════════════════════════════════
//  COMPAIR ADMIN — Tech Score Runner
//  Loads products from PB, scores them via ScoreEngine, persists
//  back to PB (which auto-mirrors to Typesense via pb_client hook).
// ═══════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  let _running = false;
  let _abort = false;
  let _startTime = 0;

  function _slog(msg, type) {
    if (typeof slog === 'function') return slog(msg, type || 'info');
    console.log(`[score] ${msg}`);
  }
  function _setProgress(cur, total) {
    const bar = document.getElementById('scoreEngineProgressBar');
    const counter = document.getElementById('scoreEngineCounter');
    if (bar) bar.style.width = total > 0 ? `${(cur / total) * 100}%` : '0%';
    if (counter) counter.textContent = `${cur} / ${total}`;
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

  async function _loadProducts(category) {
    // Always fetch fresh from PB to avoid stale/partial allProducts cache.
    const filter = category ? `category="${category}"` : '';
    const items = await pbGetAll('products', filter ? { filter } : {});
    return items.map(d => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d) }));
  }

  function _groupByCategory(products) {
    const groups = {};
    for (const p of products) {
      const c = p.category || '_uncategorized';
      (groups[c] = groups[c] || []).push(p);
    }
    return groups;
  }

  /**
   * Compute & persist tech scores.
   * @param {string} category  empty = all categories
   * @param {object} opts      { overwrite: bool, chunkSize: int, chunkDelayMs: int }
   */
  async function startScoreEngine(category, opts) {
    if (_running) { if (typeof toast === 'function') toast('Score engine already running', 'w'); return; }
    if (!global.ScoreEngine) { _slog('ScoreEngine not loaded', 'error'); return; }
    opts = opts || {};
    const overwrite = opts.overwrite !== false;
    const chunkSize = opts.chunkSize || 100;
    const chunkDelayMs = opts.chunkDelayMs == null ? 300 : opts.chunkDelayMs;

    _running = true; _abort = false; _startTime = Date.now();
    _hideSummary();
    if (typeof clearScraperLog === 'function') clearScraperLog();
    _slog(`Score Engine v4 starting${category ? ' for ' + category : ' (all categories)'}…`);

    let products;
    try {
      products = await _loadProducts(category);
    } catch (e) {
      _slog(`Failed to load products: ${e.message}`, 'error');
      _running = false; return;
    }
    if (!products.length) {
      _slog('No products to score.', 'warn');
      _running = false; return;
    }
    _slog(`Loaded ${products.length} products. Grouping by category…`);

    const groups = _groupByCategory(products);
    const allComputed = [];
    for (const [cat, list] of Object.entries(groups)) {
      const scored = ScoreEngine.scoreCategory(list);
      allComputed.push(...scored.map(s => ({ ...s, category: cat })));
      _slog(`  • ${cat}: ${scored.length} computed`);
    }

    // Filter to only updates that change the score (or all when overwrite)
    const byId = new Map(products.map(p => [p.id, p]));
    const toUpdate = allComputed.filter(s => {
      const existing = byId.get(s.id);
      if (!existing) return false;
      if (!overwrite && (existing.techScore != null && existing.techScore !== 0)) return false;
      return existing.techScore !== s.score;
    });

    _slog(`Persisting ${toUpdate.length} score changes (PB → Typesense)…`);
    _setProgress(0, toUpdate.length);

    let updated = 0, failed = 0;
    const errors = [];
    for (let i = 0; i < toUpdate.length && !_abort; i++) {
      const row = toUpdate[i];
      try {
        await pbUpdateDoc('products', row.id, {
          techScore: row.score,
          scoreUpdatedAt: new Date().toISOString(),
        });
        updated++;
        // Sync in-memory cache so UI reflects immediately
        const mem = byId.get(row.id);
        if (mem) mem.techScore = row.score;
        if (typeof allProducts !== 'undefined') {
          const m2 = allProducts.find(x => x.id === row.id);
          if (m2) m2.techScore = row.score;
        }
      } catch (e) {
        failed++;
        errors.push({ id: row.id, name: row.name, error: e.message });
        _slog(`  ✗ ${row.name || row.id}: ${e.message}`, 'error');
      }
      _setProgress(i + 1, toUpdate.length);
      // Inter-chunk pacing
      if ((i + 1) % chunkSize === 0 && i + 1 < toUpdate.length) {
        _slog(`  — ${i + 1}/${toUpdate.length} done, pausing ${chunkDelayMs}ms`);
        await _sleep(chunkDelayMs);
      }
    }

    const seconds = ((Date.now() - _startTime) / 1000).toFixed(1);
    const summaryParts = [
      `<div><strong>✅ ${updated}</strong> güncellendi`,
      `<strong>⚠️ ${failed}</strong> hata`,
      `<strong>⏱️ ${seconds}s</strong></div>`,
    ];
    if (errors.length) {
      const list = errors.slice(0, 20).map(e => `<li><code>${e.id}</code> — ${e.error}</li>`).join('');
      summaryParts.push(`<details style="margin-top:8px"><summary>${errors.length} hata detayları</summary><ul style="margin:8px 0 0 16px;font-size:12px">${list}</ul></details>`);
    }
    _showSummary(summaryParts.join(' | '));
    _slog(`Score Engine done — updated ${updated}, failed ${failed}, ${seconds}s`, updated > 0 ? 'success' : 'info');

    // Refresh UI list if rendering is available
    try { if (typeof renderProducts === 'function') renderProducts(); } catch (_) { }

    _running = false; _abort = false;
  }

  function stopScoreEngine() {
    if (!_running) return;
    _abort = true;
    _slog('Stop requested, finishing current item…', 'warn');
  }

  // UI handlers (wired to buttons in admin/index.html)
  global.runScoreEngineAll = function () {
    const overwrite = document.getElementById('scoreEngineOverwrite')?.checked !== false;
    startScoreEngine('', { overwrite });
  };
  global.runScoreEngineCategory = function () {
    const cat = document.getElementById('scoreEngineCategory')?.value || '';
    if (!cat) { if (typeof toast === 'function') toast('Önce kategori seç', 'w'); return; }
    const overwrite = document.getElementById('scoreEngineOverwrite')?.checked !== false;
    startScoreEngine(cat, { overwrite });
  };
  global.stopScoreEngine = stopScoreEngine;
  global.startScoreEngine = startScoreEngine;
})(typeof window !== 'undefined' ? window : globalThis);
