// ═══════════════════════════════════════════════════════════════
//  COMPAIR ADMIN — Tech Score Runner v5
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

  // ─── Data ────────────────────────────────────────────────────
  async function _loadProducts(category) {
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

  // ─── Distribution helpers ────────────────────────────────────
  function _distribution(scored) {
    const buckets = { flagship: 0, 'upper-mid': 0, mid: 0, entry: 0, budget: 0, '?': 0 };
    let sum = 0, max = 0, min = 100, missingTotal = 0;
    for (const s of scored) {
      buckets[s.tier || '?'] = (buckets[s.tier || '?'] || 0) + 1;
      sum += s.score;
      if (s.score > max) max = s.score;
      if (s.score < min) min = s.score;
      missingTotal += (s.missing || []).length;
    }
    const avg = scored.length ? +(sum / scored.length).toFixed(1) : 0;
    const avgMissing = scored.length ? +(missingTotal / scored.length).toFixed(1) : 0;
    return { buckets, avg, max, min, avgMissing, count: scored.length };
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
    const concurrency = opts.concurrency || 10;

    _running = true; _abort = false; _startTime = Date.now();
    _hideSummary();
    if (typeof clearScraperLog === 'function') clearScraperLog();
    _slog(`🚀 Score Engine v5 başlatıldı${category ? ' — kategori: ' + category : ' — tüm kategoriler'}`);

    // ── PHASE 1: LOAD ───────────────────────────────────────
    _setProgress('Yükleniyor', 0, 1);
    _slog('📥 [1/3] PocketBase\'den ürünler çekiliyor…');
    let products;
    try {
      products = await _loadProducts(category);
    } catch (e) {
      _slog(`✗ Yükleme hatası: ${e.message}`, 'error');
      _running = false; return;
    }
    if (!products.length) {
      _slog('Hiç ürün yok.', 'warn');
      _running = false; return;
    }
    _setProgress('Yüklendi', products.length, products.length);
    _slog(`✓ ${products.length} ürün yüklendi`);

    // ── PHASE 2: COMPUTE ────────────────────────────────────
    _slog('🧮 [2/3] Skor hesaplanıyor (kategori bazlı)…');
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
      _slog(
        `  • ${cat}: ${dist.count} ürün — max ${dist.max}, ortalama ${dist.avg}, min ${dist.min} ` +
        `| flagship:${bk.flagship||0} upper:${bk['upper-mid']||0} mid:${bk.mid||0} entry:${bk.entry||0} budget:${bk.budget||0}` +
        (dist.avgMissing > 0 ? ` | eksik spec ort: ${dist.avgMissing}` : '')
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
      _slog('🏆 En yüksek skorlar:');
      top3.forEach((t, i) => {
        _slog(`    ${i + 1}. ${t.name || t.id} — ${t.score} (${t.tier || '?'}, ${t.category})`);
      });
    }
    _slog(`📊 Hesaplama bitti: ${allComputed.length} ürün skorlandı, ${toUpdate.length} değişti, ${unchanged} aynı kaldı`);

    if (!toUpdate.length) {
      _setProgress('Tamam', 1, 1);
      _showSummary(`<div><strong>✅ Tüm puanlar zaten güncel</strong> — ${allComputed.length} ürün kontrol edildi · <strong>⏱️ ${((Date.now()-_startTime)/1000).toFixed(1)}s</strong></div>`);
      _running = false; return;
    }

    // ── PHASE 3: PERSIST ────────────────────────────────────
    _slog(`💾 [3/3] PocketBase + Typesense'e yazılıyor (${concurrency} paralel)…`);
    _setProgress('Yazılıyor', 0, toUpdate.length, `toplam ${products.length} ürün, ${unchanged} değişmedi`);

    let lastLogged = 0;
    const result = await _persistInParallel(toUpdate, byId, concurrency, (done, lastRow) => {
      _setProgress('Yazılıyor', done, toUpdate.length, `toplam ${products.length} ürün, ${unchanged} değişmedi`);
      // Log a sample every ~10% or every 100, whichever is smaller
      const step = Math.max(1, Math.min(100, Math.floor(toUpdate.length / 10)));
      if (done - lastLogged >= step || done === toUpdate.length) {
        lastLogged = done;
        const sample = lastRow ? ` · son: ${(lastRow.name || lastRow.id).slice(0, 40)} → ${lastRow.score}` : '';
        _slog(`  → ${done}/${toUpdate.length} yazıldı${sample}`);
      }
    });

    // ── DONE ───────────────────────────────────────────────
    const seconds = ((Date.now() - _startTime) / 1000).toFixed(1);
    const finalDist = _distribution(allComputed);
    const fb = finalDist.buckets;

    _slog(`✅ Tamamlandı — ${result.updated} güncellendi, ${result.failed} hata, ${seconds}s`, result.failed ? 'warn' : 'success');

    const summaryHtml = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
        <div><strong>✅ ${result.updated}</strong> güncellendi</div>
        <div><strong>⏸️ ${unchanged}</strong> değişmedi</div>
        <div><strong>⚠️ ${result.failed}</strong> hata</div>
        <div><strong>⏱️ ${seconds}s</strong></div>
        <div style="opacity:.7">toplam ${products.length} ürün</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;font-size:12px">
        <span style="padding:2px 8px;background:#7C3AED;border-radius:10px">Flagship: ${fb.flagship||0}</span>
        <span style="padding:2px 8px;background:#5B21B6;border-radius:10px">Upper-Mid: ${fb['upper-mid']||0}</span>
        <span style="padding:2px 8px;background:#6366F1;border-radius:10px">Mid: ${fb.mid||0}</span>
        <span style="padding:2px 8px;background:#475569;border-radius:10px">Entry: ${fb.entry||0}</span>
        <span style="padding:2px 8px;background:#334155;border-radius:10px">Budget: ${fb.budget||0}</span>
        <span style="padding:2px 8px;background:#1f2937;border-radius:10px">Max ${finalDist.max} · Ort ${finalDist.avg} · Min ${finalDist.min}</span>
      </div>
      ${result.errors.length ? `<details style="margin-top:8px"><summary>${result.errors.length} hata detayları</summary><ul style="margin:8px 0 0 16px;font-size:12px">${result.errors.slice(0,30).map(e=>`<li><code>${e.id}</code> ${e.name||''} — ${e.error}</li>`).join('')}</ul></details>` : ''}
    `;
    _showSummary(summaryHtml);

    try { if (typeof renderProducts === 'function') renderProducts(); } catch (_) { }
    _running = false; _abort = false;
  }

  function stopScoreEngine() {
    if (!_running) return;
    _abort = true;
    _slog('⏹ Durdur isteği alındı, açık işlemler tamamlandıktan sonra duruyor…', 'warn');
  }

  // UI handlers
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
