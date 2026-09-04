// ══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — SÜRÜKLE-BIRAK KATMANI
//
//  NEDEN YENİDEN YAZILDI: önceki düzen HTML5 `draggable` + ↑/↓ düğmeleriydi.
//  Altı öğeli bir yazıyı yeniden dizmek onlarca tıklama demekti, dokunmatikte
//  hiç çalışmıyordu, klavyeyle imkânsızdı ve ekran kenarına gelince kaydırma
//  yoktu — uzun yazıda öğeyi yukarı taşımanın YOLU YOKTU.
//
//  Bu katman POINTER olaylarıyla çalışır (fare + dokunmatik + kalem aynı kod).
//
//  ÜÇ TÜR TAŞIMA, TEK MEKANİZMA:
//    item  → yazıdaki öğelerin sırası (tuvalde VE sol anahat rayında)
//    block → bir öğenin İÇİNDEKİ metin/görsel blokları
//             ↳ BAŞKA BİR ÖĞEYE de bırakılabilir (yazı kurgusunu değiştirmenin
//               en sık yolu bu)
//
//  KURALLAR:
//   · Sürükleme YALNIZ tutamaktan başlar. Kartın tamamını sürüklenebilir
//     yapmak içindeki <textarea>/<input> alanlarında metin seçmeyi bozuyor.
//   · Bırakma noktası hedefin ortasına göre ÜST/ALT hesaplanır ve ÇİZGİYLE
//     gösterilir; "hangi tarafa düşecek" tahmin edilmez.
//   · 4px eşiği: tutamağa yapılan basit tık sürükleme sayılmaz.
//   · KLAVYE: tutamağa Tab → Boşluk/Enter ile al → ok tuşları → Boşluk/Enter
//     ile bırak, Escape ile vazgeç. Erişilebilirlik tabanı.
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  var ESIK = 4;          // px — bunun altındaki hareket tık sayılır
  var KENAR = 90;        // px — bu kadar yaklaşınca otomatik kaydırma
  var HIZ = 14;          // px/kare

  var _cfg = null;       // {kok, tasi, ciz, ad}
  var _drag = null;      // sürükleme durumu
  var _ghost = null;
  var _caret = null;
  var _kbBar = null;
  var _raf = null;

  function kaydirKabi(el) {
    var n = el;
    while (n && n !== document.body) {
      var st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
      n = n.parentElement;
    }
    return document.querySelector('.main-content') || document.scrollingElement || document.documentElement;
  }

  function temizle() {
    if (_ghost) { _ghost.remove(); _ghost = null; }
    if (_caret) { _caret.remove(); _caret = null; }
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    document.body.classList.remove('bl-dnd-on');
    document.querySelectorAll('.bl-item.drag,.bl-blk.drag').forEach(function (e) { e.classList.remove('drag'); });
  }

  function hedefler(tur) {
    return Array.prototype.slice.call(document.querySelectorAll('[data-drop="' + tur + '"]'))
      .filter(function (el) { return el.offsetParent !== null; });
  }

  // Fareye en yakın bırakma hedefi + üst/alt yarı.
  function birakmaNoktasi(tur, x, y) {
    var list = hedefler(tur);
    var best = null;
    var bestD = Infinity;
    list.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.height) return;
      // Dikey uzaklık; yatayda uzaktaysa (öbür kolon) cezalandır.
      var dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
      var dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      var d = dy + dx * 0.35;
      if (d < bestD) { bestD = d; best = el; }
    });
    if (!best) return null;
    var r2 = best.getBoundingClientRect();
    return { el: best, once: (y - r2.top) < r2.height / 2, rect: r2 };
  }

  function caretCiz(nokta) {
    if (!nokta) { if (_caret) _caret.style.display = 'none'; return; }
    if (!_caret) { _caret = document.createElement('div'); _caret.className = 'bl-caret'; document.body.appendChild(_caret); }
    var r = nokta.rect;
    _caret.style.display = 'block';
    _caret.style.left = r.left + 'px';
    _caret.style.width = r.width + 'px';
    _caret.style.top = (nokta.once ? r.top - 1 : r.bottom - 1) + 'px';
  }

  function otoKaydir(kap, y) {
    var r = kap === document.scrollingElement ? { top: 0, bottom: innerHeight } : kap.getBoundingClientRect();
    var d = 0;
    if (y - r.top < KENAR) d = -HIZ * (1 - (y - r.top) / KENAR);
    else if (r.bottom - y < KENAR) d = HIZ * (1 - (r.bottom - y) / KENAR);
    if (d) kap.scrollTop += d;
  }

  function baslat(ev, grip, tur, i, j, etiket) {
    if (ev.button != null && ev.button !== 0) return;
    var kart = grip.closest(tur === 'item' ? '.bl-item,.bl-out-i' : '.bl-blk');
    _drag = {
      tur: tur, i: Number(i), j: j == null ? null : Number(j),
      x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY,
      etiket: etiket || (kart ? (kart.textContent || '').trim().slice(0, 60) : ''),
      kart: kart, basladi: false, grip: grip,
      kap: kaydirKabi(kart || document.body),
    };
    try { grip.setPointerCapture(ev.pointerId); } catch (_) { /* eski tarayıcı */ }
    ev.preventDefault();
  }

  function hareket(ev) {
    if (!_drag) return;
    _drag.x = ev.clientX; _drag.y = ev.clientY;
    if (!_drag.basladi) {
      if (Math.abs(_drag.x - _drag.x0) < ESIK && Math.abs(_drag.y - _drag.y0) < ESIK) return;
      _drag.basladi = true;
      document.body.classList.add('bl-dnd-on');
      if (_drag.kart) _drag.kart.classList.add('drag');
      _ghost = document.createElement('div');
      _ghost.className = 'bl-ghost';
      _ghost.textContent = _drag.etiket || (_drag.tur === 'item' ? 'Öğe' : 'Blok');
      document.body.appendChild(_ghost);
      dongu();
    }
    _ghost.style.left = (_drag.x + 14) + 'px';
    _ghost.style.top = (_drag.y + 12) + 'px';
    _drag.nokta = birakmaNoktasi(_drag.tur, _drag.x, _drag.y);
    caretCiz(_drag.nokta);
  }

  // Otomatik kaydırma kendi karesinde koşar: fare durduğunda da devam etmeli.
  function dongu() {
    if (!_drag || !_drag.basladi) { _raf = null; return; }
    otoKaydir(_drag.kap, _drag.y);
    _drag.nokta = birakmaNoktasi(_drag.tur, _drag.x, _drag.y);
    caretCiz(_drag.nokta);
    _raf = requestAnimationFrame(dongu);
  }

  function birak() {
    if (!_drag) return;
    var d = _drag;
    _drag = null;
    temizle();
    if (!d.basladi || !d.nokta || !_cfg) return;
    var el = d.nokta.el;
    var hi = Number(el.getAttribute('data-i'));
    var hj = el.getAttribute('data-j');
    _cfg.tasi(d.tur, d.i, d.j, hi, hj == null ? null : Number(hj), d.nokta.once);
  }

  // ── KLAVYE ───────────────────────────────────────────────────────────────
  var _kb = null;   // {tur, i, j}

  function kbBarYaz(metin) {
    if (!_kbBar) { _kbBar = document.createElement('div'); _kbBar.className = 'bl-kb'; document.body.appendChild(_kbBar); }
    _kbBar.textContent = metin;
  }
  function kbBitir() { if (_kbBar) { _kbBar.remove(); _kbBar = null; } _kb = null; document.querySelectorAll('.bl-grip.hold').forEach(function (e) { e.classList.remove('hold'); }); }

  function kbTus(ev) {
    var grip = ev.target.closest && ev.target.closest('[data-grip]');
    if (!_kb && !grip) return;
    var al = ev.key === ' ' || ev.key === 'Enter' || ev.key === 'Spacebar';
    if (!_kb && grip && al) {
      ev.preventDefault();
      _kb = { tur: grip.getAttribute('data-grip'), i: Number(grip.getAttribute('data-i')), j: grip.getAttribute('data-j') == null ? null : Number(grip.getAttribute('data-j')) };
      grip.classList.add('hold');
      kbBarYaz('Taşınıyor — ↑/↓ ile yerini seç, Boşluk ile bırak, Esc ile vazgeç');
      return;
    }
    if (!_kb) return;
    if (ev.key === 'Escape') { ev.preventDefault(); kbBitir(); return; }
    if (al) { ev.preventDefault(); kbBitir(); return; }
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    var yon = ev.key === 'ArrowUp' ? -1 : 1;
    if (!_cfg) return;
    var yeni = _cfg.kaydir(_kb.tur, _kb.i, _kb.j, yon);
    if (!yeni) return;
    _kb.i = yeni.i; _kb.j = yeni.j;
    // Yeniden çizildikten sonra aynı tutamağa odağı geri ver.
    setTimeout(function () {
      var sel = '[data-grip="' + _kb.tur + '"][data-i="' + _kb.i + '"]' + (_kb.j == null ? '' : '[data-j="' + _kb.j + '"]');
      var g = document.querySelector(sel);
      if (g) { g.focus(); g.classList.add('hold'); g.scrollIntoView({ block: 'nearest' }); }
      kbBarYaz('Taşınıyor — ↑/↓ ile yerini seç, Boşluk ile bırak, Esc ile vazgeç');
    }, 0);
  }

  root.BlogDnd = {
    /* kur({tasi, kaydir}) — iki geri çağırım:
        tasi(tur, kaynakI, kaynakJ, hedefI, hedefJ, once)  → bırakma
        kaydir(tur, i, j, yon) → klavyeyle bir adım, yeni {i,j} döner        */
    kur: function (cfg) { _cfg = cfg; },
    baslat: baslat,
    iptal: function () { _drag = null; temizle(); kbBitir(); },
    bagla: function (kok) {
      if (!kok || kok._dndBagli) return;
      kok._dndBagli = true;
      kok.addEventListener('pointermove', hareket);
      kok.addEventListener('pointerup', birak);
      kok.addEventListener('pointercancel', function () { _drag = null; temizle(); });
      kok.addEventListener('keydown', kbTus);
      // Tutamak delegasyonla yakalanır ama pointer yakalama TUTAMAĞIN
      // KENDİSİNE verilir (bkz. baslat) — yoksa fare kartın dışına çıkınca
      // pointermove olayları kesiliyor ve sürükleme yarıda kalıyor.
      kok.addEventListener('pointerdown', function (ev) {
        var g = ev.target.closest('[data-grip]');
        if (!g || !kok.contains(g)) return;
        baslat(ev, g, g.getAttribute('data-grip'),
          g.getAttribute('data-i'), g.getAttribute('data-j'), g.getAttribute('data-label'));
      });
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
