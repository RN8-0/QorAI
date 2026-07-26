// ══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Blog (articles collection) · PRO EDİTÖR v2
//
//  Bölümler:
//   1. state + utils
//   2. injected styles (tam tasarım — liste + editör + modallar)
//   3. markdown → HTML (marked CDN + yerleşik fallback)
//   4. LİSTE görünümü (arama / durum filtresi / kopyala)
//   5. ŞABLON galerisi (yeni makale)
//   6. EDİTÖR (iki kolon: içerik + yayın/SEO kenar çubuğu,
//      otokayıt, kelime sayısı, Google snippet önizleme, checklist)
//   7. RTE (Quill + HTML kaynak modu — tablolar için)
//   8. İÇE AKTAR (Markdown / JSON 3-dil / Claude prompt üretici)
//   9. içerik öğeleri (ürün/abonelik/özel + blok editörü) — veri modeli
//      website ile birebir aynı kaldı
//  10. kaydet / yayınla / önizleme / yorumlar
//
//  Veri modeli DEĞİŞMEDİ: PB `articles` alanları ve products[].blocks
//  yapısı websitenin BlogPost.jsx'inin beklediğiyle aynı.
// ══════════════════════════════════════════════════════════════
(function () {
  const LANGS = [['tr', '🇹🇷 Türkçe'], ['en', '🇬🇧 English'], ['de', '🇩🇪 Deutsch']];
  const SITE = 'https://qorai.net';
  let _editing = null;
  let _products = [];
  let _lang = 'tr';
  let _searchTimer = null;
  let _subSearchTimer = null;
  let _pickKind = 'product';
  let _stats = {};    // slug -> {view, like, read, dur}
  let _cats = [];     // site category tokens for the datalist
  let _bodyQ = null;  // Quill — intro/body
  let _conclQ = null; // Quill — conclusion
  let _srcMode = { body: false, concl: false }; // HTML kaynak modu
  let _items = [];    // liste cache
  let _listQ = '';
  let _listStatus = 'all';
  let _dirty = false;
  let _autoTimer = null;
  let _saving = false;
  let _lastSavedJson = '';
  let _importReport = null; // içe aktarma ürün eşleştirme raporu
  let _pendingBackup = null; // düzenleme açılışında bulunan daha yeni yerel yedek

  // ── utils ─────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slugify(v) {
    return String(v || '').trim().toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  // PB "2026-06-21 10:11:00.000Z" → <input type="datetime-local"> değeri
  function toDtLocal(v) {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const root = () => document.getElementById('blogAdminRoot');
  function pbFileUrl(rec, fname) {
    if (!rec || !fname) return '';
    const coll = rec.collectionId || rec.collectionName || 'articles';
    return getPb().baseUrl.replace(/\/$/, '') + '/api/files/' + coll + '/' + rec.id + '/' + fname;
  }
  function stripHtml(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; }
  function wordCount(s) { return (String(s || '').trim().match(/\S+/g) || []).length; }

  // ── styles ────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('blogAdminStyles')) return;
    const s = document.createElement('style'); s.id = 'blogAdminStyles';
    s.textContent = `
      /* liste */
      .ba-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
      .ba-search{flex:1;min-width:220px;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:10px;padding:10px 14px;color:inherit;font:inherit}
      .ba-chip{padding:7px 14px;border-radius:20px;border:1px solid var(--border,#2a3140);background:transparent;color:inherit;cursor:pointer;font-size:13px;font-weight:600}
      .ba-chip.on{background:#7c3aed;border-color:#7c3aed;color:#fff}
      .ba-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
      .ba-card{background:var(--surface,#161b24);border:1px solid var(--border,#262c38);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:border-color .15s, transform .1s}
      .ba-card:hover{border-color:#7c3aed66;transform:translateY(-2px)}
      .ba-card-cover{height:140px;background:#0e131a;display:flex;align-items:center;justify-content:center;position:relative}
      .ba-card-cover img{width:100%;height:100%;object-fit:cover}
      .ba-card-cover .ba-badge{position:absolute;top:10px;left:10px}
      .ba-card-langs{position:absolute;top:10px;right:10px;display:flex;gap:4px}
      .ba-lang-dot{width:22px;height:22px;border-radius:50%;background:#0e131af0;border:1px solid #2a3140;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;color:#64748b}
      .ba-lang-dot.on{color:#4ade80;border-color:#16a34a66}
      .ba-card-b{padding:12px 14px;display:flex;flex-direction:column;gap:8px;flex:1}
      .ba-card-title{font-weight:700;font-size:15px;line-height:1.35}
      .ba-card-meta{display:flex;gap:10px;font-size:12px;opacity:.7;flex-wrap:wrap}
      .ba-card-actions{display:flex;gap:6px;margin-top:auto;flex-wrap:wrap}
      .ba-badge{font-size:11px;padding:3px 9px;border-radius:20px;background:#334155;color:#e2e8f0;font-weight:700}
      .ba-badge.pub{background:#16a34a;color:#fff}
      .ba-stat{display:inline-flex;gap:4px;align-items:center}
      /* editör kabuğu */
      .be-wrap{max-width:1280px;margin:0 auto}
      .be-topbar{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:12px;padding:12px 16px;margin:0 0 16px;background:color-mix(in srgb, var(--surface,#161b24) 92%, transparent);backdrop-filter:blur(8px);border:1px solid var(--border,#262c38);border-radius:14px}
      .be-topbar .be-tt{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
      .be-savestate{font-size:12px;white-space:nowrap;opacity:.75}
      .be-savestate.dirty{color:#f59e0b;opacity:1}
      .be-savestate.ok{color:#4ade80}
      .be-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}
      @media (max-width:1100px){.be-grid{grid-template-columns:1fr}}
      .be-main{min-width:0}
      .be-side{display:flex;flex-direction:column;gap:14px;position:sticky;top:76px}
      .be-card{background:var(--surface,#161b24);border:1px solid var(--border,#262c38);border-radius:14px;padding:16px}
      .be-card h4{margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;opacity:.7}
      /* dil sekmeleri */
      .ba-tabs{display:flex;gap:6px;margin:0 0 0;align-items:center}
      .ba-tab{padding:9px 18px;border-radius:10px 10px 0 0;cursor:pointer;border:1px solid var(--border,#262c38);border-bottom:none;background:transparent;opacity:.6;display:inline-flex;gap:7px;align-items:center;font-weight:600}
      .ba-tab.on{opacity:1;background:var(--surface,#161b24);font-weight:800}
      .ba-tab .dot{width:7px;height:7px;border-radius:50%;background:#64748b}
      .ba-tab .dot.on{background:#4ade80}
      .ba-wc{font-size:12px;opacity:.6;white-space:nowrap}
      #be_tr_btn{border-color:#7c3aed66;color:#a78bfa;font-weight:700}
      #be_tr_btn:disabled{opacity:.6;cursor:progress}
      .ba-pane{border:1px solid var(--border,#262c38);border-radius:0 12px 12px 12px;padding:18px;background:var(--surface,#161b24)}
      .ba-field{margin:0 0 14px}
      .ba-field label{display:block;font-size:12px;font-weight:600;opacity:.8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px}
      .ba-input{width:100%;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:9px;padding:10px 12px;color:inherit;font:inherit}
      .ba-input:focus{outline:none;border-color:#7c3aed}
      .ba-title-input{font-size:20px;font-weight:800;padding:12px 14px}
      .ba-count{float:right;font-size:11px;opacity:.5;text-transform:none;letter-spacing:0}
      .ba-count.bad{color:#f87171;opacity:1}
      /* RTE */
      .ba-rte-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
      .ba-rte{border-radius:9px;overflow:hidden}
      .ba-rte .ql-toolbar{border:1px solid var(--border,#2a3140);border-bottom:none;border-radius:9px 9px 0 0;background:#0e131a;position:sticky;top:64px;z-index:20}
      .ba-rte .ql-container{border:1px solid var(--border,#2a3140);border-radius:0 0 9px 9px;font:inherit;font-size:15px;background:#0e131a}
      .ba-rte .ql-editor{min-height:220px;color:#e2e8f0;line-height:1.7}
      .ba-rte .ql-editor.ql-blank::before{color:#64748b;font-style:normal}
      .ba-rte .ql-toolbar .ql-stroke{stroke:#cbd5e1}
      .ba-rte .ql-toolbar .ql-fill{fill:#cbd5e1}
      .ba-rte .ql-toolbar .ql-picker{color:#cbd5e1}
      .ba-rte .ql-toolbar button:hover .ql-stroke,.ba-rte .ql-toolbar button.ql-active .ql-stroke,.ba-rte .ql-toolbar .ql-picker-label:hover .ql-stroke{stroke:#a78bfa}
      .ba-rte .ql-toolbar button:hover .ql-fill,.ba-rte .ql-toolbar button.ql-active .ql-fill{fill:#a78bfa}
      .ba-rte .ql-toolbar button:hover,.ba-rte .ql-toolbar button.ql-active,.ba-rte .ql-toolbar .ql-picker-label:hover{color:#a78bfa}
      .ba-rte .ql-toolbar .ql-picker-options{background:#0e131a;border-color:#2a3140}
      .ba-rte .ql-editor a{color:#60a5fa}
      .ba-rte .ql-editor blockquote{border-left:3px solid #7c3aed;color:#cbd5e1;padding-left:14px}
      .ba-rte .ql-editor h2,.ba-rte .ql-editor h3,.ba-rte .ql-editor h4{color:#f1f5f9}
      .ba-rte .ql-editor table,.ba-src-note table{border-collapse:collapse}
      .ba-src{width:100%;min-height:260px;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:9px;color:#a5f3fc;font:12.5px/1.6 ui-monospace,monospace;padding:12px}
      /* öğeler */
      .ba-prod{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border,#262c38);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--surface,#161b24)}
      .ba-prod img{width:60px;height:60px;object-fit:contain;background:#fff;border-radius:8px;flex:0 0 60px}
      .ba-prod-ord{display:flex;flex-direction:column;gap:4px}
      .ba-mini{padding:4px 9px;border-radius:8px;border:1px solid var(--border,#3a4150);background:transparent;color:inherit;cursor:pointer;font-size:12px}
      .ba-mini:hover{border-color:#7c3aed}
      .bk-tab.on{background:#7c3aed;border-color:#7c3aed;color:#fff;font-weight:700}
      .bk-blocks{margin-top:6px}
      .bk-block{border:1px solid var(--border,#2a3140);border-radius:10px;padding:9px 11px;margin-bottom:8px;background:rgba(124,58,237,.04)}
      .bk-block-bar{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;opacity:.8;text-transform:uppercase;letter-spacing:.3px}
      .bk-block-ord{display:inline-flex;gap:4px}
      .ba-prod-kind{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:1px 7px;border-radius:6px;margin-bottom:4px}
      .ba-prod-kind.k-product{background:#1d4ed833;color:#60a5fa}
      .ba-prod-kind.k-subscription{background:#7c3aed33;color:#a78bfa}
      .ba-prod-kind.k-custom{background:#05966933;color:#34d399}
      .ba-results{position:absolute;z-index:30;left:0;right:0;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:10px;max-height:300px;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.5)}
      .ba-results div.hit{padding:9px 12px;cursor:pointer;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border,#222936)}
      .ba-results div.hit:hover{background:#1a2230}
      /* SEO kartı */
      .be-serp{background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:12px}
      .be-serp .u{color:#1a5c38;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .be-serp .t{color:#1a0dab;font-size:16px;font-weight:500;line-height:1.3;margin:2px 0;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .be-serp .d{color:#4d5156;font-size:12.5px;line-height:1.5;max-height:56px;overflow:hidden}
      .be-check{list-style:none;margin:0;padding:0;font-size:13px}
      .be-check li{display:flex;gap:8px;align-items:center;padding:4px 0;opacity:.85}
      .be-check .ok{color:#4ade80}
      .be-check .no{color:#64748b}
      /* şablon galerisi */
      .be-tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:18px}
      .be-tpl{background:var(--surface,#161b24);border:1px solid var(--border,#262c38);border-radius:14px;padding:18px;cursor:pointer;transition:border-color .15s, transform .1s}
      .be-tpl:hover{border-color:#7c3aed;transform:translateY(-2px)}
      .be-tpl .ic{font-size:28px}
      .be-tpl b{display:block;margin:10px 0 6px;font-size:15px}
      .be-tpl p{margin:0;font-size:12.5px;opacity:.65;line-height:1.5}
      .be-tpl-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}
      .be-tpl-tags span{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:12px;background:#7c3aed22;color:#a78bfa}
      /* içe aktar modal */
      .be-modal{position:fixed;inset:0;background:rgba(2,6,23,.7);z-index:90;display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}
      .be-modal-box{background:var(--surface,#161b24);border:1px solid var(--border,#2a3140);border-radius:16px;max-width:860px;width:100%;padding:20px}
      .be-modal-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
      .be-imp-ta{width:100%;min-height:320px;background:#0e131a;border:1px solid var(--border,#2a3140);border-radius:10px;color:#e2e8f0;font:12.5px/1.6 ui-monospace,monospace;padding:12px}
      .be-imp-opt{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0;font-size:13px}
      .be-imp-opt label{display:inline-flex;gap:6px;align-items:center;cursor:pointer}
      /* içe aktarma raporu */
      .be-report{border:1px solid #7c3aed55;background:#7c3aed11;border-radius:12px;padding:12px 14px;margin:0 0 12px;font-size:13px}
      .be-report .r-ok{color:#4ade80}
      .be-report .r-warn{color:#f59e0b}
      .btn-purple{background:#7c3aed;border-color:#7c3aed;color:#fff}
    `;
    document.head.appendChild(s);
  }

  // ── markdown → HTML ───────────────────────────────────────────
  // marked (CDN) varsa onu kullan; yoksa yerleşik mini dönüştürücü.
  function mdInline(s) {
    let t = esc(s);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t;
  }
  function mdToHtmlFallback(md) {
    const lines = String(md || '').split(/\r?\n/);
    const out = [];
    let list = null; // 'ul' | 'ol'
    let para = [];
    let table = null; // {header:[], rows:[[]]}
    const flushPara = () => { if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; } };
    const flushList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
    const flushTable = () => {
      if (!table) return;
      let h = '<table><thead><tr>' + table.header.map(c => '<th>' + mdInline(c) + '</th>').join('') + '</tr></thead><tbody>';
      h += table.rows.map(r => '<tr>' + r.map(c => '<td>' + mdInline(c) + '</td>').join('') + '</tr>').join('');
      out.push(h + '</tbody></table>'); table = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (/^\|.+\|/.test(line)) {
        flushPara(); flushList();
        if (!table) {
          const next = (lines[i + 1] || '').trim();
          if (/^\|?[\s:|-]+\|?$/.test(next) && next.includes('-')) { table = { header: cells(line), rows: [] }; i++; continue; }
        }
        if (table) { table.rows.push(cells(line)); continue; }
      } else if (table) flushTable();
      if (!line) { flushPara(); flushList(); continue; }
      let m = line.match(/^(#{1,6})\s+(.+)$/);
      if (m) { flushPara(); flushList(); const lvl = Math.min(4, Math.max(2, m[1].length)); out.push(`<h${lvl}>` + mdInline(m[2]) + `</h${lvl}>`); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
      if (/^>\s?/.test(line)) { flushPara(); flushList(); out.push('<blockquote><p>' + mdInline(line.replace(/^>\s?/, '')) + '</p></blockquote>'); continue; }
      m = line.match(/^[-*•]\s+(.+)$/);
      if (m) { flushPara(); if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + mdInline(m[1]) + '</li>'); continue; }
      m = line.match(/^\d+[.)]\s+(.+)$/);
      if (m) { flushPara(); if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + mdInline(m[1]) + '</li>'); continue; }
      m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (m) { flushPara(); flushList(); out.push(`<figure><img src="${esc(m[2])}" alt="${esc(m[1])}"></figure>`); continue; }
      para.push(line);
    }
    flushPara(); flushList(); flushTable();
    return out.join('\n');
  }
  function mdToHtml(md) {
    let html = '';
    if (window.marked && typeof window.marked.parse === 'function') {
      try { html = window.marked.parse(String(md || ''), { breaks: false }); } catch (_) { html = ''; }
    }
    if (!html) html = mdToHtmlFallback(md);
    // güvenlik + site uyumu: script sök, h1'i h2'ye indir (başlık ayrı alan)
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<(\/?)h1(\s|>)/gi, '<$1h2$2');
    return html.trim();
  }

  // Makale markdown'ını parçalara ayır: başlık, lead, gövde, ürün bölümleri,
  // sonuç. "## 1. Ürün Adı" biçimli 2. seviye başlıklar öğe sayılır (opsiyon).
  function parseMdArticle(md, opts) {
    const o = Object.assign({ takeTitle: true, detectItems: true, splitConclusion: true }, opts || {});
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    let title = '';
    let lead = '';
    const sections = []; // {head:'' (preamble) | başlık, lines:[]}
    let cur = { head: '', lines: [] };
    for (const raw of lines) {
      const m = raw.match(/^##\s+(.+?)\s*$/);
      if (m) { sections.push(cur); cur = { head: m[1].trim(), lines: [] }; continue; }
      cur.lines.push(raw);
    }
    sections.push(cur);
    // preamble: h1 → title, ilk paragraf → lead
    const pre = sections[0].lines;
    const bodyPre = [];
    for (let i = 0; i < pre.length; i++) {
      const line = pre[i];
      const h1 = line.match(/^#\s+(.+?)\s*$/);
      if (h1 && !title && o.takeTitle) { title = h1[1].replace(/\*\*/g, '').trim(); continue; }
      if (!lead && o.takeTitle && line.trim() && !/^[#>\-*|!\d]/.test(line.trim())) { lead = line.trim().replace(/\*\*/g, ''); continue; }
      bodyPre.push(line);
    }
    const bodyParts = [bodyPre.join('\n')];
    const items = [];
    let conclusionMd = '';
    const CONCL = /^(sonuç|sonuc|conclusion|fazit|özet|ozet|verdict|karar|summary)\b/i;
    for (let i = 1; i < sections.length; i++) {
      const sec = sections[i];
      const content = sec.lines.join('\n').trim();
      const numbered = sec.head.match(/^(\d+)[.)]\s+(.+)$/);
      if (o.splitConclusion && CONCL.test(sec.head)) { conclusionMd += (conclusionMd ? '\n\n' : '') + content; continue; }
      if (o.detectItems && numbered) {
        // Görünen ad YAZARIN yazdığı gibi kalır (VPN/abonelik gibi katalog dışı
        // öğelerde başlıktaki fiyat tek fiyat bilgisidir). Fiyat eki yalnızca
        // KATALOG ARAMASINDA temizlenir — bkz. importItems.
        items.push({ name: numbered[2].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim(), md: content });
        continue;
      }
      bodyParts.push('## ' + sec.head + '\n' + content);
    }
    return { title, lead, bodyMd: bodyParts.join('\n\n').trim(), items, conclusionMd };
  }
  // Öğe başlığından markdown süslerini VE fiyat eklerini temizle:
  // "NordVPN — 12,99 $/ay (2 yıllıkta 3,49 $)" → "NordVPN". Fiyat eki, tireden
  // sonrası para birimi/rakam içeriyorsa atılır; "Sony WH-1000XM5" gibi
  // boşluksuz tireler dokunulmaz kalır.
  function cleanItemName(raw) {
    let n = String(raw || '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
    n = n.replace(/\s+[—–-]\s+[^—–-]*(?:\$|€|₺|£|\bTL\b|\bUSD\b|\bEUR\b|\/ay|\/yıl|\/month|\/Monat|month|Monat)\S*.*$/i, '').trim();
    n = n.replace(/\s*\((?:[^)]*(?:\$|€|₺|£|\bTL\b|fiyat|price)[^)]*)\)\s*$/i, '').trim();
    return n;
  }

  // Öğe bölümü markdown'ı → blocks[] (görseller ayrı image bloğu; metin sitenin
  // renderRichText'inin anladığı düz-markdown olarak kalır: **bold**, "- ", "### ")
  function mdSectionToBlocks(md, lang) {
    const blocks = [];
    let text = [];
    const flush = () => {
      const t = text.join('\n').replace(/^\n+|\n+$/g, '');
      if (t.trim()) { const b = { t: 'text', tr: '', en: '', de: '' }; b[lang] = t; blocks.push(b); }
      text = [];
    };
    let imgCount = 0;
    for (const raw of String(md || '').split('\n')) {
      const m = raw.trim().match(/^!\[[^\]]*\]\(([^)\s]+)\)$/);
      if (m) { flush(); blocks.push({ t: 'image', url: m[1], pos: imgCount === 0 ? 'right' : 'full', size: 'm' }); imgCount++; continue; }
      // "### Alt başlık" → site "## " boyutuna çek (renderRichText 1-3 destekler)
      text.push(raw.replace(/^###\s+/, '## '));
    }
    flush();
    if (!blocks.some(b => b.t === 'text')) blocks.push({ t: 'text', tr: '', en: '', de: '' });
    return blocks;
  }

  // ── Quill kural düzeltmesi (v2 bullet listeleri) ──────────────
  function normalizeRte(html) {
    if (!html || html === '<p><br></p>') return '';
    try {
      const doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
      doc.querySelectorAll('ol').forEach((ol) => {
        const items = [...ol.children].filter((n) => n.tagName === 'LI');
        const allBullet = items.length && items.every((li) => li.getAttribute('data-list') === 'bullet');
        items.forEach((li) => li.removeAttribute('data-list'));
        if (allBullet) { const ul = doc.createElement('ul'); while (ol.firstChild) ul.appendChild(ol.firstChild); ol.replaceWith(ul); }
      });
      return doc.getElementById('r').innerHTML;
    } catch (_) { return html; }
  }

  // ── RTE (Quill + kaynak modu) ─────────────────────────────────
  function mkQuill(wrapId, html, onChange) {
    const wrap = document.getElementById(wrapId);
    if (!wrap || !window.Quill) return null;
    wrap.innerHTML = '<div></div>';
    const el = wrap.firstChild;
    const q = new Quill(el, {
      theme: 'snow',
      placeholder: 'Yazmaya başla… (ya da üstteki “İçe Aktar” ile Claude çıktısını yapıştır)',
      modules: {
        toolbar: {
          container: [
            [{ header: [2, 3, 4, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'code-block', 'link', 'image'],
            ['clean'],
          ],
          handlers: {
            image() {
              const quill = this.quill;
              openBodyImageDialog((url) => {
                if (!url) return;
                const r = quill.getSelection(true) || { index: quill.getLength() };
                quill.insertEmbed(r.index, 'image', url, 'user');
                quill.setSelection(r.index + 1);
              });
            },
          },
        },
      },
    });
    if (html) q.clipboard.dangerouslyPasteHTML(html);
    q.on('text-change', (d, od, srcW) => { const h = q.root.innerHTML; onChange(h === '<p><br></p>' ? '' : h); if (srcW === 'user') blogMarkDirty(); });
    return q;
  }
  // Tablolu içerik Quill'de bozulur → otomatik kaynak modu.
  function hasTable(html) { return /<table/i.test(html || ''); }
  function rteHead(key, label) {
    const on = _srcMode[key];
    return `<div class="ba-rte-head"><label style="margin:0">${label}</label>
      <button type="button" class="ba-mini" onclick="blogSrcToggle('${key}')">${on ? '👁 Görsel editör' : '&lt;/&gt; HTML kaynağı'}</button></div>`;
  }
  function renderRte(key) {
    const field = key === 'body' ? 'body_' : 'conclusion_';
    const wrapId = key === 'body' ? 'p_body_wrap' : 'b_concl_wrap';
    const wrap = document.getElementById(wrapId); if (!wrap) return;
    const html = _editing[field + _lang] || '';
    if (hasTable(html) && !_srcMode[key]) _srcMode[key] = true; // tabloyu koru
    if (_srcMode[key]) {
      if (key === 'body') _bodyQ = null; else _conclQ = null;
      wrap.innerHTML = `<textarea class="ba-src" oninput="blogSrcInput('${key}', this.value)" spellcheck="false">${esc(html)}</textarea>
        ${hasTable(html) ? '<div style="font-size:11px;opacity:.55;margin-top:4px">Tablolar görsel editörde desteklenmez — bu içerik HTML modunda düzenlenir (sitede doğru görünür).</div>' : ''}`;
    } else {
      const q = mkQuill(wrapId, html, (h) => { _editing[field + _lang] = h; });
      if (key === 'body') _bodyQ = q; else _conclQ = q;
    }
  }
  function blogSrcInput(key, v) {
    const field = key === 'body' ? 'body_' : 'conclusion_';
    _editing[field + _lang] = v; blogMarkDirty();
  }
  function blogSrcToggle(key) {
    flushEditors();
    if (_srcMode[key] && hasTable(_editing[(key === 'body' ? 'body_' : 'conclusion_') + _lang])) {
      toast('İçerikte tablo var — görsel editör tabloyu bozar, HTML modunda kalıyor', 'w'); return;
    }
    _srcMode[key] = !_srcMode[key];
    const headId = key === 'body' ? 'p_body_head' : 'b_concl_head';
    const head = document.getElementById(headId);
    if (head) head.outerHTML = `<div id="${headId}">${rteHead(key, key === 'body' ? 'Giriş / genel yazı' : 'Bitiş yazısı')}</div>`;
    renderRte(key);
  }
  function initEditors() { renderRte('body'); renderRte('concl'); }
  function flushEditors() {
    if (!_editing) return;
    const c = _lang;
    if (!_srcMode.body && _bodyQ && _bodyQ.root && _bodyQ.root.isConnected) _editing['body_' + c] = normalizeRte(_bodyQ.root.innerHTML);
    if (!_srcMode.concl && _conclQ && _conclQ.root && _conclQ.root.isConnected) _editing['conclusion_' + c] = normalizeRte(_conclQ.root.innerHTML);
  }

  // ── data ──────────────────────────────────────────────────────
  async function loadCats() {
    if (_cats.length) return;
    try {
      const r = await window.TsClient.request('GET', '/collections/products/documents/search?q=*&query_by=name&per_page=0&facet_by=category&max_facet_values=80');
      _cats = ((r.facet_counts && r.facet_counts[0] && r.facet_counts[0].counts) || []).map((c) => c.value).filter(Boolean).sort();
    } catch (_) { _cats = []; }
  }
  async function loadStats() {
    _stats = {};
    try {
      const evs = await getPb().collection('article_events').getFullList({ fields: 'slug,type,duration', $autoCancel: false, batch: 2000 });
      for (const e of evs) {
        const s = _stats[e.slug] || (_stats[e.slug] = { view: 0, read: 0, like: 0, dur: 0 });
        if (s[e.type] != null) s[e.type] += 1;
        if (e.type === 'read') s.dur += Number(e.duration) || 0;
      }
    } catch (_) { /* events may be empty */ }
  }
  function avgRead(s) { return s && s.read ? Math.round(s.dur / s.read) : 0; }

  // ── LİSTE ─────────────────────────────────────────────────────
  async function loadBlogAdmin() {
    injectStyles();
    stopAutosave();
    const el = root(); if (!el) return;
    el.innerHTML = '<div style="padding:24px;opacity:.6">Yükleniyor…</div>';
    try {
      await loadStats();
      _items = await getPb().collection('articles').getFullList({ sort: '-updated', $autoCancel: false });
      const badge = document.getElementById('blogCount'); if (badge) badge.textContent = _items.length;
      renderList();
    } catch (e) { el.innerHTML = `<div style="padding:24px;color:#ef4444">Hata: ${esc(e.message)}</div>`; }
  }
  function langDone(a, c) { return Boolean(a['title_' + c] && (a['body_' + c] || (a.products || []).length)); }
  function renderList() {
    const el = root(); if (!el) return;
    const items = _items.filter((a) => {
      if (_listStatus !== 'all' && a.status !== _listStatus) return false;
      if (_listQ) {
        const q = _listQ.toLowerCase();
        return ['title_tr', 'title_en', 'title_de', 'slug', 'category'].some((f) => String(a[f] || '').toLowerCase().includes(q));
      }
      return true;
    });
    const tot = _items.reduce((acc, a) => { const s = _stats[a.slug] || {}; acc.v += s.view || 0; acc.l += s.like || 0; acc.r += s.read || 0; acc.dur += s.dur || 0; return acc; }, { v: 0, l: 0, r: 0, dur: 0 });
    const totAvg = tot.r ? Math.round(tot.dur / tot.r) : 0;
    const summary = `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">
      ${[['👁 Görüntüleme', tot.v], ['❤ Beğeni', tot.l], ['📖 Okuma', tot.r], ['⏱ Ort. süre', totAvg + 's'], ['📝 Makale', _items.length]].map(([k, val]) =>
      `<div style="flex:1;min-width:130px;background:var(--surface,#161b24);border:1px solid var(--border,#262c38);border-radius:12px;padding:14px 16px"><div style="font-size:12px;opacity:.6">${k}</div><div style="font-size:24px;font-weight:800">${val}</div></div>`).join('')}</div>`;
    const toolbar = `<div class="ba-toolbar">
      <input class="ba-search" placeholder="🔍 Makale ara (başlık, slug, kategori)…" value="${esc(_listQ)}" oninput="blogListSearch(this.value)" />
      ${[['all', 'Tümü'], ['published', 'Yayında'], ['draft', 'Taslak']].map(([v, n]) =>
        `<button class="ba-chip ${_listStatus === v ? 'on' : ''}" onclick="blogListFilter('${v}')">${n}</button>`).join('')}
    </div>`;
    if (!_items.length) { el.innerHTML = '<div style="padding:32px;text-align:center;opacity:.6">Henüz makale yok.<br>“+ New article” ile ilkini yaz.</div>'; return; }
    el.innerHTML = summary + toolbar + (items.length ? `<div class="ba-grid">${items.map((a) => {
      const st = _stats[a.slug] || {};
      const lp0 = (a.products || [])[0] || {};
      const lcov = a.cover || (a.coverFile ? pbFileUrl(a, a.coverFile) : '') || lp0.image || lp0.imageUrl || '';
      return `<div class="ba-card">
        <div class="ba-card-cover">
          <img src="${esc(lcov)}" onerror="this.style.visibility='hidden'" loading="lazy"/>
          <span class="ba-badge ${a.status === 'published' ? 'pub' : ''}">${a.status === 'published' ? 'YAYINDA' : 'TASLAK'}</span>
          <span class="ba-card-langs">${LANGS.map(([c]) => `<span class="ba-lang-dot ${langDone(a, c) ? 'on' : ''}">${c.toUpperCase()}</span>`).join('')}</span>
        </div>
        <div class="ba-card-b">
          <div class="ba-card-title">${esc(a.title_tr || a.title_en || a.slug)}</div>
          <div class="ba-card-meta">
            <span class="ba-stat">👁 ${st.view || 0}</span>
            <span class="ba-stat">❤ ${st.like || 0}</span>
            <span class="ba-stat">📖 ${st.read || 0}</span>
            <span class="ba-stat">⏱ ${avgRead(st)}s</span>
            <span class="ba-stat">📅 ${esc(String(a.publishedAt || a.created || '').slice(0, 10))}</span>
            ${a.category ? `<span class="ba-stat">🏷 ${esc(a.category)}</span>` : ''}
          </div>
          <div class="ba-card-actions">
            <button class="btn btn-primary btn-sm" onclick="blogEdit('${a.id}')">✏️ Düzenle</button>
            <a class="btn btn-ghost btn-sm" href="${SITE}/blog/${esc(a.slug)}${a.status !== 'published' ? `?previewId=${a.id}` : ''}" target="_blank">👁 Gör</a>
            <button class="btn btn-ghost btn-sm" onclick="blogDuplicate('${a.id}')" title="Kopyasını oluştur">⧉</button>
            <button class="btn btn-ghost btn-sm" style="color:#f87171" onclick="blogDelete('${a.id}','${esc(a.slug)}')">🗑</button>
          </div>
        </div></div>`;
    }).join('')}</div>` : '<div style="padding:32px;text-align:center;opacity:.6">Filtreye uyan makale yok.</div>');
  }
  function blogListSearch(v) { _listQ = v; renderList(); const inp = root().querySelector('.ba-search'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
  function blogListFilter(v) { _listStatus = v; renderList(); }
  async function blogDuplicate(id) {
    try {
      const a = await getPb().collection('articles').getOne(id, { $autoCancel: false });
      const copy = {};
      for (const k of Object.keys(a)) {
        if (['id', 'created', 'updated', 'collectionId', 'collectionName', 'coverFile', 'media', 'expand'].includes(k)) continue;
        copy[k] = a[k];
      }
      copy.slug = (a.slug || 'makale') + '-kopya';
      LANGS.forEach(([c]) => { if (copy['slug_' + c]) copy['slug_' + c] += '-kopya'; });
      copy.status = 'draft';
      const rec = await getPb().collection('articles').create(copy, { $autoCancel: false });
      toast('Kopya oluşturuldu (taslak)', 's');
      blogEdit(rec.id);
    } catch (e) { toast('Kopyalanamadı: ' + e.message, 'e'); }
  }
  async function blogDelete(id, slug) {
    if (!confirm(`"${slug}" makalesi silinsin mi?`)) return;
    try { await getPb().collection('articles').delete(id, { $autoCancel: false }); toast('Silindi', 's'); loadBlogAdmin(); }
    catch (e) { toast('Silinemedi: ' + e.message, 'e'); }
  }

  // ── ŞABLONLAR ─────────────────────────────────────────────────
  const TPL = [
    { id: 'topn', ic: '🏆', name: 'Top-N Liste', desc: '"2026\'nın En İyi 5 Telefonu" tarzı sıralı liste. Giriş + ürün öğeleri + sonuç yapısı hazır gelir.', tags: ['Giriş', 'Kriterler', 'N ürün', 'Sonuç'] },
    { id: 'review', ic: '🔬', name: 'Ürün İncelemesi', desc: 'Tek ürün derin inceleme: tasarım, ekran, performans, pil, kamera, artı/eksi, karar.', tags: ['7 bölüm', 'Artı/Eksi', 'Puan tablosu'] },
    { id: 'vs', ic: '⚔️', name: 'Karşılaştırma (X vs Y)', desc: 'İki ürünü kafa kafaya kıyasla: özellik tablosu, kategori kategori karşılaştırma, hangisini al.', tags: ['Özellik tablosu', 'Kazanan'] },
    { id: 'guide', ic: '🧭', name: 'Satın Alma Rehberi', desc: '"Nasıl seçilir?" rehberi: nelere dikkat, bütçe sınıfları, öneriler, SSS.', tags: ['Kriterler', 'Bütçe sınıfları', 'SSS'] },
    { id: 'howto', ic: '🛠️', name: 'Nasıl Yapılır', desc: 'Adım adım anlatım: gerekenler listesi, numaralı adımlar, sık yapılan hatalar, ipuçları.', tags: ['Gerekenler', 'Adımlar', 'İpuçları'] },
    { id: 'faq', ic: '❓', name: 'Soru-Cevap', desc: 'Bir konudaki en çok sorulan soruları toplayan makale — her soru bir bölüm, kısa net cevaplar.', tags: ['8-10 soru', 'Kısa cevap'] },
    { id: 'deals', ic: '💰', name: 'Fırsat / İndirim Listesi', desc: 'Dönemsel fırsat derlemesi: hangi ürün neden fırsat, kimin almalı, nelere dikkat.', tags: ['Fırsat listesi', 'Uyarılar'] },
    { id: 'alt', ic: '🔄', name: 'Alternatifler', desc: '"X yerine ne alınır?" makalesi: pahalı/stokta olmayan bir ürünün mantıklı alternatifleri.', tags: ['Referans ürün', 'Alternatifler'] },
    { id: 'news', ic: '📰', name: 'Haber / Duyuru', desc: 'Yeni çıkan ürün, fiyat değişikliği ya da sektör haberi: ne oldu, neden önemli, ne beklenmeli.', tags: ['Ne oldu', 'Neden önemli'] },
    { id: 'claude', ic: '✨', name: 'Claude ile Yaz', desc: 'Hazır prompt\'u kopyala → Claude\'a ver → dönen JSON\'u içe aktar. 3 dil + ürünler tek yapıştırmada dolar.', tags: ['3 dil otomatik', 'Tek yapıştırma'] },
    { id: 'blank', ic: '📄', name: 'Boş Sayfa', desc: 'Sıfırdan başla — hiçbir hazır yapı yok.', tags: [] },
  ];
  const TPL_BODIES = {
    topn: '<p>Neden bu liste? Kısa bir giriş: kimin için, hangi kriterlerle seçildi (fiyat/performans, pil, ekran…), fiyatların tarihi.</p><h2>Nasıl seçtik?</h2><p>Seçim kriterlerini 3-4 cümleyle anlat — okuyucu güveni için önemli.</p>',
    review: '<h2>Kutudan çıkanlar ve ilk izlenim</h2><p>…</p><h2>Tasarım ve ekran</h2><p>…</p><h2>Performans</h2><p>…</p><h2>Pil ve şarj</h2><p>…</p><h2>Kamera</h2><p>…</p><h2>Puan tablosu</h2><table><thead><tr><th>Kategori</th><th>Puan (10)</th><th>Not</th></tr></thead><tbody><tr><td>Tasarım</td><td>…</td><td>…</td></tr><tr><td>Ekran</td><td>…</td><td>…</td></tr><tr><td>Performans</td><td>…</td><td>…</td></tr><tr><td>Pil</td><td>…</td><td>…</td></tr></tbody></table><h2>Artılar ve eksiler</h2><ul><li><strong>+</strong> …</li><li><strong>+</strong> …</li><li><strong>−</strong> …</li></ul>',
    vs: '<p>İki cihazı kısaca tanıt ve kimin bu karşılaştırmayı okuması gerektiğini söyle.</p><h2>Özellik tablosu</h2><table><thead><tr><th>Özellik</th><th>Model A</th><th>Model B</th></tr></thead><tbody><tr><td>Ekran</td><td>…</td><td>…</td></tr><tr><td>İşlemci</td><td>…</td><td>…</td></tr><tr><td>Pil</td><td>…</td><td>…</td></tr><tr><td>Fiyat</td><td>…</td><td>…</td></tr></tbody></table><h2>Ekran</h2><p>…</p><h2>Performans</h2><p>…</p><h2>Pil ve şarj</h2><p>…</p><h2>Hangisini almalı?</h2><p><strong>Model A\'yı al eğer:</strong> …</p><p><strong>Model B\'yi al eğer:</strong> …</p>',
    guide: '<p>Bu rehber kimin için ve neyi çözecek — 2-3 cümle.</p><h2>Alırken nelere dikkat etmeli?</h2><ul><li><strong>Kriter 1:</strong> …</li><li><strong>Kriter 2:</strong> …</li><li><strong>Kriter 3:</strong> …</li></ul><h2>Bütçenize göre sınıflar</h2><h3>Giriş seviyesi</h3><p>…</p><h3>Orta segment</h3><p>…</p><h3>Üst segment</h3><p>…</p><h2>Sık sorulan sorular</h2><h3>Soru 1?</h3><p>…</p><h3>Soru 2?</h3><p>…</p>',
    howto: '<p>Bu rehberin sonunda ne başarmış olacaksın — 1-2 cümle. Tahmini süre ve zorluk.</p><h2>Gerekenler</h2><ul><li>…</li><li>…</li></ul><h2>Adım 1: …</h2><p>…</p><h2>Adım 2: …</h2><p>…</p><h2>Adım 3: …</h2><p>…</p><h2>Sık yapılan hatalar</h2><ul><li><strong>Hata:</strong> … <strong>Çözüm:</strong> …</li></ul><h2>İpuçları</h2><ul><li>…</li></ul>',
    faq: '<p>Bu konuda en çok merak edilenleri tek yerde topladık — kısa, net cevaplarla.</p><h2>Soru 1?</h2><p>Net cevap 2-4 cümle.</p><h2>Soru 2?</h2><p>…</p><h2>Soru 3?</h2><p>…</p><h2>Soru 4?</h2><p>…</p><h2>Soru 5?</h2><p>…</p>',
    deals: '<p>Bu dönemin öne çıkan fırsatları: hangi ürün gerçekten indirimde, hangisi "sahte indirim". Fiyatlar yazı tarihine aittir — güncel fiyatı ürün kartındaki canlı fiyat gösterir.</p><h2>Fırsat mı, değil mi? Nasıl anlarsın</h2><ul><li><strong>Fiyat geçmişine bak:</strong> …</li><li><strong>Sürüm/varyanta dikkat:</strong> …</li></ul>',
    alt: '<p>Referans ürünü ve neden alternatif arandığını anlat (fiyat, stok, ihtiyaç farkı).</p><h2>Neye göre alternatif seçtik?</h2><p>…</p>',
    news: '<h2>Ne oldu?</h2><p>Haberin özü — 2-3 cümle, abartısız.</p><h2>Neden önemli?</h2><p>Kullanıcı için pratik anlamı: fiyat mı düşer, beklemek mi mantıklı…</p><h2>Ne beklenmeli?</h2><p>Tarihler, tahminler (tahminleri tahmin olarak işaretle).</p>',
  };
  function renderTplGallery() {
    const el = root(); if (!el) return;
    const bak = loadBackup('new');
    el.innerHTML = `
      <div class="be-wrap">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <button class="btn btn-ghost" onclick="loadBlogAdmin()">← Geri</button>
          <h2 style="margin:0;font-size:20px">Nasıl başlamak istersin?</h2>
        </div>
        <p style="opacity:.6;margin:4px 0 0">Şablonlar sadece başlangıç yapısı kurar — her şeyi sonra değiştirebilirsin.</p>
        ${bak ? `<div class="be-report" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>💾 <b>Yarım kalan kaydedilmemiş taslağın var</b> (${esc(backupTimeLabel(bak))}${bak.e && bak.e.title_tr ? ` · "${esc(String(bak.e.title_tr).slice(0, 60))}"` : ''})</span>
          <span style="display:flex;gap:8px;flex-shrink:0"><button class="btn btn-primary btn-purple btn-sm" onclick="blogBackupRestore('new')">Devam et</button><button class="ba-mini" onclick="blogBackupDiscard('new')">Sil</button></span>
        </div>` : ''}
        <div class="be-tpl-grid">
          ${TPL.map((t) => `<div class="be-tpl" onclick="blogTplPick('${t.id}')"><span class="ic">${t.ic}</span><b>${t.name}</b><p>${t.desc}</p>${(t.tags || []).length ? `<div class="be-tpl-tags">${t.tags.map((g) => `<span>${g}</span>`).join('')}</div>` : ''}</div>`).join('')}
        </div>
      </div>`;
  }
  function blogTplPick(id) {
    _editing = { id: '', slug: '', status: 'draft', category: '', cover: '', publishedAt: toDtLocal(new Date()) };
    _products = []; _lang = 'tr'; _srcMode = { body: false, concl: false }; _importReport = null;
    if (TPL_BODIES[id]) _editing.body_tr = TPL_BODIES[id];
    renderEditor();
    if (id === 'claude') setTimeout(() => blogImportOpen('prompt'), 150);
  }
  async function blogNew() {
    injectStyles();
    await loadCats();
    renderTplGallery();
  }
  async function blogEdit(id) {
    injectStyles();
    await loadCats();
    try {
      const a = await getPb().collection('articles').getOne(id, { $autoCancel: false });
      _editing = a; _lang = 'tr'; _srcMode = { body: false, concl: false }; _importReport = null;
      _products = Array.isArray(a.products) ? a.products.map((p) => ({ ...p })) : [];
      _editing.publishedAt = toDtLocal(a.publishedAt);
      _lastSavedJson = saveSnapshotJson();
      // Kayıttan sonra değişip kaydedilmeden kapanmış yerel yedek var mı?
      const bak = loadBackup(id);
      _pendingBackup = (bak && bak.at > (Date.parse(String(a.updated || '').replace(' ', 'T')) || 0)) ? bak : null;
      renderEditor();
      for (const p of _products) { if (p && p.id && (p.kind || 'product') === 'product') blogProdFetchPrice(p.id); }
    } catch (e) { toast('Yüklenemedi: ' + e.message, 'e'); }
  }

  // ── EDİTÖR ────────────────────────────────────────────────────
  function renderEditor() {
    const a = _editing; const el = root(); if (!el) return;
    el.innerHTML = `
      <div class="be-wrap">
        <div class="be-topbar">
          <button class="btn btn-ghost" onclick="blogBackToList()">←</button>
          <span class="be-tt" id="be_tt">${esc(a['title_' + _lang] || a.title_tr || 'Yeni makale')}</span>
          <span class="ba-badge ${a.status === 'published' ? 'pub' : ''}" id="be_status_badge">${a.status === 'published' ? 'YAYINDA' : 'TASLAK'}</span>
          <span class="be-savestate" id="be_savestate">${a.id ? 'Kaydedildi' : 'Henüz kaydedilmedi'}</span>
          <button class="btn btn-ghost" onclick="blogImportOpen()" title="Markdown / JSON içe aktar (Claude)">📥 İçe Aktar</button>
          <button class="btn btn-ghost" onclick="blogPreview()">👁 Önizle</button>
          <button class="btn btn-ghost" onclick="blogSave('draft')">Taslak Kaydet</button>
          <button class="btn btn-primary btn-purple" onclick="blogSave('published')">🚀 Yayınla</button>
        </div>
        ${_pendingBackup ? `<div class="be-report" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px">
          <span>💾 <b>Bu makalenin kaydedilmemiş yerel yedeği var</b> (${esc(backupTimeLabel(_pendingBackup))}) — son kayıttan daha yeni.</span>
          <span style="display:flex;gap:8px;flex-shrink:0"><button class="btn btn-primary btn-purple btn-sm" onclick="blogBackupRestore('${esc(a.id)}')">Geri yükle</button><button class="ba-mini" onclick="blogBackupDiscard('${esc(a.id)}')">Yoksay</button></span>
        </div>` : ''}
        <div class="be-grid">
          <div class="be-main">
            <div class="ba-tabs">
              ${LANGS.map(([c, n]) => `<div class="ba-tab ${c === _lang ? 'on' : ''}" onclick="blogTab('${c}')" data-lang="${c}"><span class="dot ${langDone(a, c) ? 'on' : ''}"></span>${n}</div>`).join('')}
              <button type="button" class="ba-mini" id="be_tr_btn" style="margin-left:auto" onclick="blogTranslateMenu()" title="TR içeriği yapay zekâ ile İngilizce ve Almancaya çevirir (başlık, özet, gövde, ürün metinleri, SEO)">🌍 TR → EN + DE çevir</button>
              <span class="ba-wc" id="be_wc" style="margin-left:10px"></span>
            </div>
            <div class="ba-pane" id="b_pane"></div>
            <div id="be_import_report"></div>
            <h3 style="margin:20px 0 8px">İçerik öğeleri <span style="opacity:.5;font-weight:400;font-size:13px">— ürün, abonelik veya özel öğe · sıralı</span></h3>
            <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
              <button type="button" class="ba-mini bk-tab ${_pickKind === 'product' ? 'on' : ''}" data-k="product" onclick="blogPickKind('product')">🛒 Ürün</button>
              <button type="button" class="ba-mini bk-tab ${_pickKind === 'subscription' ? 'on' : ''}" data-k="subscription" onclick="blogPickKind('subscription')">📺 Abonelik</button>
              <button type="button" class="ba-mini bk-tab ${_pickKind === 'custom' ? 'on' : ''}" data-k="custom" onclick="blogPickKind('custom')">✏️ Özel öğe</button>
            </div>
            <div id="b_pick_product" class="bk-pane" ${_pickKind !== 'product' ? 'style="display:none"' : ''}>
              <div style="position:relative" class="ba-field">
                <input class="ba-input" id="b_prodsearch" placeholder="🔍 Ürün adı yaz (sitedeki katalogdan)…" autocomplete="off" oninput="blogProdSearch(this.value)" />
                <div id="b_prodresults" class="ba-results" style="display:none"></div>
              </div>
            </div>
            <div id="b_pick_subscription" class="bk-pane" ${_pickKind !== 'subscription' ? 'style="display:none"' : ''}>
              <div style="position:relative" class="ba-field">
                <input class="ba-input" id="b_subsearch" placeholder="🔍 Abonelik adı yaz (Netflix, Spotify…) — Abonelikler sayfasına linklenir" autocomplete="off" oninput="blogSubSearch(this.value)" />
                <div id="b_subresults" class="ba-results" style="display:none"></div>
              </div>
            </div>
            <div id="b_pick_custom" class="bk-pane" ${_pickKind !== 'custom' ? 'style="display:none"' : ''}>
              <button class="ba-mini" onclick="blogCustomAdd()" style="padding:10px 16px;font-size:13px;font-weight:700">+ Özel öğe ekle</button>
              <span style="opacity:.5;font-size:12px;margin-left:8px">Katalogda olmayan ürün/hizmet için.</span>
            </div>
            <div id="b_prodlist" style="margin-top:12px"></div>
            <h3 style="margin:24px 0 8px">Bitiş yazısı <span style="opacity:.5;font-weight:400;font-size:13px">— ürünlerden sonra · aktif dil</span></h3>
            <div class="ba-field"><div id="b_concl_head">${rteHead('concl', 'Bitiş yazısı')}</div><div id="b_concl_wrap" class="ba-rte"></div></div>
            <h3 style="margin:24px 0 8px">Yorumlar <span style="opacity:.5;font-weight:400;font-size:13px">— moderasyon</span></h3>
            <div id="b_comments" style="opacity:.6;font-size:13px">${a.id ? 'Yükleniyor…' : 'Önce makaleyi kaydet.'}</div>
          </div>
          <aside class="be-side">
            <div class="be-card">
              <h4>Yayın</h4>
              <div class="ba-field"><label>Durum</label>
                <select class="ba-input" id="b_status" onchange="blogStatusChange(this.value)">
                  <option value="draft"${a.status !== 'published' ? ' selected' : ''}>Taslak</option>
                  <option value="published"${a.status === 'published' ? ' selected' : ''}>Yayında</option>
                </select></div>
              <div class="ba-field"><label>Yayın tarihi</label><input class="ba-input" id="b_pub" type="datetime-local" value="${esc(a.publishedAt || '')}" onchange="blogMarkDirty()" /></div>
              <div class="ba-field"><label>Kategori</label>
                <input class="ba-input" id="b_category" list="b_catlist" value="${esc(a.category || '')}" placeholder="kategori seç ya da yaz…" oninput="blogMarkDirty()" />
                <datalist id="b_catlist">${_cats.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
              </div>
              <div class="ba-field" style="margin:0"><label>Yazar <span style="opacity:.5">(opsiyonel)</span></label><input class="ba-input" id="b_author" value="${esc(a.author || '')}" placeholder="boş bırakılabilir" oninput="blogMarkDirty()" /></div>
            </div>
            <div class="be-card">
              <h4>Kapak görseli</h4>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
                <label class="ba-mini" style="cursor:pointer">📷 Yükle<input type="file" accept="image/*" style="display:none" onchange="blogUploadCover(this)"></label>
                <button class="ba-mini" onclick="blogSetCover('__default__')" title="Varsayılana dön (ilk ürün görseli)">↺ İlk ürün</button>
              </div>
              <input class="ba-input" id="b_cover" value="${esc(a.cover || '')}" placeholder="veya https://… görsel linki" oninput="blogSetCover(this.value)" />
              <div id="b_coverthumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
              <img id="b_cover_prev" src="" style="width:100%;margin-top:10px;border-radius:10px;background:#fff;display:none" onerror="this.style.display='none'" />
            </div>
            <div class="be-card">
              <h4>SEO · <span id="be_seo_lang">${_lang.toUpperCase()}</span></h4>
              <div class="be-serp">
                <div class="u" id="serp_u"></div>
                <span class="t" id="serp_t"></span>
                <div class="d" id="serp_d"></div>
              </div>
              <div class="ba-field"><label>Meta title <span class="ba-count" id="cnt_mt"></span></label><input class="ba-input" id="p_metaTitle" oninput="blogSeoField('metaTitle', this.value)" /></div>
              <div class="ba-field"><label>Meta description <span class="ba-count" id="cnt_md"></span></label><textarea class="ba-input" id="p_metaDescription" rows="3" oninput="blogSeoField('metaDescription', this.value)"></textarea></div>
              <div class="ba-field" style="margin:0"><label>Etiketler <span style="opacity:.5">(virgülle)</span></label><input class="ba-input" id="p_tags" oninput="blogSeoField('tags', this.value)" /></div>
            </div>
            <div class="be-card">
              <h4>Yayın öncesi kontrol</h4>
              <ul class="be-check" id="be_check"></ul>
            </div>
          </aside>
        </div>
      </div>`;
    renderPane();
    renderProducts();
    renderCoverThumbs();
    renderSeoCard();
    renderImportReport();
    initEditors();
    updateWordCount();
    if (a.id) loadComments();
  }
  function blogBackToList() {
    if (_dirty && !confirm('Kaydedilmemiş değişiklikler var. Yine de çık?')) return;
    loadBlogAdmin();
  }
  function blogStatusChange(v) { _editing.status = v; blogMarkDirty(); const b = document.getElementById('be_status_badge'); if (b) { b.textContent = v === 'published' ? 'YAYINDA' : 'TASLAK'; b.classList.toggle('pub', v === 'published'); } }

  // dil sekmesi
  function blogTab(c) {
    flushEditors(); syncPane(); _lang = c;
    _srcMode = { body: false, concl: false };
    document.querySelectorAll('.ba-tab').forEach((t) => t.classList.toggle('on', t.getAttribute('data-lang') === c));
    renderPane(); renderProducts(); renderSeoCard(); initEditors(); updateWordCount();
    const bh = document.getElementById('b_concl_head'); if (bh) bh.innerHTML = rteHead('concl', 'Bitiş yazısı');
  }
  function syncPane() {
    const a = _editing; const c = _lang;
    const g = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    if (document.getElementById('p_title') != null) {
      a['title_' + c] = g('p_title'); a['lead_' + c] = g('p_lead'); a['slug_' + c] = g('p_slug');
    }
    const mt = g('p_metaTitle'); if (mt !== undefined) a['metaTitle_' + c] = mt;
    const md = g('p_metaDescription'); if (md !== undefined) a['metaDescription_' + c] = md;
    const tg = g('p_tags'); if (tg !== undefined) a['tags_' + c] = tg;
    if (g('b_category') !== undefined) a.category = g('b_category');
    if (g('b_author') !== undefined) a.author = g('b_author');
    if (g('b_pub') !== undefined) a.publishedAt = g('b_pub');
    const st = document.getElementById('b_status'); if (st) a.status = st.value;
    flushEditors();
  }
  function renderPane() {
    const a = _editing; const c = _lang; const pane = document.getElementById('b_pane'); if (!pane) return;
    pane.innerHTML = `
      <div class="ba-field"><input class="ba-input ba-title-input" id="p_title" value="${esc(a['title_' + c] || '')}" placeholder="Makale başlığı (${c.toUpperCase()})" oninput="blogTitleInput(this.value)" /></div>
      <div class="ba-field"><label>Slug · ${c.toUpperCase()} <span style="opacity:.5">(URL — boşsa başlıktan üretilir)</span></label><input class="ba-input" id="p_slug" value="${esc(a['slug_' + c] || '')}" placeholder="${c === 'en' ? 'best-phones-2026' : c === 'de' ? 'beste-handys-2026' : 'en-iyi-telefonlar-2026'}" oninput="this.dataset.touched='1';blogMarkDirty();blogRenderSerp()" /></div>
      <div class="ba-field"><label>Kısa özet (lead) <span class="ba-count" id="cnt_lead"></span></label><textarea class="ba-input" id="p_lead" rows="2" oninput="blogLeadInput(this.value)">${esc(a['lead_' + c] || '')}</textarea></div>
      <div class="ba-field"><div id="p_body_head">${rteHead('body', 'Giriş / genel yazı')}</div><div id="p_body_wrap" class="ba-rte"></div></div>`;
    updateCounters();
  }
  function blogTitleInput(v) {
    const c = _lang;
    _editing['title_' + c] = v;
    const tt = document.getElementById('be_tt'); if (tt) tt.textContent = v || 'Yeni makale';
    // slug boşken otomatik üret (yalnız yeni/yayınlanmamış makalede)
    const slugEl = document.getElementById('p_slug');
    if (slugEl && !slugEl.dataset.touched && (!_editing.id || _editing.status !== 'published') && !(_editing['slug_' + c] || '').trim()) {
      slugEl.value = slugify(v); // gerçek kayıt save sırasında slugify'dan geçer
    }
    blogMarkDirty(); blogRenderSerp(); updateChecklist(); updateWordCount();
    const tab = document.querySelector(`.ba-tab[data-lang="${c}"] .dot`); if (tab) tab.classList.toggle('on', Boolean(v));
  }
  function blogLeadInput(v) { _editing['lead_' + _lang] = v; blogMarkDirty(); blogRenderSerp(); updateCounters(); updateChecklist(); updateWordCount(); }
  function blogSeoField(f, v) { _editing[f === 'tags' ? 'tags_' + _lang : f + '_' + _lang] = v; blogMarkDirty(); blogRenderSerp(); updateCounters(); }

  // SEO kartı + sayaçlar + checklist
  function renderSeoCard() {
    const a = _editing; const c = _lang;
    const lt = document.getElementById('be_seo_lang'); if (lt) lt.textContent = c.toUpperCase();
    const mt = document.getElementById('p_metaTitle'); if (mt) mt.value = a['metaTitle_' + c] || '';
    const md = document.getElementById('p_metaDescription'); if (md) md.value = a['metaDescription_' + c] || '';
    const tg = document.getElementById('p_tags'); if (tg) tg.value = a['tags_' + c] || '';
    blogRenderSerp(); updateCounters(); updateChecklist();
  }
  function blogRenderSerp() {
    const a = _editing; const c = _lang;
    const g = (id) => (document.getElementById(id) || {}).value || '';
    const title = (g('p_metaTitle') || g('p_title') || a['metaTitle_' + c] || a['title_' + c] || 'Makale başlığı').slice(0, 65);
    const desc = (g('p_metaDescription') || g('p_lead') || a['metaDescription_' + c] || a['lead_' + c] || 'Meta açıklama ya da kısa özet burada görünür.').slice(0, 170);
    const slug = slugify(g('p_slug') || a['slug_' + c] || g('p_title') || a['title_' + c] || 'makale-slug');
    const su = document.getElementById('serp_u'); if (su) su.textContent = `qorai.net › blog › ${slug}`;
    const st = document.getElementById('serp_t'); if (st) st.textContent = title;
    const sd = document.getElementById('serp_d'); if (sd) sd.textContent = desc;
  }
  function setCnt(id, len, max) {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = `${len}/${max}`;
    el.classList.toggle('bad', len > max);
  }
  function updateCounters() {
    const c = _lang; const a = _editing;
    const g = (id, f) => { const el = document.getElementById(id); return el ? el.value : (a[f + '_' + c] || ''); };
    setCnt('cnt_mt', (g('p_metaTitle', 'metaTitle') || g('p_title', 'title')).length, 60);
    setCnt('cnt_md', (g('p_metaDescription', 'metaDescription') || g('p_lead', 'lead')).length, 155);
    setCnt('cnt_lead', g('p_lead', 'lead').length, 160);
  }
  function updateChecklist() {
    const el = document.getElementById('be_check'); if (!el) return;
    const a = _editing;
    const words = totalWords('tr');
    const rows = [
      [Boolean(a.title_tr), 'TR başlık'],
      [Boolean((a.lead_tr || '').trim()), 'TR kısa özet (lead)'],
      [Boolean(a.cover || a.coverFile || (_products[0] && (_products[0].image || _products[0].imageUrl))), 'Kapak görseli'],
      [words >= 300, `İçerik ≥ 300 kelime (şu an ${words})`],
      [_products.length > 0, 'En az 1 içerik öğesi'],
      [Boolean((a['metaDescription_tr'] || a.lead_tr || '').trim()), 'Meta description'],
      [Boolean(a.title_en), 'EN çeviri'],
      [Boolean(a.title_de), 'DE çeviri'],
      [Boolean(a.category), 'Kategori'],
    ];
    el.innerHTML = rows.map(([ok, label]) => `<li><span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '○'}</span> ${label}</li>`).join('');
  }
  function totalWords(c) {
    const a = _editing;
    let w = wordCount(a['title_' + c]) + wordCount(a['lead_' + c]) + wordCount(stripHtml(a['body_' + c])) + wordCount(stripHtml(a['conclusion_' + c]));
    for (const p of _products) {
      for (const b of (p.blocks || [])) if (b.t === 'text') w += wordCount(b[c]);
    }
    return w;
  }
  function updateWordCount() {
    const el = document.getElementById('be_wc'); if (!el) return;
    flushEditors();
    const w = totalWords(_lang);
    el.textContent = `${w} kelime · ~${Math.max(1, Math.round(w / 200))} dk okuma`;
  }

  // ── otokayıt ──────────────────────────────────────────────────
  function saveSnapshotJson() {
    try { return JSON.stringify({ e: _editing, p: _products }); } catch (_) { return String(Math.random()); }
  }
  function setSaveState(cls, text) {
    const el = document.getElementById('be_savestate'); if (!el) return;
    el.className = 'be-savestate ' + (cls || ''); el.textContent = text;
  }
  function blogMarkDirty() {
    _dirty = true;
    flushEditors();
    saveBackup(); // çökme koruması: her değişiklik ~1 sn içinde yerel yedeğe
    setSaveState('dirty', _editing && _editing.status === 'published' ? '● Kaydedilmemiş değişiklik — Kaydet/Yayınla' : '● Kaydedilmemiş…');
    clearTimeout(_autoTimer);
    // Otokayıt YALNIZ taslaklar için — yayındaki makaleye yarım değişiklik basılmaz.
    if (_editing && _editing.status !== 'published') {
      _autoTimer = setTimeout(autoSave, 2000);
    }
    updateChecklist();
  }
  function stopAutosave() { clearTimeout(_autoTimer); _autoTimer = null; clearTimeout(_backupTimer); _dirty = false; }

  // ── ÇÖKME KORUMASI: localStorage yedekleri ────────────────────
  // Her değişiklik ~1 sn içinde yerel yedeğe yazılır; sekme kapanması,
  // tarayıcı çökmesi, elektrik kesintisi veri kaybettirmez. Başarılı PB
  // kaydında yedek silinir; editör/galeri açılışında kalan yedek sunulur.
  function backupKey(id) { return 'qor.blogDraft.' + (id || 'new'); }
  let _backupTimer = null;
  function saveBackup() {
    clearTimeout(_backupTimer);
    _backupTimer = setTimeout(() => {
      try {
        localStorage.setItem(backupKey(_editing && _editing.id), JSON.stringify({ e: _editing, p: _products, at: Date.now() }));
      } catch (_) { /* dolu localStorage sessiz geçilir */ }
    }, 800);
  }
  function loadBackup(id) {
    try {
      const b = JSON.parse(localStorage.getItem(backupKey(id)) || 'null');
      return (b && b.e) ? b : null;
    } catch (_) { return null; }
  }
  function clearBackup(id) { try { localStorage.removeItem(backupKey(id)); } catch (_) { /* */ } }
  function backupTimeLabel(b) {
    try { const d = new Date(b.at); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (_) { return ''; }
  }
  function blogBackupRestore(id) {
    const b = loadBackup(id); if (!b) { toast('Yedek bulunamadı', 'w'); return; }
    _pendingBackup = null;
    _editing = b.e; _products = Array.isArray(b.p) ? b.p : [];
    _lang = 'tr'; _srcMode = { body: false, concl: false }; _importReport = null;
    renderEditor();
    _dirty = true; setSaveState('dirty', '● Yerel yedekten geri yüklendi — kaydetmeyi unutma');
    toast('Yedek geri yüklendi — kontrol et ve kaydet', 's');
  }
  function blogBackupDiscard(id) {
    clearBackup(id); _pendingBackup = null; toast('Yedek silindi', 's');
    if (id === 'new' && (!_editing || !_editing.id)) renderTplGallery(); else renderEditor();
  }
  // Sekme kapanırken kaydedilmemiş değişiklik uyarısı (yedek yine de durur).
  window.addEventListener('beforeunload', (e) => {
    if (_dirty && _editing) { e.preventDefault(); e.returnValue = ''; }
  });
  async function autoSave() {
    if (_saving || !_editing) return;
    syncPane();
    if (!(_editing.title_tr || '').trim()) return; // başlıksız otokayıt olmaz
    const snap = saveSnapshotJson();
    if (snap === _lastSavedJson) { _dirty = false; setSaveState('ok', '✓ Kaydedildi'); return; }
    try {
      await blogSave('draft', true);
      const t = new Date();
      setSaveState('ok', `✓ Otomatik kaydedildi ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
    } catch (_) { setSaveState('dirty', '⚠ Otokayıt başarısız — elle kaydet'); }
  }

  // ── kapak ─────────────────────────────────────────────────────
  function effectiveCover() {
    const a = _editing; const fp = _products[0] || {};
    if (a.cover) return a.cover;
    if (a.coverFile && a.id) { try { return pbFileUrl(a, a.coverFile); } catch (_) { /* */ } }
    return fp.image || fp.imageUrl || '';
  }
  function renderCoverThumbs() {
    const box = document.getElementById('b_coverthumbs'); if (!box) return;
    const imgs = _products.map((p) => p.image || p.imageUrl || '').filter(Boolean);
    const cur = _editing.cover || '';
    box.innerHTML = imgs.map((u, i) => `<img src="${esc(u)}" title="${i === 0 ? 'İlk ürün (varsayılan)' : 'Ürün görseli'} — kapak yap" onclick="blogSetCover('${esc(u).replace(/'/g, "\\'")}')" style="width:48px;height:48px;object-fit:contain;background:#fff;border-radius:8px;cursor:pointer;border:2px solid ${cur === u || (!cur && !_editing.coverFile && i === 0) ? '#7c3aed' : 'transparent'}" />`).join('')
      || '<span style="opacity:.5;font-size:12px">Ürün ekleyince görselleri buradan kapak seçebilirsin.</span>';
    const prev = document.getElementById('b_cover_prev'); const eff = effectiveCover();
    if (prev) { prev.src = eff || ''; prev.style.display = eff ? 'block' : 'none'; }
  }
  function blogSetCover(url) {
    if (url === '__default__') { const fp = _products[0] || {}; url = fp.image || fp.imageUrl || ''; }
    _editing.cover = url || '';
    if (url) _editing.coverFile = '';
    const ci = document.getElementById('b_cover'); if (ci && ci.value !== (url || '')) ci.value = url || '';
    renderCoverThumbs(); blogMarkDirty();
  }
  // Ortak medya yükleme: dosyayı makalenin media alanına ekler, URL döner.
  async function uploadMediaFile(file) {
    if (!_editing.id) { flushEditors(); syncPane(); await blogSave('draft', true); }
    if (!_editing.id) { toast('Önce TR başlık yaz (taslak otomatik kaydedilir)', 'w'); return ''; }
    const fd = new FormData(); fd.append('media+', file);
    const rec = await getPb().collection('articles').update(_editing.id, fd, { $autoCancel: false });
    const fname = Array.isArray(rec.media) ? rec.media[rec.media.length - 1] : rec.media;
    return pbFileUrl(rec, fname);
  }
  // Gövde editörünün 🖼 butonu: URL yapıştır YA DA cihazdan yükle.
  function openBodyImageDialog(cb) {
    let m = document.getElementById('be_img_dialog'); if (m) m.remove();
    m = document.createElement('div');
    m.id = 'be_img_dialog'; m.className = 'be-modal';
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    m.innerHTML = `
      <div class="be-modal-box" style="max-width:520px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong>🖼 Görsel ekle</strong>
          <button class="ba-mini" onclick="document.getElementById('be_img_dialog').remove()">✕</button>
        </div>
        <div class="ba-field"><label>Görsel URL</label>
          <div style="display:flex;gap:8px">
            <input class="ba-input" id="be_img_url" placeholder="https://…" style="flex:1" />
            <button class="btn btn-primary btn-purple" id="be_img_add">Ekle</button>
          </div>
        </div>
        <div style="text-align:center;opacity:.5;font-size:12px;margin:4px 0">— veya —</div>
        <label class="ba-mini" style="cursor:pointer;display:block;text-align:center;padding:14px;font-size:13px">📷 Cihazdan yükle<input type="file" accept="image/*" id="be_img_file" style="display:none"></label>
        <div id="be_img_busy" style="display:none;opacity:.6;font-size:12px;text-align:center;margin-top:8px">Yükleniyor…</div>
      </div>`;
    document.body.appendChild(m);
    const done = (url) => { m.remove(); cb(url); };
    m.querySelector('#be_img_add').onclick = () => { const u = m.querySelector('#be_img_url').value.trim(); if (u) done(u); };
    m.querySelector('#be_img_url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const u = e.target.value.trim(); if (u) done(u); } });
    m.querySelector('#be_img_file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      m.querySelector('#be_img_busy').style.display = 'block';
      try { const url = await uploadMediaFile(f); if (url) done(url); else m.remove(); }
      catch (err) { toast('Yükleme başarısız: ' + err.message, 'e'); m.remove(); }
    });
    setTimeout(() => m.querySelector('#be_img_url').focus(), 50);
  }

  async function uploadCover(input) {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      if (!_editing.id) { syncPane(); await blogSave('draft', true); }
      if (!_editing.id) { toast('Önce makaleyi kaydet', 'w'); return; }
      const fd = new FormData(); fd.append('coverFile', file);
      const rec = await getPb().collection('articles').update(_editing.id, fd, { $autoCancel: false });
      _editing.coverFile = rec.coverFile; _editing.cover = '';
      const ci = document.getElementById('b_cover'); if (ci) ci.value = '';
      renderCoverThumbs();
      toast('Kapak yüklendi', 's');
    } catch (e) { toast('Yükleme başarısız: ' + e.message, 'e'); }
  }
  async function uploadProdImage(input, i) {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      if (!_editing.id) { flushEditors(); syncPane(); await blogSave('draft', true); }
      if (!_editing.id) { toast('Önce makaleyi kaydet', 'w'); return; }
      const fd = new FormData(); fd.append('media+', file);
      const rec = await getPb().collection('articles').update(_editing.id, fd, { $autoCancel: false });
      const fname = Array.isArray(rec.media) ? rec.media[rec.media.length - 1] : rec.media;
      const url = pbFileUrl(rec, fname);
      if (_products[i]) { _products[i].image = url; renderProducts(); }
      toast('Görsel yüklendi', 's');
    } catch (e) { toast('Yükleme başarısız: ' + e.message, 'e'); }
  }
  async function uploadBlockImage(input, i, j) {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      if (!_editing.id) { flushEditors(); syncPane(); await blogSave('draft', true); }
      if (!_editing.id) { toast('Önce makaleyi kaydet', 'w'); return; }
      const fd = new FormData(); fd.append('media+', file);
      const rec = await getPb().collection('articles').update(_editing.id, fd, { $autoCancel: false });
      const fname = Array.isArray(rec.media) ? rec.media[rec.media.length - 1] : rec.media;
      const url = pbFileUrl(rec, fname);
      if (_products[i] && _products[i].blocks && _products[i].blocks[j]) { _products[i].blocks[j].url = url; renderProducts(); }
      toast('Görsel yüklendi', 's');
    } catch (e) { toast('Yükleme başarısız: ' + e.message, 'e'); }
  }

  // ── içerik öğeleri (blok modeli websiteyle aynı) ──────────────
  function ensureBlocks(p) {
    if (Array.isArray(p.blocks)) {
      if (!p.blocks.length) p.blocks.push({ t: 'text', tr: '', en: '', de: '' });
      return;
    }
    const blocks = [];
    const hasD1 = ['tr', 'en', 'de'].some((c) => p['desc_' + c]);
    const hasD2 = ['tr', 'en', 'de'].some((c) => p['desc2_' + c]);
    const img = p.image || p.imageUrl || p.logo || '';
    const txt = (k) => ({ t: 'text', tr: p[k + '_tr'] || '', en: p[k + '_en'] || '', de: p[k + '_de'] || '' });
    const imgBlock = () => ({ t: 'image', url: img, pos: p.layout === 'left' ? 'left' : p.layout === 'right' ? 'right' : 'full', size: p.imgSize || 'm' });
    const layout = p.layout || 'split';
    if (layout === 'top') { if (img) blocks.push(imgBlock()); if (hasD1) blocks.push(txt('desc')); if (hasD2) blocks.push(txt('desc2')); }
    else if (layout === 'text') { if (hasD1) blocks.push(txt('desc')); if (hasD2) blocks.push(txt('desc2')); }
    else { if (hasD1) blocks.push(txt('desc')); if (img) blocks.push(imgBlock()); if (hasD2) blocks.push(txt('desc2')); }
    if (!blocks.some((b) => b.t === 'text')) blocks.push({ t: 'text', tr: '', en: '', de: '' });
    p.blocks = blocks;
  }
  function blogBlockAdd(i, type) {
    const p = _products[i]; if (!p) return; ensureBlocks(p);
    p.blocks.push(type === 'image' ? { t: 'image', url: '', pos: 'right', size: 'm' } : { t: 'text', tr: '', en: '', de: '' });
    renderProducts(); blogMarkDirty();
  }
  function blogBlockRemove(i, j) {
    const p = _products[i]; if (!p || !p.blocks) return;
    p.blocks.splice(j, 1);
    if (!p.blocks.length) p.blocks.push({ t: 'text', tr: '', en: '', de: '' });
    renderProducts(); blogMarkDirty();
  }
  function blogBlockMove(i, j, d) {
    const p = _products[i]; if (!p || !p.blocks) return;
    const k = j + d; if (k < 0 || k >= p.blocks.length) return;
    const tmp = p.blocks[j]; p.blocks[j] = p.blocks[k]; p.blocks[k] = tmp; renderProducts(); blogMarkDirty();
  }
  function blogBlockField(i, j, key, v) { const p = _products[i]; if (p && p.blocks && p.blocks[j]) { p.blocks[j][key] = v; blogMarkDirty(); } }

  function _normImg(url) {
    const u = String(url || '').trim();
    const m = u.match(/^https?:\/\/[^/]*\bwiki(?:pedia|media)\.org\/wiki\/(?:File|Dosya|Datei|Fichier|Archivo):(.+)$/i);
    return m ? ('https://commons.wikimedia.org/wiki/Special:FilePath/' + m[1]) : u;
  }
  function _imgPreviewHtml(url) {
    if (!url) return '';
    const nu = _normImg(url);
    const px = (getPb().baseUrl || '').replace(/\/$/, '') + '/api/img?url=' + encodeURIComponent(nu);
    const onerr = "if(this.getAttribute('data-st')!=='px'){this.setAttribute('data-st','px');this.src=this.getAttribute('data-px')}else{this.style.display='none';var w=this.parentElement.querySelector('.bk-imgwarn');if(w)w.style.display='inline-block'}";
    const onload = "var w=this.parentElement.querySelector('.bk-imgwarn');if(w)w.style.display='none'";
    return `<div style="margin-top:8px"><img src="${esc(nu)}" data-px="${esc(px)}" style="max-height:78px;border-radius:8px;background:#fff" onload="${onload}" onerror="${onerr}"/><span class="bk-imgwarn" style="display:none;font-size:11px;color:#f59e0b">⚠ Görsel yüklenemedi — doğrudan görsel linki gerekli (.png/.jpg/.svg) ya da “Yükle” ile cihazdan ekle.</span></div>`;
  }

  function renderProducts() {
    const box = document.getElementById('b_prodlist'); if (!box) return;
    const langName = (LANGS.find(([c]) => c === _lang) || [])[1] || _lang;
    _products.forEach(ensureBlocks);
    box.innerHTML = _products.map((p, i) => `
      <div class="ba-prod">
        <div class="ba-prod-ord">
          <button class="ba-mini" onclick="blogProdMove(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="ba-mini" onclick="blogProdMove(${i},1)" ${i === _products.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <img src="${esc(p.image || p.imageUrl || p.logo || '')}" onerror="this.style.visibility='hidden'"/>
        <div style="flex:1;min-width:0">
          ${(() => { const k = p.kind || 'product'; const kl = k === 'subscription' ? '📺 Abonelik' : k === 'custom' ? '✏️ Özel' : '🛒 Ürün'; return `<span class="ba-prod-kind k-${k}">${kl}</span>`; })()}
          ${(p.kind || 'product') === 'custom'
            ? `<div style="font-weight:700;display:flex;gap:6px;align-items:center"><span>${i + 1}.</span><input class="ba-input" style="font-size:13px;font-weight:700;padding:4px 8px" value="${esc(p['name_' + _lang] || '')}" placeholder="İsim (${esc(langName)})" oninput="blogProdField(${i},'name_${_lang}',this.value)" /></div>
               <div style="font-size:11px;opacity:.5;margin:2px 0 6px">İsim her dil için ayrı — sekmeyi değiştirip ${esc(langName)} adını yaz</div>
               <div style="margin:0 0 8px"><input class="ba-input" style="font-size:12px" value="${esc(p.link || '')}" placeholder="Bağlantı (opsiyonel) https://…" oninput="blogProdField(${i},'link',this.value)" /></div>`
            : `<div style="font-weight:700">${i + 1}. ${esc(p.name)}</div>
               <div style="opacity:.55;font-size:12px;margin-bottom:8px">${(p.kind === 'subscription') ? `→ /subscriptions${p.affiliateUrl || p.website ? ' · resmi site' : ''}` : `→ /product/${esc(p.slug)}-${esc(p.id)}`} · <b>${esc(langName)}</b></div>
               ${(p.kind || 'product') === 'product' ? `<div style="font-size:12px;margin-bottom:8px"><span style="opacity:.55">💰 Canlı fiyat (cron):</span> <b>${p._livePrice ? esc(p._livePrice) : '<span style=\'opacity:.5\'>okunuyor…</span>'}</b></div>` : ''}`}
          <div class="bk-blocks">
            ${p.blocks.map((b, j) => b.t === 'image'
              ? `<div class="bk-block">
                   <div class="bk-block-bar"><span>🖼 Görsel ${j + 1}</span><span class="bk-block-ord"><button class="ba-mini" onclick="blogBlockMove(${i},${j},-1)" ${j === 0 ? 'disabled' : ''}>↑</button><button class="ba-mini" onclick="blogBlockMove(${i},${j},1)" ${j === p.blocks.length - 1 ? 'disabled' : ''}>↓</button><button class="ba-mini" style="color:#f87171" onclick="blogBlockRemove(${i},${j})">✕</button></span></div>
                   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
                     <input class="ba-input" style="flex:1;min-width:150px;font-size:12px" placeholder="Görsel URL" value="${esc(b.url || '')}" oninput="blogBlockField(${i},${j},'url',this.value)" />
                     <label class="ba-mini" style="cursor:pointer;white-space:nowrap">📷 Yükle<input type="file" accept="image/*" style="display:none" onchange="blogUploadBlockImage(this,${i},${j})"></label>
                     <select class="ba-input" style="width:160px;font-size:12px" onchange="blogBlockField(${i},${j},'pos',this.value)" title="Konum">
                       ${[['left', '◧ Solda · yazı sağda'], ['right', '◨ Sağda · yazı solda'], ['center', '▣ Ortada'], ['full', '▭ Tam genişlik']].map(([v, n]) => `<option value="${v}"${(b.pos || 'full') === v ? ' selected' : ''}>${n}</option>`).join('')}
                     </select>
                     <select class="ba-input" style="width:100px;font-size:12px" onchange="blogBlockField(${i},${j},'size',this.value)" title="Yükseklik sınırı">
                       ${[['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük'], ['xl', 'Çok büyük']].map(([v, n]) => `<option value="${v}"${(b.size || 'm') === v ? ' selected' : ''}>🖼 ${n}</option>`).join('')}
                     </select>
                     <label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;opacity:.85" title="Genişlik — boş bırakılırsa konuma göre otomatik">↔
                       <input class="ba-input" type="number" min="15" max="100" step="5" style="width:70px;font-size:12px;padding:6px 8px" placeholder="oto" value="${b.w ? esc(b.w) : ''}" oninput="blogBlockField(${i},${j},'w',this.value ? Number(this.value) : '')" />%
                     </label>
                   </div>
                   <input class="ba-input" style="font-size:12px;margin-top:6px" placeholder="Altyazı (opsiyonel, ${esc(langName)}) — görselin altında küçük yazıyla görünür" value="${esc(b['cap_' + _lang] || '')}" oninput="blogBlockField(${i},${j},'cap_${_lang}',this.value)" />
                   ${_imgPreviewHtml(b.url)}
                 </div>`
              : `<div class="bk-block">
                   <div class="bk-block-bar"><span>✍ Metin ${j + 1} · ${esc(langName)}</span><span class="bk-block-ord"><button class="ba-mini" onclick="blogBlockMove(${i},${j},-1)" ${j === 0 ? 'disabled' : ''}>↑</button><button class="ba-mini" onclick="blogBlockMove(${i},${j},1)" ${j === p.blocks.length - 1 ? 'disabled' : ''}>↓</button><button class="ba-mini" style="color:#f87171" onclick="blogBlockRemove(${i},${j})">✕</button></span></div>
                   <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
                     <select class="ba-input" style="width:170px;font-size:12px" onchange="blogBlockField(${i},${j},'style',this.value)" title="Metin tipi">
                       ${[['paragraph', '¶ Paragraf'], ['heading', '◆ Büyük başlık'], ['subheading', '— Alt başlık'], ['bullets', '• Madde listesi']].map(([v, n]) => `<option value="${v}"${(b.style || 'paragraph') === v ? ' selected' : ''}>${n}</option>`).join('')}
                     </select>
                     <span style="font-size:11px;opacity:.55">Vurgu için <b>**kalın**</b> · madde için satır başına "-"</span>
                   </div>
                   <textarea class="ba-input" style="font-size:13px;margin-top:6px" rows="4" placeholder="${(b.style || 'paragraph') === 'bullets' ? 'Her satır bir madde olur' : (b.style === 'heading' || b.style === 'subheading') ? 'Başlık metni' : 'Paragraf metni — her satır ayrı görünür'} (${esc(langName)})" oninput="blogBlockField(${i},${j},'${_lang}',this.value)">${esc(b[_lang] || '')}</textarea>
                 </div>`).join('')}
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="ba-mini" onclick="blogBlockAdd(${i},'text')">＋ Metin</button>
              <button class="ba-mini" onclick="blogBlockAdd(${i},'image')">＋ Görsel</button>
            </div>
          </div>
        </div>
        <button class="ba-mini" onclick="blogProdRemove(${i})" style="color:#f87171">✕</button>
      </div>`).join('') || '<div style="opacity:.5;padding:8px">Henüz öğe eklenmedi — yukarıdan ürün ara ya da “İçe Aktar” ile Claude çıktısını yükle.</div>';
    renderCoverThumbs();
  }

  function blogProdSearch(q) {
    clearTimeout(_searchTimer);
    const res = document.getElementById('b_prodresults');
    if (!q || q.trim().length < 2) { if (res) res.style.display = 'none'; return; }
    _searchTimer = setTimeout(async () => {
      try {
        const r = await window.TsClient.search(q, { perPage: 8 });
        const hits = (r.hits || []).map((h) => h.document);
        res.innerHTML = hits.map((d) => `<div class="hit" onclick='blogProdAdd(${JSON.stringify({ id: d.id, slug: d.slug || '', name: d.name, brand: d.brand || '', techScore: d.techScore || 0, imageUrl: d.imageUrl || '' }).replace(/'/g, "&#39;")})'>
            <img src="${esc(d.imageUrl || '')}" style="width:34px;height:34px;object-fit:contain;background:#fff;border-radius:6px"/>
            <span>${esc(d.name)} <span style="opacity:.5">${esc(d.brand || '')}</span></span></div>`).join('') || '<div style="padding:10px;opacity:.6">Eşleşme yok</div>';
        res.style.display = 'block';
      } catch (e) { /* ignore */ }
    }, 250);
  }
  function blogProdAdd(p) {
    if (!p || !p.id) return;
    p.kind = 'product';
    if (!_products.some((x) => x.id === p.id)) { p.slug = p.slug || slugify(p.name); _products.push(p); renderProducts(); blogProdFetchPrice(p.id); blogMarkDirty(); }
    const res = document.getElementById('b_prodresults'); if (res) res.style.display = 'none';
    const inp = document.getElementById('b_prodsearch'); if (inp) inp.value = '';
  }
  const _CUR = { TR: 'TRY', DE: 'EUR', GB: 'GBP', US: 'USD' };
  const _LOC = { TR: 'tr-TR', DE: 'de-DE', GB: 'en-GB', US: 'en-US' };
  async function blogProdFetchPrice(id) {
    try {
      const pb = getPb();
      const r = await pb.collection('products').getOne(id, { fields: 'id,prices,lowestPrice,lowestPriceCurrency', $autoCancel: false });
      const prices = r.prices || {};
      const parts = [];
      for (const cc of ['TR', 'DE', 'GB', 'US']) {
        const amt = Number(prices[cc]) || 0;
        if (amt > 0) { try { parts.push(new Intl.NumberFormat(_LOC[cc], { style: 'currency', currency: _CUR[cc], maximumFractionDigits: 0 }).format(amt)); } catch { parts.push(`${Math.round(amt)} ${_CUR[cc]}`); } }
      }
      const rec = _products.find((x) => x.id === id);
      if (rec) { rec._livePrice = parts.length ? parts.join(' · ') : '—'; renderProducts(); }
    } catch (_) { /* fiyat yoksa sessiz geç */ }
  }
  function blogProdRemove(i) { _products.splice(i, 1); renderProducts(); blogMarkDirty(); }
  function blogProdMove(i, d) { const j = i + d; if (j < 0 || j >= _products.length) return; const t = _products[i]; _products[i] = _products[j]; _products[j] = t; renderProducts(); blogMarkDirty(); }
  function blogProdField(i, key, v) { if (_products[i]) { _products[i][key] = v; blogMarkDirty(); } }

  function blogPickKind(k) {
    _pickKind = k;
    document.querySelectorAll('.bk-tab').forEach((t) => t.classList.toggle('on', t.getAttribute('data-k') === k));
    ['product', 'subscription', 'custom'].forEach((kk) => { const el = document.getElementById('b_pick_' + kk); if (el) el.style.display = kk === k ? 'block' : 'none'; });
    const focusId = k === 'product' ? 'b_prodsearch' : k === 'subscription' ? 'b_subsearch' : '';
    if (focusId) setTimeout(() => document.getElementById(focusId)?.focus(), 30);
  }
  function blogSubSearch(q) {
    clearTimeout(_subSearchTimer);
    const res = document.getElementById('b_subresults');
    if (!q || q.trim().length < 2) { if (res) res.style.display = 'none'; return; }
    _subSearchTimer = setTimeout(async () => {
      try {
        const r = await getPb().collection('subscriptions').getList(1, 8, {
          filter: `name ~ "${q.replace(/"/g, '\\"')}"`, sort: 'name', $autoCancel: false,
        });
        const hits = r.items || [];
        res.innerHTML = hits.map((d) => `<div class="hit" onclick='blogSubAdd(${JSON.stringify({ id: d.id, slug: d.slug || '', name: d.name, logo: d.logo || '', website: d.website || '', affiliateUrl: d.affiliateUrl || '', category: d.category || '' }).replace(/'/g, '&#39;')})'>
            <img src="${esc(d.logo || '')}" style="width:34px;height:34px;object-fit:contain;background:#fff;border-radius:6px"/>
            <span>${esc(d.name)} <span style="opacity:.5">${esc(d.category || '')}</span></span></div>`).join('') || '<div style="padding:10px;opacity:.6">Eşleşme yok</div>';
        res.style.display = 'block';
      } catch (e) { if (res) { res.innerHTML = `<div style="padding:10px;color:#ef4444">${esc(e.message)}</div>`; res.style.display = 'block'; } }
    }, 250);
  }
  function blogSubAdd(s) {
    if (!s || !s.id) return;
    if (!_products.some((x) => x.kind === 'subscription' && x.id === s.id)) {
      _products.push({ kind: 'subscription', id: s.id, slug: s.slug || slugify(s.name), name: s.name, image: '', imageUrl: s.logo || '', logo: s.logo || '', website: s.website || '', affiliateUrl: s.affiliateUrl || '', category: s.category || '' });
      renderProducts(); blogMarkDirty();
    }
    const res = document.getElementById('b_subresults'); if (res) res.style.display = 'none';
    const inp = document.getElementById('b_subsearch'); if (inp) inp.value = '';
  }
  function blogCustomAdd(name) {
    _products.push({ kind: 'custom', id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), slug: '', name: name || '', name_tr: name || '', name_en: name || '', name_de: name || '', link: '', image: '', imageUrl: '', blocks: [{ t: 'text', tr: '', en: '', de: '' }] });
    renderProducts(); blogMarkDirty();
    if (!name) setTimeout(() => {
      const list = document.getElementById('b_prodlist');
      const cards = list ? list.querySelectorAll('.ba-prod') : [];
      const last = cards[cards.length - 1];
      if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); const inp = last.querySelector('input'); if (inp) inp.focus(); }
    }, 40);
  }

  // ── İÇE AKTAR ─────────────────────────────────────────────────
  function blogImportOpen(tab) {
    let m = document.getElementById('be_import_modal');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'be_import_modal';
    m.className = 'be-modal';
    m.onclick = (e) => { if (e.target === m) blogImportClose(); };
    m.innerHTML = `
      <div class="be-modal-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong style="font-size:16px">📥 Makale içe aktar</strong>
          <button class="ba-mini" onclick="blogImportClose()">✕ Kapat</button>
        </div>
        <div class="be-modal-tabs">
          <button class="ba-mini bk-tab" data-t="md" onclick="blogImportTab('md')">📝 Markdown (aktif dil: ${_lang.toUpperCase()})</button>
          <button class="ba-mini bk-tab" data-t="json" onclick="blogImportTab('json')">🧩 JSON (3 dil, tam makale)</button>
          <button class="ba-mini bk-tab" data-t="prompt" onclick="blogImportTab('prompt')">✨ Claude prompt'u</button>
        </div>
        <div id="be_imp_body"></div>
      </div>`;
    document.body.appendChild(m);
    blogImportTab(tab || 'md');
  }
  function blogImportClose() { const m = document.getElementById('be_import_modal'); if (m) m.remove(); }
  function blogImportTab(t) {
    document.querySelectorAll('#be_import_modal .bk-tab').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === t));
    const box = document.getElementById('be_imp_body'); if (!box) return;
    if (t === 'md') {
      box.innerHTML = `
        <p style="font-size:13px;opacity:.7;margin:0 0 10px">Claude'un yazdığı makaleyi olduğu gibi yapıştır. <b># Başlık</b> → başlık, ilk paragraf → özet, <b>## 1. Ürün Adı</b> bölümleri → ürün öğeleri (katalogdan otomatik eşleştirilir), <b>## Sonuç</b> → bitiş yazısı olur. Tablolar desteklenir.</p>
        <textarea id="be_imp_md" class="be-imp-ta" placeholder="# 2026'nın En İyi 5 Telefonu&#10;&#10;Kısa özet paragrafı…&#10;&#10;## Neden bu liste?&#10;…&#10;&#10;## 1. iPhone 15&#10;Açıklama… **kalın** ve - maddeler desteklenir&#10;&#10;## Sonuç&#10;…"></textarea>
        <div class="be-imp-opt">
          <label><input type="checkbox" id="be_opt_title" checked> Başlık + özeti al</label>
          <label><input type="checkbox" id="be_opt_items" checked> "## N. Ürün" bölümlerini öğeye dönüştür</label>
          <label><input type="checkbox" id="be_opt_concl" checked> "## Sonuç" bölümünü ayır</label>
          <label><input type="checkbox" id="be_opt_replace" checked> Mevcut ${_lang.toUpperCase()} içeriğin üzerine yaz</label>
        </div>
        <button class="btn btn-primary btn-purple" onclick="blogImportRunMd()">İçe aktar → ${_lang.toUpperCase()}</button>`;
    } else if (t === 'json') {
      box.innerHTML = `
        <p style="font-size:13px;opacity:.7;margin:0 0 10px">“Claude prompt'u” sekmesindeki şablonla üretilen JSON'u yapıştır — <b>3 dilin tamamı + ürün öğeleri</b> tek seferde dolar. Ürünler katalogdan otomatik eşleştirilir; bulunamayanlar özel öğe olarak eklenir.</p>
        <textarea id="be_imp_json" class="be-imp-ta" placeholder='{"category":"smartphones","langs":{"tr":{"title":"…"},"en":{…},"de":{…}},"items":[…]}'></textarea>
        <div class="be-imp-opt">
          <label><input type="checkbox" id="be_opt_jreplace" checked> Mevcut içeriğin üzerine yaz</label>
        </div>
        <button class="btn btn-primary btn-purple" onclick="blogImportRunJson()">İçe aktar (3 dil)</button>`;
    } else {
      box.innerHTML = `
        <p style="font-size:13px;opacity:.7;margin:0 0 10px">Bu prompt'u kopyala → Claude'a yapıştır → <b>[KONU]</b> kısmına makale konusunu yaz. Claude'un döndürdüğü JSON'u “JSON” sekmesinden içe aktar.</p>
        <textarea id="be_imp_prompt" class="be-imp-ta" readonly style="min-height:380px">${esc(buildClaudePrompt())}</textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-primary btn-purple" onclick="blogPromptCopy()">📋 Prompt'u kopyala</button>
        </div>`;
    }
  }
  function buildClaudePrompt() {
    const cats = _cats.length ? _cats.join(', ') : 'smartphones, laptops, tablets, headphones, monitors, tvs, smartwatches…';
    return `Sen Qor AI (qorai.net) için blog makalesi yazan bir editörsün. Konu: [KONU]

GÖREV: Bu konuda 3 dilde (Türkçe, İngilizce, Almanca) eksiksiz bir makale yaz ve SADECE aşağıdaki şemaya uyan geçerli bir JSON döndür. JSON dışında hiçbir şey yazma (açıklama, markdown çiti, selamlama yok).

ŞEMA:
{
  "category": "<şunlardan biri: ${cats}>",
  "langs": {
    "tr": {
      "title": "<çekici başlık, yıl içerebilir>",
      "slug": "<url-slug-kucuk-harf-tireli>",
      "lead": "<özet, 120-160 karakter>",
      "body_md": "<GİRİŞ bölümü markdown: neden bu liste/konu, nasıl seçildi. 150-300 kelime. ## alt başlıklar, **kalın**, - maddeler, | tablolar | desteklenir. Ürün anlatımlarını BURAYA YAZMA — ürünler items'ta>",
      "conclusion_md": "<SONUÇ bölümü markdown: özet + öneri, 80-150 kelime>",
      "metaTitle": "<SEO başlık, maks 60 karakter>",
      "metaDescription": "<SEO açıklama, maks 155 karakter>",
      "tags": "<virgülle 4-6 etiket>"
    },
    "en": { <aynı alanlar İngilizce> },
    "de": { <aynı alanlar Almanca> }
  },
  "items": [
    {
      "kind": "product",
      "search": "<katalog araması için sade model adı, örn: iPhone 15 | Samsung Galaxy S24 | MacBook Air M3>",
      "name": "<görünen ad>",
      "blocks": [
        { "type": "text", "style": "paragraph", "tr": "<ürün anlatımı TR — 80-150 kelime. **kalın** vurgu, '- ' ile artı/eksi maddeleri, '## ' ile ara başlık kullanabilirsin>", "en": "<aynısı EN>", "de": "<aynısı DE>" }
      ]
    }
  ]
}

KURALLAR:
- Liste makalesiyse 5-7 ürün; inceleme ise 1 ürün; karşılaştırmaysa 2 ürün.
- "search" alanı KRİTİK: mağaza eki olmadan, jenerik model adı (renk/kapasite yazma).
- Her ürünün bloğunda somut artı/eksi ve kime uygun olduğu olsun; pazarlama dili değil, dürüst değerlendirme.
- Fiyat YAZMA (site canlı fiyatı kendisi gösterir); "yaklaşık", "civarı" gibi fiyat cümleleri kurma.
- 3 dil birbirinin çevirisi olsun ama doğal aksın (kelime kelime çeviri değil).
- body_md içinde bir karşılaştırma tablosu (| Model | Ekran | Pil |…) varsa süper — tablolar destekleniyor.
- JSON string'lerinde gerçek satır sonu için \\n kullan.`;
  }
  function blogPromptCopy() {
    const ta = document.getElementById('be_imp_prompt'); if (!ta) return;
    ta.select();
    try { navigator.clipboard.writeText(ta.value); toast('Prompt kopyalandı — Claude\'a yapıştır', 's'); }
    catch (_) { document.execCommand('copy'); toast('Prompt kopyalandı', 's'); }
  }

  // katalog eşleştirme: TS araması + gevşek token kontrolü
  function tokensOf(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9ğüşöçı ]+/gi, ' ').split(/\s+/).filter(Boolean); }
  async function resolveCatalogItem(q) {
    try {
      const r = await window.TsClient.search(q, { perPage: 5 });
      const hits = (r.hits || []).map((h) => h.document);
      if (!hits.length) return null;
      const qt = tokensOf(q);
      let best = null; let bestScore = 0;
      for (const d of hits) {
        const name = `${d.brand || ''} ${d.name || ''}`;
        const nt = new Set(tokensOf(name));
        const overlap = qt.filter((t) => nt.has(t)).length;
        const score = qt.length ? overlap / qt.length : 0;
        if (score > bestScore) { bestScore = score; best = d; }
      }
      if (best && (bestScore >= 0.5 || qt.length <= 1)) {
        return { id: best.id, slug: best.slug || slugify(best.name), name: best.name, brand: best.brand || '', techScore: best.techScore || 0, imageUrl: best.imageUrl || '' };
      }
      return null;
    } catch (_) { return null; }
  }
  async function importItems(items, replace) {
    if (replace) _products = [];
    const report = [];
    for (const it of items) {
      const kind = it.kind || 'product';
      // Katalog/abonelik araması fiyat ekinden arındırılmış adla yapılır
      // ("NordVPN — 12,99 $/ay" → "NordVPN"); eşleşme bulunursa görünen ad
      // zaten katalogdan gelir, bulunmazsa yazarın yazdığı ham ad korunur.
      const q = cleanItemName(String(it.search || it.name || '').trim());
      if (kind === 'subscription' && q) {
        try {
          const r = await getPb().collection('subscriptions').getList(1, 1, { filter: `name ~ "${q.replace(/"/g, '\\"')}"`, $autoCancel: false });
          const s = (r.items || [])[0];
          if (s) {
            _products.push({ kind: 'subscription', id: s.id, slug: s.slug || slugify(s.name), name: s.name, image: '', imageUrl: s.logo || '', logo: s.logo || '', website: s.website || '', affiliateUrl: s.affiliateUrl || '', category: s.category || '', blocks: it.blocks });
            report.push({ q, ok: true, label: `${q} → ${s.name} (abonelik)` });
            continue;
          }
        } catch (_) { /* düş */ }
      }
      if (kind === 'product' && q) {
        const hit = await resolveCatalogItem(q);
        if (hit) {
          _products.push({ ...hit, kind: 'product', blocks: it.blocks });
          report.push({ q, ok: true, label: `${q} → ${hit.name} (katalog)` });
          blogProdFetchPrice(hit.id);
          continue;
        }
      }
      // bulunamadı → özel öğe (yazarın YAZDIĞI ham ad korunur: fiyat/etiket eki dahil)
      const nm = String(it.name || q || 'Öğe');
      _products.push({ kind: 'custom', id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), slug: slugify(nm), name: nm, name_tr: it.name_tr || nm, name_en: it.name_en || nm, name_de: it.name_de || nm, link: it.link || '', image: it.image || '', imageUrl: '', blocks: it.blocks });
      report.push({ q: nm, ok: false, label: `${nm} — katalogda bulunamadı, özel öğe olarak eklendi` });
    }
    _importReport = report;
  }
  function renderImportReport() {
    const box = document.getElementById('be_import_report'); if (!box) return;
    if (!_importReport || !_importReport.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="be-report">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>İçe aktarma raporu — ürün eşleştirme</b>
        <button class="ba-mini" onclick="blogImportReportClose()">✕</button>
      </div>
      ${_importReport.map((r) => `<div class="${r.ok ? 'r-ok' : 'r-warn'}">${r.ok ? '✓' : '⚠'} ${esc(r.label)}</div>`).join('')}
      <div style="opacity:.6;margin-top:6px;font-size:12px">⚠ olanları istersen sil + üstteki aramayla doğru ürünü ekle (blokları kopyalamak için önce yenisini ekle, sonra eskisini sil).</div>
    </div>`;
  }
  function blogImportReportClose() { _importReport = null; renderImportReport(); }

  async function blogImportRunMd() {
    const ta = document.getElementById('be_imp_md'); if (!ta || !ta.value.trim()) { toast('Önce markdown yapıştır', 'w'); return; }
    const opt = (id) => { const el = document.getElementById(id); return el ? el.checked : true; };
    const takeTitle = opt('be_opt_title'); const detectItems = opt('be_opt_items');
    const splitConcl = opt('be_opt_concl'); const replace = opt('be_opt_replace');
    const c = _lang;
    const parsed = parseMdArticle(ta.value, { takeTitle, detectItems, splitConclusion: splitConcl });
    flushEditors(); syncPane();
    if (takeTitle && parsed.title && (replace || !_editing['title_' + c])) _editing['title_' + c] = parsed.title;
    if (takeTitle && parsed.lead && (replace || !_editing['lead_' + c])) _editing['lead_' + c] = parsed.lead;
    if (parsed.bodyMd && (replace || !_editing['body_' + c])) _editing['body_' + c] = mdToHtml(parsed.bodyMd);
    if (parsed.conclusionMd && (replace || !_editing['conclusion_' + c])) _editing['conclusion_' + c] = mdToHtml(parsed.conclusionMd);
    if (!_editing['slug_' + c] && parsed.title) _editing['slug_' + c] = slugify(parsed.title);
    blogImportClose();
    toast('İçerik aktarıldı' + (parsed.items.length ? ` — ${parsed.items.length} ürün eşleştiriliyor…` : ''), 's');
    if (parsed.items.length && detectItems) {
      const items = parsed.items.map((it) => ({ kind: 'product', search: it.name, name: it.name, blocks: mdSectionToBlocks(it.md, c) }));
      await importItems(items, replace);
    }
    _srcMode = { body: false, concl: false };
    renderEditor();
    blogMarkDirty();
    toast('İçe aktarma tamam — kontrol et ve kaydet', 's');
  }
  async function blogImportRunJson() {
    const ta = document.getElementById('be_imp_json'); if (!ta || !ta.value.trim()) { toast('Önce JSON yapıştır', 'w'); return; }
    let data;
    let raw = ta.value.trim();
    // Claude bazen ```json çitiyle döndürür — ayıkla
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    try { data = JSON.parse(raw); } catch (e) { toast('JSON çözülemedi: ' + e.message, 'e'); return; }
    const replace = (() => { const el = document.getElementById('be_opt_jreplace'); return el ? el.checked : true; })();
    flushEditors(); syncPane();
    const langs = data.langs || data;
    let filled = 0;
    for (const [c] of LANGS) {
      const L = langs[c]; if (!L || typeof L !== 'object') continue;
      filled++;
      const set = (f, v) => { if (v != null && String(v).trim() && (replace || !_editing[f])) _editing[f] = String(v); };
      set('title_' + c, L.title);
      set('lead_' + c, L.lead);
      set('slug_' + c, slugify(L.slug || L.title || ''));
      set('metaTitle_' + c, L.metaTitle);
      set('metaDescription_' + c, L.metaDescription);
      set('tags_' + c, Array.isArray(L.tags) ? L.tags.join(', ') : L.tags);
      const bodyMd = L.body_md || L.bodyMd || L.body || '';
      if (bodyMd && (replace || !_editing['body_' + c])) _editing['body_' + c] = /<\w+[^>]*>/.test(bodyMd) ? bodyMd : mdToHtml(bodyMd);
      const conclMd = L.conclusion_md || L.conclusionMd || L.conclusion || '';
      if (conclMd && (replace || !_editing['conclusion_' + c])) _editing['conclusion_' + c] = /<\w+[^>]*>/.test(conclMd) ? conclMd : mdToHtml(conclMd);
    }
    if (!filled) { toast('JSON içinde tr/en/de bulunamadı — şemayı kontrol et', 'e'); return; }
    if (data.category) _editing.category = data.category;
    if (data.cover) _editing.cover = data.cover;
    if (data.publishedAt) _editing.publishedAt = toDtLocal(data.publishedAt.length <= 10 ? data.publishedAt + 'T09:00' : data.publishedAt);
    blogImportClose();
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length) {
      toast(`İçerik aktarıldı — ${items.length} öğe eşleştiriliyor…`, 's');
      const norm = items.map((it) => ({
        kind: it.kind || 'product',
        search: it.search || it.name || '',
        name: it.name || it.search || '',
        name_tr: it.name_tr, name_en: it.name_en, name_de: it.name_de,
        link: it.link || '',
        image: it.image || '',
        blocks: (Array.isArray(it.blocks) && it.blocks.length ? it.blocks : [{ type: 'text', tr: '', en: '', de: '' }]).map((b) => {
          if ((b.type || b.t) === 'image') return { t: 'image', url: b.url || '', pos: b.pos || 'right', size: b.size || 'm', w: Number(b.w) || '', cap_tr: b.cap_tr || b.cap || '', cap_en: b.cap_en || '', cap_de: b.cap_de || '' };
          return { t: 'text', style: b.style || 'paragraph', tr: b.tr || '', en: b.en || '', de: b.de || '' };
        }),
      }));
      await importItems(norm, replace);
    }
    _srcMode = { body: false, concl: false };
    renderEditor();
    blogMarkDirty();
    toast('JSON içe aktarma tamam — 3 dili sekmelerden kontrol et', 's');
  }

  // ── AI ÇEVİRİ (TR → EN/DE) ────────────────────────────────────
  // Sunucudaki Gemini proxy'si (pb_hooks/gemini.pb.js) üzerinden. Anahtar
  // istemciye HİÇ inmez. thinkingBudget=0: çeviri düşünme gerektirmez ve
  // budget>maxOutputTokens kombinasyonu "boş yanıt" hatasına yol açıyordu.
  async function callGeminiJson(prompt, maxOutputTokens) {
    const pb = getPb();
    const res = await fetch(pb.baseUrl.replace(/\/$/, '') + '/api/ai/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: maxOutputTokens || 32768,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error((data.error && (data.error.message || data.error)) || data.message || `AI isteği başarısız (${res.status})`);
    const cand = (data.candidates || [])[0] || {};
    const text = ((cand.content || {}).parts || []).map((p) => p.text || '').join('').trim();
    if (!text) throw new Error('AI boş yanıt döndü (içerik çok uzun olabilir)');
    try { return JSON.parse(text); } catch (_) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch (__) { /* düş */ } }
      throw new Error('AI yanıtı çözülemedi');
    }
  }
  const LANG_NAME = { en: 'İngilizce (English)', de: 'Almanca (Deutsch)' };
  // Kaynak dildeki tüm metinleri toplayıp tek JSON'da çevirtir, sonra aynı
  // yapıya geri yazar. HTML etiketleri korunur (gövde/sonuç zengin metin).
  function collectTranslatable(src) {
    const a = _editing;
    const payload = {
      title: a['title_' + src] || '',
      lead: a['lead_' + src] || '',
      body_html: a['body_' + src] || '',
      conclusion_html: a['conclusion_' + src] || '',
      metaTitle: a['metaTitle_' + src] || '',
      metaDescription: a['metaDescription_' + src] || '',
      tags: a['tags_' + src] || '',
      items: [],
    };
    _products.forEach((p, i) => {
      const item = { i, blocks: [] };
      if ((p.kind || 'product') === 'custom') item.name = p['name_' + src] || p.name || '';
      (p.blocks || []).forEach((b, j) => {
        if (b.t === 'text' && String(b[src] || '').trim()) item.blocks.push({ j, kind: 'text', text: b[src] });
        if (b.t === 'image' && String(b['cap_' + src] || '').trim()) item.blocks.push({ j, kind: 'cap', text: b['cap_' + src] });
      });
      if (item.name || item.blocks.length) payload.items.push(item);
    });
    return payload;
  }
  function applyTranslation(out, dst) {
    const a = _editing;
    const set = (f, v) => { if (v != null && String(v).trim()) a[f + '_' + dst] = String(v); };
    set('title', out.title); set('lead', out.lead);
    set('body', out.body_html); set('conclusion', out.conclusion_html);
    set('metaTitle', out.metaTitle); set('metaDescription', out.metaDescription);
    set('tags', Array.isArray(out.tags) ? out.tags.join(', ') : out.tags);
    for (const it of (out.items || [])) {
      const p = _products[it.i]; if (!p) continue;
      if (it.name && (p.kind || 'product') === 'custom') p['name_' + dst] = String(it.name);
      for (const b of (it.blocks || [])) {
        const blk = (p.blocks || [])[b.j]; if (!blk) continue;
        if (b.kind === 'cap') blk['cap_' + dst] = String(b.text || '');
        else if (blk.t === 'text') blk[dst] = String(b.text || '');
      }
    }
  }
  async function blogTranslate(targets, srcArg) {
    flushEditors(); syncPane();
    const src = srcArg || 'tr';
    if (!(_editing['title_' + src] || '').trim()) { toast(src.toUpperCase() + ' başlık boşken çeviri yapılamaz', 'w'); return; }
    const list = (targets || ['en', 'de']).filter((c) => c !== src);
    const btn = document.getElementById('be_tr_btn');
    const setBtn = (t, dis) => { if (btn) { btn.textContent = t; btn.disabled = !!dis; } };
    const payload = collectTranslatable(src);
    const approxWords = wordCount(JSON.stringify(payload));
    if (approxWords > 6000) toast('Uzun makale — çeviri biraz sürebilir', 'w');
    for (const dst of list) {
      setBtn(`⏳ ${dst.toUpperCase()} çevriliyor…`, true);
      const prompt = `Sen teknoloji sitesi Qor AI için profesyonel bir çevirmensin. Aşağıdaki JSON'daki TÜM metinleri ${LANG_NAME[dst] || dst} diline çevir.

KESİN KURALLAR:
- Çıktı SADECE geçerli JSON olsun; girdiyle BİREBİR aynı yapı ve aynı anahtarlar (items dizisindeki "i" ve "j" sayıları AYNEN korunacak).
- HTML etiketlerini (<p>, <h2>, <ul>, <li>, <strong>, <table>, <a href="...">…) AYNEN koru; sadece etiketler ARASINDAKİ metni çevir.
- Markdown işaretlerini koru: **kalın**, satır başındaki "- " maddeleri, "## " başlıkları, satır sonları.
- Ürün/marka/model adlarını, teknik birimleri (mAh, GB, Hz, nit) ve sayıları ÇEVİRME.
- Doğal ve akıcı yaz — kelimesi kelimesine değil, hedef dilde bir editörün yazacağı gibi.
- metaTitle 60 karakteri, metaDescription 155 karakteri AŞMASIN.
- Boş gelen alanları boş bırak.

ÇEVRİLECEK JSON:
${JSON.stringify(payload)}`;
      try {
        const out = await callGeminiJson(prompt);
        applyTranslation(out, dst);
        toast(`${dst.toUpperCase()} çevirisi tamam`, 's');
      } catch (e) {
        setBtn('🌍 TR → EN + DE çevir', false);
        toast(`${dst.toUpperCase()} çevirisi başarısız: ${e.message}`, 'e');
        return;
      }
    }
    _srcMode = { body: false, concl: false };
    renderEditor();
    blogMarkDirty();
    toast('Çeviri bitti — sekmelerden kontrol et ve kaydet', 's');
  }
  function blogTranslateMenu() {
    if (!confirm('TR içerik EN ve DE dillerine çevrilecek.\n\nHedef dillerdeki MEVCUT metinlerin üzerine yazılır. Devam edilsin mi?')) return;
    blogTranslate(['en', 'de'], 'tr');
  }

  // ── kaydet / önizle ───────────────────────────────────────────
  async function blogSave(forceStatus, silent) {
    syncPane();
    const a = _editing;
    const slug = slugify(a.slug_tr || a.title_tr || '');
    if (!slug) { if (!silent) toast('TR başlık (ya da TR slug) gerekli', 'w'); return; }
    if (!a.title_tr) { if (!silent) toast('TR başlık gerekli', 'w'); return; }
    if (_saving) return;
    _saving = true;
    try {
      const data = {
        slug, status: forceStatus || a.status || 'draft',
        category: a.category || '', cover: a.cover || '',
        author: (a.author || '').trim(),
        publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : new Date().toISOString(),
        products: _products
          .map((p) => {
            const q = { ...p }; delete q._livePrice;
            if ((q.kind || 'product') !== 'custom') return q;
            const nm = (q.name_tr || q.name_en || q.name_de || q.name || '').trim();
            return { ...q, name: nm, slug: slugify(nm) };
          })
          .filter((p) => (p.kind || 'product') !== 'custom' || String(p.name || '').trim()),
      };
      LANGS.forEach(([c]) => {
        data['title_' + c] = a['title_' + c] || ''; data['lead_' + c] = a['lead_' + c] || '';
        data['body_' + c] = a['body_' + c] || ''; data['conclusion_' + c] = a['conclusion_' + c] || '';
        data['tags_' + c] = (a['tags_' + c] || '').trim();
        data['metaTitle_' + c] = (a['metaTitle_' + c] || '').trim();
        data['metaDescription_' + c] = (a['metaDescription_' + c] || '').trim();
        data['slug_' + c] = slugify(a['slug_' + c] || a['title_' + c] || '') || slug;
      });
      if (a.id) await getPb().collection('articles').update(a.id, data, { $autoCancel: false });
      else {
        const rec = await getPb().collection('articles').create(data, { $autoCancel: false });
        _editing.id = rec.id; _editing.coverFile = rec.coverFile; _editing.publishedAt = toDtLocal(rec.publishedAt);
        const cm = document.getElementById('b_comments'); if (cm && cm.textContent.includes('kaydet')) { cm.textContent = 'Henüz yorum yok.'; }
      }
      _editing.status = data.status;
      _dirty = false;
      _lastSavedJson = saveSnapshotJson();
      // Başarılı kayıt → yerel çökme yedekleri artık gereksiz.
      clearTimeout(_backupTimer);
      clearBackup('new'); clearBackup(_editing.id);
      _pendingBackup = null;
      const badge = document.getElementById('be_status_badge');
      if (badge) { badge.textContent = data.status === 'published' ? 'YAYINDA' : 'TASLAK'; badge.classList.toggle('pub', data.status === 'published'); }
      const stSel = document.getElementById('b_status'); if (stSel) stSel.value = data.status;
      if (!silent) {
        setSaveState('ok', '✓ Kaydedildi');
        toast(data.status === 'published' ? '🚀 Yayınlandı — sitede canlı' : 'Taslak kaydedildi', 's');
      }
    } catch (e) {
      if (!silent) toast('Kaydedilemedi: ' + e.message, 'e');
      if (silent) throw e;
    } finally { _saving = false; }
  }
  async function blogPreview() {
    flushEditors(); syncPane();
    try {
      await blogSave(_editing.status === 'published' ? 'published' : 'draft', true);
      if (!_editing.id) { toast('Önce kaydet', 'w'); return; }
      const slug = _editing.slug || slugify(_editing.title_tr || '');
      setSaveState('ok', '✓ Kaydedildi');
      window.open(`${SITE}/blog/${encodeURIComponent(slug)}?previewId=${_editing.id}`, '_blank');
    } catch (e) { toast('Önizleme başarısız: ' + e.message, 'e'); }
  }

  // ── yorumlar ──────────────────────────────────────────────────
  async function loadComments() {
    const box = document.getElementById('b_comments'); if (!box || !_editing.id) return;
    try {
      const key = 'blog:' + (_editing.slug || '');
      const res = await getPb().collection('reviews').getList(1, 100, { filter: `productId = "${(key).replace(/"/g, '\\"')}"`, sort: '-created', $autoCancel: false });
      const items = res.items || [];
      if (!items.length) { box.innerHTML = '<div style="opacity:.5">Henüz yorum yok.</div>'; return; }
      box.style.opacity = '1';
      box.innerHTML = items.map((c) => `<div style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border,#262c38);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px"><b>${esc(c.authorDisplayName || 'User')}</b> <span style="opacity:.5">· ${esc(String(c.created || '').slice(0, 10))}</span>${c.rating ? ` <span style="color:#f59e0b">${'★'.repeat(Number(c.rating) || 0)}</span>` : ''}</div>
          <div style="font-size:14px;margin-top:3px;white-space:pre-wrap;word-break:break-word">${esc(c.text || '')}</div>
        </div>
        <button class="ba-mini" style="color:#f87171" onclick="blogDeleteComment('${c.id}')" title="Sil">🗑</button>
      </div>`).join('');
    } catch (e) { box.innerHTML = `<div style="color:#ef4444">Yorumlar yüklenemedi: ${esc(e.message)}</div>`; }
  }
  async function blogDeleteComment(id) {
    if (!confirm('Bu yorumu sil?')) return;
    try { await getPb().collection('reviews').delete(id, { $autoCancel: false }); toast('Yorum silindi', 's'); loadComments(); }
    catch (e) { toast('Silinemedi: ' + e.message, 'e'); }
  }

  // ── exports ───────────────────────────────────────────────────
  window.loadBlogAdmin = loadBlogAdmin;
  window.blogNew = blogNew; window.blogEdit = blogEdit; window.blogDelete = blogDelete;
  window.blogDuplicate = blogDuplicate;
  window.blogListSearch = blogListSearch; window.blogListFilter = blogListFilter;
  window.blogTplPick = blogTplPick;
  window.blogSave = blogSave; window.blogTab = blogTab;
  window.blogBackToList = blogBackToList; window.blogStatusChange = blogStatusChange;
  window.blogTitleInput = blogTitleInput; window.blogLeadInput = blogLeadInput; window.blogSeoField = blogSeoField;
  window.blogRenderSerp = blogRenderSerp; window.blogMarkDirty = blogMarkDirty;
  window.blogSrcToggle = blogSrcToggle; window.blogSrcInput = blogSrcInput;
  window.blogProdSearch = blogProdSearch; window.blogProdAdd = blogProdAdd;
  window.blogProdRemove = blogProdRemove; window.blogProdMove = blogProdMove; window.blogProdField = blogProdField;
  window.blogPickKind = blogPickKind; window.blogSubSearch = blogSubSearch; window.blogSubAdd = blogSubAdd; window.blogCustomAdd = blogCustomAdd;
  window.blogBlockAdd = blogBlockAdd; window.blogBlockRemove = blogBlockRemove; window.blogBlockMove = blogBlockMove; window.blogBlockField = blogBlockField; window.blogUploadBlockImage = uploadBlockImage;
  window.blogUploadCover = uploadCover;
  window.blogUploadProdImage = uploadProdImage;
  window.blogSetCover = blogSetCover;
  window.blogPreview = blogPreview;
  window.blogDeleteComment = blogDeleteComment;
  window.blogImportOpen = blogImportOpen; window.blogImportClose = blogImportClose; window.blogImportTab = blogImportTab;
  window.blogImportRunMd = blogImportRunMd; window.blogImportRunJson = blogImportRunJson;
  window.blogPromptCopy = blogPromptCopy; window.blogImportReportClose = blogImportReportClose;
  window.blogBackupRestore = blogBackupRestore; window.blogBackupDiscard = blogBackupDiscard;
  window.blogTranslate = blogTranslate; window.blogTranslateMenu = blogTranslateMenu;
})();
