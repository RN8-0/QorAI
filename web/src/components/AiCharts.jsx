// ─────────────────────────────────────────────────────────────────────────
//  AiCharts — analiz sonuçlarının paylaşılan animasyonlu grafik atomları.
//  Spec: web+app senkron 3 grafik tipi (faktör çubukları, sentiment donut,
//  faktör dağılım çubuğu) + karar rozeti + "Detaylı analiz" collapsible.
//  Renk dili: güçlü/pozitif #22c55e, orta/nötr #f59e0b, zayıf/negatif #f43f5e,
//  marka mavi #3b82f6. prefers-reduced-motion'a saygı gösterir.
// ─────────────────────────────────────────────────────────────────────────
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import './AiCharts.css';
// Faktor tablosunun satir kumesi TEK KAYNAK — on-render (Node) da ayni
// modulu kosar; bkz. lib/factorRows.js.
import { factorColumnAverages, factorColumnWins, factorMatrixRows } from '../lib/factorRows.js';
// Recharts ~136 KB gzip: fiyat grafigi cizilmeyen sayfalar bunu INDIRMEZ.
const PriceChart = lazy(() => import('./PriceChart.jsx'));

export const CHART_COLORS = {
  strong: '#22c55e',
  balanced: '#f59e0b',
  weak: '#f43f5e',
  brand: '#3b82f6',
};

// ── Hareket azaltma tercihi ────────────────────────────────────────────────
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

// Mount'tan bir frame sonra true olur — CSS transition'ların 0'dan hedefe
// süpürülmesini tetikler (çift rAF: başlangıç 0 hali önce boyansın diye).
function useDrawn() {
  const reduced = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) { setDrawn(true); return undefined; }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setDrawn(true));
    });
    // GÜVENLİK AĞI: sekme arka plandayken tarayıcı requestAnimationFrame'i
    // askıya alır — o durumda çubuklar SONSUZA KADAR %0'da kalırdı. Zamanlayıcı
    // arka planda da işlediği için grafik her hâlükârda doğru değere oturur.
    const fallback = setTimeout(() => setDrawn(true), 220);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      clearTimeout(fallback);
    };
  }, [reduced]);
  return { drawn, reduced };
}

// ── (A2) GÖRÜNÜME GİRİNCE ÇİZ ─────────────────────────────────────────────
// `useDrawn` animasyonu MOUNT'ta başlatır. Sayfanın altındaki faktör tablosu
// için bu, kimse bakmadan bitmiş bir animasyon demek: okuyucu oraya
// vardığında çubuklar çoktan doluydu. Bu kanca çizimi ELEMAN GÖRÜNÜNCE
// başlatır — kullanıcı sayfayı kaydırdıkça çubuklar önünde ilerler.
//
// İÇERİK ASLA SAKLANMAZ. Bu projede reveal denemesi bir kez geri alındı
// (IntersectionObserver eşiği tutmayınca içerik hiç gelmiyordu, bkz. proje
// notları). Burada gizlenen tek şey ÇUBUK GENİŞLİĞİ: etiket, sayı ve metin
// ilk boyamada yerinde. Üstüne zamanlayıcı güvenlik ağı var — gözlemci hiç
// ateşlemese bile (arka plan sekmesi, eski tarayıcı) çubuk kendi değerine
// oturur.
export function useDrawIn({ margin = '0px 0px -10% 0px', timeout = 2600 } = {}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef(null);
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) { setDrawn(true); return undefined; }
    const el = ref.current;
    let io = null;
    if (el && typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver((girisler) => {
        if (girisler.some((g) => g.isIntersecting)) {
          setDrawn(true);
          if (io) io.disconnect();
        }
      }, { rootMargin: margin, threshold: 0.06 });
      io.observe(el);
    } else {
      setDrawn(true);
    }
    let guvenlik = 0;
    const gorunurMu = () => {
      if (!el || typeof el.getBoundingClientRect !== 'function') return true;
      const r = el.getBoundingClientRect();
      const h = window.innerHeight || document.documentElement.clientHeight || 0;
      return r.top < h && r.bottom > 0;
    };
    const bekle = () => {
      guvenlik = setTimeout(() => {
        if (!io || gorunurMu()) setDrawn(true);
        else bekle();
      }, timeout);
    };
    bekle();
    return () => { if (io) io.disconnect(); clearTimeout(guvenlik); };
  }, [reduced, margin, timeout]);
  return [ref, drawn, reduced];
}

// Sayı count-up (skor halkası merkezi vb.). reduced-motion'da anında hedef.
export function useCountUp(target, { enabled = true, duration = 800 } = {}) {
  const reduced = usePrefersReducedMotion();
  const t = Number(target) || 0;
  const [val, setVal] = useState(enabled && !reduced ? 0 : t);
  useEffect(() => {
    if (!enabled || reduced) { setVal(t); return undefined; }
    let raf = 0;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(t * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [t, enabled, reduced, duration]);
  return val;
}

// ── (A) Çubuk dolgusu — mevcut bar track'lerinin <i> dolgusunun animasyonlu
// muadili. Mount'ta 0'dan hedefe genişler; class almaz, parent CSS'i
// (".x-track i" seçicileri) aynen çalışmaya devam eder.
export function BarFill({ pct, color, gradient = false, delay = 0 }) {
  const { drawn, reduced } = useDrawn();
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const w = drawn ? v : 0;
  return (
    <i
      style={{
        width: `${w}%`,
        background: gradient ? `linear-gradient(90deg, ${color}80, ${color})` : color,
        transition: reduced ? 'none' : `width .7s cubic-bezier(.22,.61,.36,1) ${delay}ms`,
      }}
    />
  );
}

// ── Karar rozeti (Al / Düşün / Geç) — skordan deterministik ────────────────
export function decisionFromScore(score) {
  const s = Number(score) || 0;
  return s >= 70 ? 'buy' : s >= 50 ? 'consider' : 'skip';
}

export function DecisionBadge({ score, L = (en) => en }) {
  const kind = decisionFromScore(score);
  const label = kind === 'buy'
    ? L('Buy', 'Al')
    : kind === 'consider'
      ? L('Consider', 'Düşün')
      : L('Skip', 'Geç');
  const icon = kind === 'buy' ? '✓' : kind === 'consider' ? '~' : '✕';
  return <span className={`aic-badge ${kind}`}><i aria-hidden="true">{icon}</i>{label}</span>;
}

// ── Sentiment yardımcıları ────────────────────────────────────────────────
// Fallback: sentimentBreakdown yoksa satisfaction'dan türet (spec §4B):
// positive=sat, negative=round((100-sat)*0.65), neutral=kalan.
export function deriveSentiment(satisfaction) {
  const sat = Math.max(0, Math.min(100, Math.round(Number(satisfaction) || 0)));
  const positive = sat;
  const negative = Math.round((100 - sat) * 0.65);
  const neutral = Math.max(0, 100 - positive - negative);
  return { positive, neutral, negative };
}

// AI alanı varsa 100'e normalize eder; yoksa satisfaction'dan türetir.
export function normalizeSentiment(raw, satisfactionFallback) {
  if (raw && typeof raw === 'object') {
    const positive = Math.max(0, Math.round(Number(raw.positive) || 0));
    const neutral = Math.max(0, Math.round(Number(raw.neutral) || 0));
    const negative = Math.max(0, Math.round(Number(raw.negative) || 0));
    const total = positive + neutral + negative;
    if (total > 0) {
      const p = Math.round((positive / total) * 100);
      const n = Math.round((negative / total) * 100);
      return { positive: p, negative: n, neutral: Math.max(0, 100 - p - n) };
    }
  }
  return deriveSentiment(satisfactionFallback);
}

// ── (B) Donut — SVG segmentleri açılışta gecikmeli süpürülerek dolar ───────
export function DonutChart({ segments = [], centerValue = '', centerLabel = '', size = 128, thickness = 15 }) {
  const { drawn, reduced } = useDrawn();
  const segs = segments
    .map((s) => ({ label: s.label, value: Math.max(0, Number(s.value) || 0), color: s.color }))
    .filter((s) => s.value > 0);
  const total = segs.reduce((a, b) => a + b.value, 0);
  if (!total) return null;
  const R = (size - thickness) / 2;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="aic-donut-svg" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel || 'Donut chart'}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segs.map((s, i) => {
            const len = (s.value / total) * C;
            const start = acc;
            acc += len;
            const target = drawn ? len : 0;
            return (
              <circle
                key={`${s.label}-${i}`}
                cx={size / 2} cy={size / 2} r={R} fill="none"
                stroke={s.color} strokeWidth={thickness}
                strokeDasharray={`${target} ${Math.max(0, C - target)}`}
                strokeDashoffset={-start}
                style={{ transition: reduced ? 'none' : `stroke-dasharray .8s cubic-bezier(.22,.61,.36,1) ${i * 140}ms` }}
              />
            );
          })}
        </g>
      </svg>
      {(centerValue !== '' || centerLabel) && (
        <div className="aic-donut-center">
          {centerValue !== '' && <b>{centerValue}</b>}
          {centerLabel && <small>{centerLabel}</small>}
        </div>
      )}
    </div>
  );
}

// Topluluk memnuniyet donutu: Olumlu/Nötr/Olumsuz + legend. `breakdown`
// normalize edilmiş {positive, neutral, negative}; merkezde büyük memnuniyet %.
export function SentimentDonut({ breakdown, L = (en) => en, size = 124, compact = false }) {
  const bd = breakdown && typeof breakdown === 'object' ? breakdown : null;
  if (!bd) return null;
  const rows = [
    { label: L('Positive', 'Olumlu'), value: bd.positive, color: CHART_COLORS.strong },
    { label: L('Neutral', 'Nötr'), value: bd.neutral, color: CHART_COLORS.balanced },
    { label: L('Negative', 'Olumsuz'), value: bd.negative, color: CHART_COLORS.weak },
  ];
  return (
    <div className="aic-card aic-sentiment">
      <div className="aic-card-title">💬 {L('Community satisfaction', 'Topluluk memnuniyeti')}</div>
      <div className="aic-donut">
        <DonutChart
          segments={rows}
          centerValue={`${Math.round(bd.positive)}%`}
          centerLabel={L('positive', 'olumlu')}
          size={compact ? 96 : size}
          thickness={compact ? 12 : 15}
        />
        <div className="aic-legend">
          {rows.map((r) => (
            <div className="aic-legend-row" key={r.label}>
              <i style={{ background: r.color }} />
              <span>{r.label}</span>
              <b>{Math.round(r.value)}%</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── (C) Faktör dağılımı — veriden türetilir, AI gerekmez ───────────────────
export function factorDistribution(factors = []) {
  let strong = 0; let balanced = 0; let weak = 0;
  (Array.isArray(factors) ? factors : []).forEach((f) => {
    const s = Number(f?.score ?? f?.value) || 0;
    if (s >= 70) strong += 1;
    else if (s >= 50) balanced += 1;
    else weak += 1;
  });
  return { strong, balanced, weak };
}

export function DistributionBar({ strong = 0, balanced = 0, weak = 0, L = (en) => en }) {
  const { drawn, reduced } = useDrawn();
  const total = strong + balanced + weak;
  if (!total) return null;
  const pct = (n) => (drawn ? (n / total) * 100 : 0);
  const seg = (n, color, delay) => (n > 0 ? (
    <i style={{
      width: `${pct(n)}%`,
      background: color,
      transition: reduced ? 'none' : `width .7s cubic-bezier(.22,.61,.36,1) ${delay}ms`,
    }} />
  ) : null);
  return (
    <div className="aic-card aic-dist">
      <div className="aic-card-title">⚖️ {L('Factor balance', 'Faktör dengesi')}</div>
      <div className="aic-dist-track" role="img" aria-label={L('Factor balance', 'Faktör dengesi')}>
        {seg(strong, CHART_COLORS.strong, 0)}
        {seg(balanced, CHART_COLORS.balanced, 120)}
        {seg(weak, CHART_COLORS.weak, 240)}
      </div>
      <div className="aic-dist-legend">
        <span><i style={{ background: CHART_COLORS.strong }} />{strong} {L('strong', 'güçlü')}</span>
        <span><i style={{ background: CHART_COLORS.balanced }} />{balanced} {L('balanced', 'dengeli')}</span>
        <span><i style={{ background: CHART_COLORS.weak }} />{weak} {L('weak', 'zayıf')}</span>
      </div>
    </div>
  );
}

// ── "Detaylı analiz ▾" — varsayılan KAPALI collapsible ─────────────────────
// İçerik yalnız açıkken mount edilir (uzun raporlar kapalıyken maliyetsiz).
export function Collapsible({ label, children, defaultOpen = false, className = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`aic-collapse${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" className="aic-collapse-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        <svg className="aic-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="aic-collapse-body">{children}</div>}
    </div>
  );
}

// Kısa özet: uzun metnin ilk n cümlesi (hero'daki tek cümle karar için).
export function firstSentencesOf(text, n = 1) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, n).join(' ') : raw;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DERİN ANALİZ GRAFİKLERİ (2026-08-08)
   Link + abonelik analizleri "çok kısa" idi: tek gauge, tek donut, iki liste.
   Aşağıdaki atomlar raporun YENİ alanlarını (faktör detayları, kritik
   noktalar, quiz etkisi, topluluk temaları, kaynaklar, karşılaştırma ısı
   matrisi) görselleştirir. Hepsi tek renk dilinde: ≥70 güçlü / ≥50 dengeli /
   altı zayıf — DecisionBadge ve DistributionBar ile AYNI eşikler.
   ═══════════════════════════════════════════════════════════════════════ */

// Analiz skorunun anlamsal rengi (marka "tech score" halkasından farklı:
// burada yeşil/amber/kırmızı okunabilirliği kararı anlatır).
export function scoreColor(s) {
  const v = Number(s) || 0;
  return v >= 70 ? CHART_COLORS.strong : v >= 50 ? CHART_COLORS.balanced : CHART_COLORS.weak;
}

// 0→1 ilerleme (rAF). SVG polygon "points" CSS ile geçiş yapamadığı için
// radar/alan grafikleri bunu kullanır.
export function useDrawProgress({ duration = 900 } = {}) {
  const reduced = usePrefersReducedMotion();
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { setP(1); return undefined; }
    let raf = 0;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      setP(1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Arka plandaki sekmede rAF askıya alınır ve radar merkeze çökük kalırdı;
    // zamanlayıcı grafiği her koşulda tam değerine oturtur.
    const fallback = setTimeout(() => setP(1), duration + 400);
    return () => { cancelAnimationFrame(raf); clearTimeout(fallback); };
  }, [reduced, duration]);
  return p;
}

// ── (D) Radar — faktör profilinin tek bakışta şekli ────────────────────────
// Çubuklar "hangi faktör kaç puan" der; radar "bu ürün NE tipte" der (dengeli
// mi, tek yönlü mü). İkisi aynı veriyi FARKLI soruya cevap verecek şekilde
// gösterdiği için birlikte duruyorlar.
export function RadarChart({ factors = [], size = 260, color = CHART_COLORS.brand, L = (en) => en }) {
  const p = useDrawProgress({ duration: 950 });
  const rows = (Array.isArray(factors) ? factors : [])
    .filter((f) => f && f.label)
    .slice(0, 8);
  if (rows.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.335;
  const angle = (i) => (Math.PI * 2 * i) / rows.length - Math.PI / 2;
  const point = (i, v) => {
    const r = R * Math.max(0.04, Math.min(1, (Number(v) || 0) / 100)) * p;
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  };
  const poly = rows.map((f, i) => point(i, f.score).map((n) => n.toFixed(1)).join(',')).join(' ');
  const rings = [25, 50, 75, 100];
  return (
    <div className="aic-card aic-radar-card">
      <div className="aic-card-title">🕸 {L('Factor profile', 'Faktör profili')}</div>
      <div className="aic-radar-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} className="aic-radar" role="img"
          aria-label={L('Factor profile', 'Faktör profili')}>
          {rings.map((r) => (
            <polygon key={r} className="aic-radar-ring"
              points={rows.map((_, i) => {
                const rr = R * (r / 100);
                return `${(cx + Math.cos(angle(i)) * rr).toFixed(1)},${(cy + Math.sin(angle(i)) * rr).toFixed(1)}`;
              }).join(' ')} />
          ))}
          {rows.map((f, i) => (
            <line key={f.label} className="aic-radar-axis"
              x1={cx} y1={cy}
              x2={cx + Math.cos(angle(i)) * R} y2={cy + Math.sin(angle(i)) * R} />
          ))}
          <polygon className="aic-radar-area" points={poly} fill={color} stroke={color} />
          {rows.map((f, i) => {
            const [x, y] = point(i, f.score);
            return <circle key={f.label} cx={x} cy={y} r="3.4" fill={color} className="aic-radar-dot" />;
          })}
          {rows.map((f, i) => {
            const lr = R + 20;
            const x = cx + Math.cos(angle(i)) * lr;
            const y = cy + Math.sin(angle(i)) * lr;
            return (
              <text key={`t-${f.label}`} x={x} y={y} className="aic-radar-tick"
                textAnchor="middle" dominantBaseline="middle">
                {f.emoji || '•'}
                <tspan className="aic-radar-tickv" dx="4">{Math.round(f.score || 0)}</tspan>
              </text>
            );
          })}
        </svg>
        <ul className="aic-radar-key">
          {rows.map((f) => (
            <li key={f.label}>
              <i style={{ background: scoreColor(f.score) }} />
              <span>{f.emoji} {f.label}</span>
              <b style={{ color: scoreColor(f.score) }}>{Math.round(f.score || 0)}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── (E) Faktör çubukları + AI'ın tek cümlelik gerekçesi ────────────────────
// Eski çubuklarda yalnız sayı vardı; "neden 62?" sorusunun cevabı yoktu.
export function FactorList({ factors = [], columns = 2 }) {
  const rows = [...(Array.isArray(factors) ? factors : [])]
    .filter((f) => f && f.label)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  if (!rows.length) return null;
  return (
    <div className={`aic-factors${columns === 1 ? ' one' : ''}`}>
      {rows.map((f, i) => (
        <div className="aic-factor" key={`${f.label}-${i}`}>
          <div className="aic-factor-top">
            <span>{f.emoji || '📊'} {String(f.label).replace(/_/g, ' ')}</span>
            <b style={{ color: scoreColor(f.score) }}>{Math.round(Number(f.score) || 0)}</b>
          </div>
          <div className="aic-factor-track">
            <BarFill pct={Math.max(3, Math.min(100, Number(f.score) || 0))} color={scoreColor(f.score)} delay={i * 55} />
          </div>
          {f.detail && <small>{f.detail}</small>}
        </div>
      ))}
    </div>
  );
}

// ── (F) Kritik noktalar — "almadan önce bunu bil" ─────────────────────────
export function CriticalPoints({ items = [], L = (en) => en }) {
  const rows = (Array.isArray(items) ? items : []).filter((x) => x && (x.title || x.detail));
  if (!rows.length) return null;
  const tone = (s) => (s === 'high' ? 'high' : s === 'low' ? 'low' : 'mid');
  const label = (s) => (s === 'high'
    ? L('Critical', 'Kritik')
    : s === 'low' ? L('Note', 'Not') : L('Important', 'Önemli'));
  return (
    <section className="aic-crit">
      <div className="aic-card-title">🚨 {L('Critical points before you decide', 'Karar öncesi kritik noktalar')}</div>
      <div className="aic-crit-grid">
        {rows.map((x, i) => (
          <article className={`aic-crit-item ${tone(x.severity)}`} key={i} style={{ animationDelay: `${i * 70}ms` }}>
            <span className="aic-crit-tag">{label(x.severity)}</span>
            {x.title && <strong>{x.title}</strong>}
            {x.detail && <p>{x.detail}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

// ── (G) Quiz etkisi — verdiğin cevap skoru NASIL değiştirdi ───────────────
// "Kişisel analiz" iddiasının kanıtı: her satır bir cevabı ve o cevabın bu
// ürün/servis için artı mı eksi mi olduğunu gösterir.
export function QuizImpact({ items = [], L = (en) => en }) {
  const rows = (Array.isArray(items) ? items : []).filter((x) => x && (x.answer || x.note));
  const { drawn, reduced } = useDrawn();
  if (!rows.length) return null;
  return (
    <section className="aic-qi">
      <div className="aic-card-title">🧠 {L('How your answers shaped this', 'Cevapların sonucu nasıl değiştirdi')}</div>
      <div className="aic-qi-rows">
        {rows.map((x, i) => {
          const v = Math.max(-100, Math.min(100, Number(x.impact) || 0));
          const w = drawn ? Math.min(50, Math.abs(v) / 2) : 0;
          const col = v >= 8 ? CHART_COLORS.strong : v <= -8 ? CHART_COLORS.weak : CHART_COLORS.balanced;
          return (
            <div className="aic-qi-row" key={i}>
              <div className="aic-qi-copy">
                <span className="aic-qi-topic">{x.topic || x.question || ''}</span>
                {x.answer && <b className="aic-qi-answer">“{x.answer}”</b>}
                {x.note && <small>{x.note}</small>}
              </div>
              <div className="aic-qi-meter" aria-hidden="true">
                <span className="aic-qi-zero" />
                <i
                  className={v < 0 ? 'neg' : 'pos'}
                  style={{
                    width: `${w}%`,
                    background: col,
                    transition: reduced ? 'none' : `width .7s cubic-bezier(.22,.61,.36,1) ${i * 70}ms`,
                  }}
                />
              </div>
              <b className="aic-qi-val" style={{ color: col }}>{v > 0 ? `+${Math.round(v)}` : Math.round(v)}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── (H) Topluluk temaları — internet yorumlarının kırılımı ────────────────
// "İnternet yorumları tarandı" cümlesinin görsel karşılığı: hangi konu ne
// sıklıkta ve hangi yönde konuşuluyor.
export function CommunityThemes({ themes = [], L = (en) => en }) {
  const rows = (Array.isArray(themes) ? themes : []).filter((x) => x && x.label).slice(0, 8);
  if (!rows.length) return null;
  const col = (s) => (s === 'positive' ? CHART_COLORS.strong : s === 'negative' ? CHART_COLORS.weak : CHART_COLORS.balanced);
  const face = (s) => (s === 'positive' ? '👍' : s === 'negative' ? '👎' : '🤔');
  return (
    <section className="aic-themes">
      <div className="aic-card-title">🗣 {L('What people keep talking about', 'İnsanlar en çok neyi konuşuyor')}</div>
      <div className="aic-theme-rows">
        {rows.map((x, i) => (
          <div className="aic-theme" key={`${x.label}-${i}`}>
            <div className="aic-theme-top">
              <span>{face(x.sentiment)} {x.label}</span>
              <b style={{ color: col(x.sentiment) }}>{Math.round(Number(x.strength) || 0)}%</b>
            </div>
            <div className="aic-theme-track">
              <BarFill pct={Math.max(4, Math.min(100, Number(x.strength) || 0))} color={col(x.sentiment)} delay={i * 60} />
            </div>
            {x.detail && <small>{x.detail}</small>}
          </div>
        ))}
      </div>
    </section>
  );
}

// Taranan kaynak tipleri — rozet şeridi.
export function SourceChips({ sources = [], L = (en) => en }) {
  const rows = (Array.isArray(sources) ? sources : [])
    .map((s) => (typeof s === 'string' ? { name: s } : s))
    .filter((s) => s && s.name)
    .slice(0, 10);
  if (!rows.length) return null;
  return (
    <div className="aic-sources">
      <span className="aic-sources-label">🔎 {L('Scanned sources', 'Taranan kaynaklar')}</span>
      {rows.map((s, i) => (
        <span className="aic-source" key={`${s.name}-${i}`} title={s.note || ''}>{s.name}</span>
      ))}
    </div>
  );
}

// ── (I) KPI kutucukları — skor/karar/güven tek satırda ────────────────────
export function StatTiles({ items = [] }) {
  const rows = (Array.isArray(items) ? items : []).filter((x) => x && x.value != null && x.value !== '');
  if (!rows.length) return null;
  return (
    <div className="aic-tiles">
      {rows.map((x, i) => (
        <div className="aic-tile" key={`${x.label}-${i}`} style={{ animationDelay: `${i * 60}ms` }}>
          <span className="aic-tile-label">{x.icon ? `${x.icon} ` : ''}{x.label}</span>
          <b style={x.color ? { color: x.color } : undefined}>{x.value}</b>
          {x.hint && <small>{x.hint}</small>}
        </div>
      ))}
    </div>
  );
}

// ── (J) Karşılaştırma ısı matrisi — hangi ürün hangi faktörde önde ────────
//
// SIFIR BİR VERİ DEĞİL. Ölçüldü 2026-08-29 (canlı kayıt: S26 Ultra vs
// iPhone 17 Pro Max vs Xiaomi 17 Ultra): rapor her ürünü KENDİ AI çağrısında
// üretiyor ve her çağrı kendi faktör etiketlerini uyduruyordu — Samsung
// "İşlemci Performansı", iPhone "Performans". Bu tablo etiketlerin
// BİRLEŞİMİNİ alıp eşleşmeyen hücreye 0 yazıyordu: 14 satırın 42
// hücresinden 28'i sıfırdı ve okuyucu bunu "iPhone'un işlemcisi 0 puan"
// diye okuyordu.
//
// Üretim tarafı artık ortak eksende puanlıyor (qor_ai_prompts.js §7.5), ama
// YAYINLANMIŞ ESKİ KAYITLAR düzelmez. Bu yüzden çizim de savunma yapar:
//   1. AI'ın kendi ortak matrisi (comparison.factorMatrix) varsa O kullanılır.
//   2. Yoksa ürün faktörleri etiket benzerliğine göre KÜMELENİR.
//   3. Bir satır ancak ürünlerin çoğunda ölçülmüşse çizilir; ölçülmeyen
//      hücre "—" olur — asla 0.
// Kumeleme ve satir secimi ARTIK BURADA DEGIL: `lib/factorRows.js` icinde,
// cunku ON-RENDER (Node) da ayni satirlari cizmek zorunda ve JSX dosyasini
// import edemiyor. Gerekce ve olcum o dosyanin basinda.

export function HeatMatrix({ products = [], matrix = null, L = (en) => en, labelOf = (p) => p.name }) {
  // Çubuklar GÖRÜNÜNCE çizilir; tablo sayfanın altında ve mount'ta başlayan
  // bir animasyonu kimse görmüyordu (bkz. useDrawIn).
  const [kap, drawn, reduced] = useDrawIn();
  const cols = Array.isArray(products) ? products.filter((p) => p && p.name) : [];
  const rows = cols.length >= 2 ? factorMatrixRows(cols, matrix) : [];
  if (!rows.length) return null;

  const partial = rows.some((r) => r.filled < cols.length);
  /* ÇUBUK BİR ŞEY SÖYLEMELİ. Tablodaki bütün puanlar dar bir banda toplanıyor
     (ölçüldü 2026-08-30, canlı kayıt: 60-98 arası, 21 hücrenin 18'i 75+) ve
     0-100 ölçeğinde çizilince 85 ile 95 GÖZLE AYNI uzunlukta çıkıyordu —
     yani çubuk hiçbir bilgi taşımıyor, yalnızca yer kaplıyordu.
     Ölçek tablonun KENDİ en düşük değerinin biraz altından başlar; böylece
     fark görünür olur. Yanıltmaz çünkü her çubuğun YANINDA gerçek sayı
     yazıyor ve tabanın ne olduğu `title` ile söyleniyor. */
  const tumDegerler = rows.flatMap((r) => r.values.filter((v) => v != null));
  const enDusuk = tumDegerler.length ? Math.min(...tumDegerler) : 0;
  const taban = Math.max(0, Math.min(60, Math.floor(enDusuk - 5)));
  const dolgu = (v) => Math.max(5, Math.min(100, ((v - taban) / Math.max(1, 100 - taban)) * 100));
  const avg = factorColumnAverages(rows, cols.length);
  const wins = factorColumnWins(rows, cols.length);
  // KÜNYE VURGUSU ORTALAMAYA BAKAR, "kaç faktörde önde"ye DEĞİL. Ölçüldü
  // (canlı kayıt): en yüksek ortalama Samsung'da (90) ama en çok faktör
  // galibiyeti iPhone ve Xiaomi'de (3-3). Çipin BÜYÜK sayısı ortalama olduğu
  // için yeşil çerçeve de onu işaretlemeli; aksi hâlde çip "90" yazıp vurguyu
  // komşusuna veriyordu.
  const enIyiOrt = Math.max(0, ...avg.map((v) => (v == null ? 0 : v)));

  return (
    <section className="aic-heat" ref={kap}>
      <div className="aic-card-title">🧭 {L('Factor by factor', 'Faktör faktör karşılaştırma')}</div>

      {/* ÜRÜN KÜNYESİ TABLONUN DIŞINDA. Ortalama eskiden tablonun EN ALT
          satırındaydı ve "kim genel olarak önde" sorusunun cevabı yedi satır
          aşağıda kalıyordu; ayrıca dar ekranda tablo satır-karta dönüştüğü
          için başlık satırı tamamen kayboluyordu. Künye artık tablodan önce,
          her iki genişlikte de görünür: ad · ortalama · kaç faktörde önde. */}
      <div className="aic-heat-keys">
        {cols.map((p, i) => (
          <div key={`hk-${i}`} className={'aic-heat-key' + (avg[i] != null && avg[i] === enIyiOrt ? ' lead' : '')}>
            <b title={labelOf(p)}>{labelOf(p)}</b>
            <span>
              {avg[i] != null && (
                <em style={{ color: scoreColor(avg[i]) }}>{avg[i]}<i>/100</i></em>
              )}
              {wins[i] > 0 && <u>{wins[i]} {L('leads', 'faktörde önde')}</u>}
            </span>
          </div>
        ))}
      </div>

      <div className="aic-heat-scroll">
        <table className="aic-heat-table" style={{ '--cols': cols.length }}>
          <thead>
            <tr>
              <th className="aic-heat-corner" />
              {cols.map((p, i) => (
                <th key={`${p.name}-${i}`} className="aic-heat-col">
                  <span>{labelOf(p)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const vals = row.values.filter((v) => v != null);
              const best = vals.length ? Math.max(...vals) : 0;
              const tied = vals.filter((v) => v === best).length > 1;
              return (
                <tr key={`${row.label}-${ri}`}>
                  <th scope="row" className="aic-heat-label">{row.label}</th>
                  {row.values.map((v, i) => {
                    if (v == null) {
                      return (
                        <td key={`${row.label}-${i}`} data-name={labelOf(cols[i]) || ''}>
                          <span className="aic-heat-cell empty"
                            title={L('Not measured for this product', 'Bu ürün için ölçülmedi')}>
                            <b>—</b>
                          </span>
                        </td>
                      );
                    }
                    const col = scoreColor(v);
                    const isBest = !tied && v === best && best > 0 && vals.length > 1;
                    return (
                      <td key={`${row.label}-${i}`} data-name={labelOf(cols[i]) || ''}>
                        {/* Genişlik VERİDİR; animasyon yalnızca ona GİDİŞ.
                            Gözlemci ateşlemese bile `useDrawIn`in zamanlayıcısı
                            çubuğu değerine oturtur — boş kalma yolu yok. */}
                        <span className={'aic-heat-cell' + (isBest ? ' best' : '')}
                          title={`${Math.round(v)}/100 · ${L('bars start at', 'çubuk tabanı')} ${taban}`}>
                          <i style={{
                            width: `${drawn ? dolgu(v) : 0}%`,
                            background: col,
                            transition: reduced ? 'none' : `width .75s cubic-bezier(.22,.61,.36,1) ${Math.min(ri * 55 + i * 70, 700)}ms`,
                          }} />
                          <b style={{ color: col }}>{Math.round(v)}</b>
                          {isBest && <em aria-label="best">★</em>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {partial && (
        <p className="aic-heat-note">
          {L(
            '“—” means that factor was not scored for that product — it is not a zero.',
            '“—” o faktörün o ürün için ölçülmediğini gösterir; sıfır puan demek değildir.',
          )}
        </p>
      )}
    </section>
  );
}

/* ── (J2) KARARI BELİRLEYEN FARKLAR — paylaşılan kart ızgarası ─────────────

   Karşılaştırma raporunun en yoğun bilgisi buradaydı ve üç akışın üçünde de
   FARKLI çiziliyordu: ürün karşılaştırması düz madde listesi (`BulletList`),
   link karşılaştırması `la-diffs`, abonelik `subs-diffs`. Ürün tarafındaki
   liste ayrıca "Detaylı analiz" bloğunun içinde, başlıksız, hemen ardından
   gelen nesirle İÇ İÇE görünüyordu — kullanıcının "yazılar iç içe geçmiş"
   dediği yer tam olarak orası.

   Artık üçü de bu bileşeni çiziyor: her fark KENDİ kartında, numaralı, ürün
   adları vurgulu, sayılar mono. Kartlar bir ızgara olduğu için göz farkları
   tek tek tarayabiliyor — düz metinde bu mümkün değildi.

   `names`: metinde geçen ürün/servis adları. Vurgulanınca okuyucu "bu fark
   hangi ürün hakkında" sorusunu paragrafı okumadan yanıtlıyor. */
export function DecisiveDifferences({ items = [], names = null, L = (en) => en, title = '' }) {
  const rows = (Array.isArray(items) ? items : [])
    .map((x) => (typeof x === 'string'
      ? { title: '', detail: x }
      : { title: String(x?.title || ''), detail: String(x?.detail || x?.why || '') }))
    .filter((x) => x.title || x.detail);
  if (!rows.length) return null;
  return (
    <section className="aic-diffs">
      <div className="aic-card-title">⚔️ {title || L('What actually decides it', 'Kararı belirleyen farklar')}</div>
      <ol className="aic-diff-grid">
        {rows.map((x, i) => {
          // Fark İKİ TARAFLI çizilir: cümlenin kendi dönüş noktasından
          // ("…sunarken," / "…sunsa da,") ikiye ayrılır. Kalıp yoksa cümle
          // bölünmeden kalır — uydurma taraf yok (bkz. splitPivot).
          const [sol, sag] = splitPivot(x.detail || '');
          return (
            <li className="aic-diff" key={i} style={{ '--i': Math.min(i, 8) }}>
              <span className="aic-diff-no">{i + 1}</span>
              <div className="aic-diff-body">
                {x.title && <strong>{proseParts(x.title, `dt${i}`, names)}</strong>}
                {sag ? (
                  <div className="aic-diff-sides">
                    <p className={`aic-diff-side aic-tone${toneClass(sol)}`}>
                      {proseParts(sol, `da${i}`, names)}
                    </p>
                    <span className="aic-diff-vs" aria-hidden="true">↔</span>
                    <p className={`aic-diff-side aic-tone${toneClass(sag)}`}>
                      {proseParts(sag, `db${i}`, names)}
                    </p>
                  </div>
                ) : (
                  x.detail ? (
                    <p className={`aic-tone${toneClass(x.detail)}`}>
                      {proseParts(x.detail, `dd${i}`, names)}
                    </p>
                  ) : null
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ── (J3) KARŞI KARŞIYA — ÜRÜN ÜRÜN ─────────────────────────────────────────

   ÖNCE YANLIŞ YAPILDI, DERSİ BURADA DURUYOR. İlk sürüm düz `headToHead`
   nesrini paragraf paragraf bölüp her paragrafı "içinde ilk geçen ürün adına"
   atıyordu. Ölçüldü (canlı S26/iPhone/Xiaomi kaydı): "Apple iPhone 17 Pro Max"
   başlığının altındaki İLK paragraf Samsung'u anlatıyordu — çünkü paragraf
   bir önceki ürünün cümlesiyle açılıyor ("However, recurring display
   issues... detract from ITS otherwise premium experience"). Sonuç: başlıksız
   karışık metin, YANLIŞ BAŞLIKLI metne dönüştü. Yanlış atıf, atıfsızlıktan
   kötüdür.

   Kök neden: `headToHead` ürün ürün YAZILMIYOR. Model onu akışkan
   karşılaştırmalı nesir olarak yazıyor; her paragraf iki-üç ürünü birden
   konuşuyor. O metne olmayan bir yapı dayatılamaz.

   ÇÖZÜM VERİDE: prompt artık ürün başına yapı istiyor
   (`headToHeadByProduct: [{name, case, against}]`, bkz.
   admin/js/qor_ai_prompts.js). Bu bileşen O YAPIYI çizer.

   YAPIYI KİM KURARSA KURSUN AYNI ÇİZİM. `case` / `against` iki biçimde
   gelebilir: model nesir yazar (yeni kayıtlar), çağıran ise ürünün KENDİ
   artı/eksi listesinden madde madde kurar (eski kayıtlar — bkz.
   AiAnalysis.jsx `ComparisonOverview`). Dizi geldiğinde madde listesi, metin
   geldiğinde nesir çizilir; ikisinde de olgu ürünün kendi şeridinde kalır.
   Hiçbir yapı yoksa metin BÖLÜNMEDEN gösterilir — uydurma başlık yok. */
export function HeadToHead({ text, rows = null, names = [], L = (en) => en }) {
  const isim = (Array.isArray(names) ? names : []).filter(Boolean);
  const yan = (v) => (Array.isArray(v)
    ? v.map((x) => String(x || '').trim()).filter(Boolean)
    : String(v || '').trim());
  const dolu = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
  const yapi = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      name: String(r?.name || '').trim(),
      lehine: yan(r?.case ?? r?.for),
      aleyhine: yan(r?.against),
      // Kazanan seridi isaretlenir: okuyucu "AI hangisini secti" sorusunun
      // cevabini bu blokta da gorur, yukari kaydirmadan.
      win: Boolean(r?.win),
    }))
    .filter((r) => r.name && (dolu(r.lehine) || dolu(r.aleyhine)));

  // Yapilandirilmis veri YOKSA metni oldugu gibi ver. Bolmek yanlis atif uretir.
  if (!yapi.length) {
    return String(text || '').trim()
      ? <RichProse text={text} L={L} clamp={0} names={isim} />
      : null;
  }
  const govde = (v, k) => (Array.isArray(v)
    ? (
      <ul className="aic-h2h-list">
        {v.map((x, i) => <li key={`${k}-${i}`}>{proseParts(x, `${k}${i}`, isim)}</li>)}
      </ul>
    )
    : <RichProse text={v} L={L} clamp={0} names={isim} />);
  return (
    <div className="aic-h2h">
      {yapi.map((r, i) => (
        <section className={`aic-h2h-item${r.win ? ' win' : ''}`} key={`${r.name}-${i}`}>
          <header className="aic-h2h-head">
            <span className="aic-h2h-no">{i + 1}</span>
            <b>{r.name}</b>
          </header>
          {dolu(r.lehine) && (
            <div className="aic-h2h-side for">
              <span className="aic-h2h-tag">✓ {L('In its favour', 'Lehine')}</span>
              {govde(r.lehine, `f${i}`)}
            </div>
          )}
          {dolu(r.aleyhine) && (
            <div className="aic-h2h-side against">
              <span className="aic-h2h-tag">⚠ {L('Against it', 'Aleyhine')}</span>
              {govde(r.aleyhine, `a${i}`)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

// ── (K) Karar afişi — büyük, tek bakışta okunan sonuç ─────────────────────
export function VerdictBanner({ score, decision, headline, confidence, L = (en) => en }) {
  const kind = decision === 'buy' || decision === 'consider' || decision === 'skip'
    ? decision
    : decisionFromScore(score);
  const title = kind === 'buy'
    ? L('Worth buying for you', 'Sana göre almaya değer')
    : kind === 'consider'
      ? L('Think it over', 'İki kere düşün')
      : L('Better to skip', 'Geçmen daha iyi');
  const val = useCountUp(Number(score) || 0, { duration: 900 });
  return (
    <div className={`aic-verdict ${kind}`}>
      <div className="aic-verdict-score">
        <b>{Math.round(val)}</b>
        <small>/100</small>
      </div>
      <div className="aic-verdict-copy">
        <strong>{title}</strong>
        {headline && <p>{headline}</p>}
      </div>
      {Number(confidence) > 0 && (
        <div className="aic-verdict-conf" title={L('Analysis confidence', 'Analiz güveni')}>
          <span>{L('Confidence', 'Güven')}</span>
          <div className="aic-conf-track"><BarFill pct={Math.max(6, Math.min(100, Number(confidence)))} color="currentColor" /></div>
          <b>{Math.round(Number(confidence))}%</b>
        </div>
      )}
    </div>
  );
}

// ── (L) Zengin artı/eksi listesi — başlık + etki cümlesi ──────────────────
/**
 * FORUM BULGULARI — sahiplerin en cok sevdigi + KRONIK sorunlar.
 *
 * NEDEN AYRI BIR BILESEN: rapor eskiden ayni listeyi iki kez basiyordu. Once
 * "sana uygun / dikkat et" (quiz'e gore), sonra "kullanicilarin sevdigi /
 * sikayeti" — ikincisi neredeyse ilkin kopyasiydi, cunku ikisi de urunun
 * ozelliklerinden turetiliyordu.
 *
 * Bu blok baska bir soruyu yanitliyor: SPEC SAYFASINDAN OKUNAMAYAN sey.
 * Kronik sorun aylar sonra ortaya cikiyor (belirli bir uretim partisi, geri
 * gelen bir firmware hatasi, garanti deneyimi) ve yalnizca forumlarda goruunur.
 * Yayginlik rozeti (`frequency`) bunun icin var: "yaygin" ile "ara sira" ayni
 * agirlikta okunmamali.
 */
/**
 * Forum bulgulari — sevilenler + KRONIK sorunlar.
 *
 * `researched`: rapor gercekten canli arama yaptiysa true. BOS KRONIK LISTE
 * SESSIZCE BOLUMU SILEMEZ — okuyucu "bu urunde kronik sorun yok" ile "bu
 * bolum hic yok"u ayirt edemiyordu. Olculdu 2026-08-25: TR raporlarinda
 * laptop/ekran karti kayitlarinin kronik listesi bostu (MacBook Neo 0, RTX
 * 5090 0) ve sayfada hicbir iz kalmiyordu; ayni urunun EN raporunda 2-3 madde
 * vardi. Arastirma kosmadiysa "sorun bulunamadi" DEMEYIZ — o bir iddia olurdu.
 */
export function ForumFindings({ loved = [], chronic = [], L = (en) => en, researched = false }) {
  const norm = (v) => (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string'
      ? { title: x, detail: '', frequency: '' }
      : { title: x?.title || x?.label || '', detail: x?.detail || '', frequency: x?.frequency || '' }))
    .filter((x) => x.title || x.detail);
  const iyi = norm(loved);
  const kotu = norm(chronic);
  if (!iyi.length && !kotu.length) return null;
  const kronikBos = researched && !kotu.length;
  const siklik = {
    widespread: L('widespread', 'yaygın'),
    common: L('common', 'sık'),
    occasional: L('occasional', 'ara sıra'),
  };
  return (
    <div className="aic-forum">
      {iyi.length > 0 && (
        <div className="aic-forum-col loved">
          <h4>💚 {L('What owners keep praising', 'Sahiplerin en çok sevdiği')}</h4>
          <ul>
            {iyi.map((x, i) => (
              <li key={i} style={{ animationDelay: `${i * 55}ms` }}>
                <b>{x.title}</b>
                {x.detail && <span>{x.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {kronikBos && (
        <div className="aic-forum-col chronic">
          <h4>🩺 {L('Chronic problems', 'Kronik sorunlar')}</h4>
          <p className="aic-forum-none">
            {L(
              'The ownership search turned up no recurring failure for this model — no defect pattern, bad batch or firmware regression that owners keep reporting.',
              'Sahiplik taramasında bu modele ait tekrar eden bir arıza çıkmadı — sahiplerin sürekli bildirdiği bir kusur örüntüsü, hatalı parti ya da yazılım sorunu bulunamadı.',
            )}
          </p>
        </div>
      )}
      {kotu.length > 0 && (
        <div className="aic-forum-col chronic">
          <h4>🩺 {L('Chronic problems', 'Kronik sorunlar')}</h4>
          <ul>
            {kotu.map((x, i) => (
              <li key={i} style={{ animationDelay: `${i * 55}ms` }}>
                <b>
                  {x.title}
                  {x.frequency && siklik[x.frequency] && (
                    <i className={`aic-freq ${x.frequency}`}>{siklik[x.frequency]}</i>
                  )}
                </b>
                {x.detail && <span>{x.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ProConList({ pros = [], cons = [], L = (en) => en, titles = null }) {
  const norm = (v) => (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string' ? { title: x, detail: '' } : { title: x?.title || x?.label || '', detail: x?.detail || '' }))
    .filter((x) => x.title || x.detail);
  const p = norm(pros);
  const c = norm(cons);
  if (!p.length && !c.length) return null;
  const proTitle = titles?.pro || L('Good for you', 'Senin için iyi');
  const conTitle = titles?.con || L('Watch outs', 'Dikkat edilmesi gerekenler');
  return (
    <div className="aic-pc-grid">
      {p.length > 0 && (
        <div className="aic-pc pro">
          <h4>✓ {proTitle}</h4>
          <ul>
            {p.map((x, i) => (
              <li key={i} style={{ animationDelay: `${i * 55}ms` }}>
                <b>{x.title}</b>
                {x.detail && <span>{x.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.length > 0 && (
        <div className="aic-pc con">
          <h4>⚠ {conTitle}</h4>
          <ul>
            {c.map((x, i) => (
              <li key={i} style={{ animationDelay: `${i * 55}ms` }}>
                <b>{x.title}</b>
                {x.detail && <span>{x.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OKUMA KATMANI (2026-08-29)

   Raporun BAŞI iyi okunuyordu (skor halkası, KPI kutuları, faktör çubukları),
   ama "Topluluk yorumu", "Tam değerlendirme", "Sana uyumu" ve "Zamanlama ve
   değer" bölümleri 5-7 paragraflık DÜZ METİN duvarıydı: aynı 14.5px, aynı
   renk, aynı ağırlık, hiç tutamak yok. Kullanıcı metinlerin İYİ olduğunu ama
   OKUNMADIĞINI söyledi — yani sorun içerikte değil, tipografide.

   Metinden tek kelime kısılmadı. Değişen şey okuma yolu:
     · her paragrafın İLK CÜMLESİ konu cümlesi olarak öne çıkar (gazete
       tekniği: göz cümleleri tarar, ilgisini çekeni okur),
     · SAYILAR mono + tabular figürle vurgulanır — proje kuralı zaten bu
       (~/.claude/CLAUDE.md: "her sayı mono, tabular"), rapor metni tek
       istisnaydı,
     · üçten uzun bölümler kademeli açılır; metin SİLİNMEZ, katlanır.
   ═══════════════════════════════════════════════════════════════════════ */

// SAYI VURGUSU — yalnız BIRIMLI/YUZDELI/PARA BIRIMLI sayılar. Model kodundaki
// çıplak sayı ("iPhone 17") vurgulanmaz; vurgulanırsa vurgu anlamını yitirir.
// `\b` TÜRKÇE HARFTE ÇALIŞMIYOR: `\w` yalnız ASCII sayar. Ölçüldü — "2026
// yılında" içindeki "yıl" birim sanılıp vurgulanıyor, "6.9 inç" ise hiç
// vurgulanmıyordu. Kelime sonu elde tanımlanıyor.
const WORD_END = '(?![A-Za-z0-9ğüşıöçĞÜŞİÖÇ])';
// Sayi SON KARAKTERI rakam olmali: `[\d.,]*` cumle sonundaki virgulu de
// yutuyordu ("₺89.999," mono kutuda virgulle birlikte cikiyordu).
// ARALIK TEK PARÇA. "3-6 ay" ilk sürümde "3-" düz + "6 ay" mono diye ikiye
// bölünüyordu; okuyucu yarım bir sayı görüyordu.
const RANGE = '(?:\\d[\\d.,]*\\s?[-–—]\\s?)?';

const PROSE_NUM_RE = new RegExp(
  '('
  + '%\\s?\\d(?:[.,]?\\d)*'                              // %15
  + '|[₺$€£]\\s?\\d(?:[.,]?\\d)*'                        // ₺45.000
  + '|\\d[\\d.,]*\\s?/\\s?100'                           // 89/100
  + '|' + RANGE + '\\d[\\d.,]*\\s?(?:%|mAh|GB|TB|MB|MP|GHz|MHz|Hz|nit|nits|Wh|W|mm|cm|kg|inç|inch|fps|dB|ms|TL|USD|EUR)' + WORD_END
  + '|' + RANGE + '\\d[\\d.,]*\\s?(?:yıl|yil|ay|gün|gun|saat|year|years|month|months|day|days|hour|hours)' + WORD_END
  + ')',
  'gi',
);

const PROSE_NUM_TEST = new RegExp(`^(?:${PROSE_NUM_RE.source.slice(1, -1)})$`, 'i');

/* URUN ADI VURGUSU. Karsilastirma metninde uc urun adi duz metin icinde
   kayboluyordu; okuyucu "hangi urun hakkinda konusuyor" sorusunu ancak
   cumleyi bastan okuyarak yanitlayabiliyordu. Adlar artik kalin ve koyu —
   goz paragraflari TARAYARAK ilgilendigi urunu bulabiliyor. */
/* AD BIR SEKILDE YAZILMAZ. Katalog adi "Samsung Galaxy S26 Ultra
   (12 GB / 512 GB)" ama model metinde "Samsung Galaxy S26 Ultra" ya da
   markasiz "iPhone 17 Pro Max" diye geciyor. Birebir eslesme arandigi icin
   OLCULDU 2026-08-30 (canli kayit, farklar blogu): bold olan TEK ad "Xiaomi
   17 Ultra" idi — Samsung ve iPhone hic vurgulanmiyordu ve okuyucu bunu
   "bazilari kalin bazilari ince" diye goruyor.
   Her ad icin uc yazim uretilir: tam · parantezsiz · markasiz. Uzun olan
   ONCE denenir; yoksa kisa alias uzun adin icinden parca kapardi. */
function nameAliases(names) {
  const out = [];
  const ekle = (v) => {
    const t = String(v || '').replace(/\s{2,}/g, ' ').trim();
    if (t.length >= 6 && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  for (const ham of (Array.isArray(names) ? names : [])) {
    const tam = String(ham || '').trim();
    if (!tam) continue;
    ekle(tam);
    const parantezsiz = tam.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    ekle(parantezsiz);
    // Marka ilk kelimededir; yalnizca GERIDE en az iki kelime kalirsa duser
    // ("Apple iPhone 17 Pro Max" -> "iPhone 17 Pro Max"). Yoksa "Ultra" gibi
    // tek kelimelik bir parca metnin her yerinde eslesirdi.
    const kelimeler = parantezsiz.split(/\s+/);
    if (kelimeler.length >= 3) ekle(kelimeler.slice(1).join(' '));
  }
  return out.sort((a, b) => b.length - a.length);
}

function highlightNames(node, names, keyPrefix) {
  if (!names || !names.length || typeof node !== 'string' || !node) return [node];
  const alias = nameAliases(names);
  if (!alias.length) return [node];
  const esc = (v) => v.replace(/[^\p{L}\p{N}\s]/gu, (ch) => '\\' + ch);
  const re = new RegExp(`(${alias.map(esc).join('|')})`, 'gi');
  const parcalar = node.split(re);
  if (parcalar.length === 1) return [node];
  return parcalar.filter(Boolean).map((piece, i) => (
    alias.some((n) => n.toLowerCase() === piece.toLowerCase())
      ? <b className="aic-name" key={`${keyPrefix}-nm${i}`}>{piece}</b>
      : piece
  ));
}

function proseParts(text, keyPrefix, names) {
  const out = [];
  String(text || '').split(/(\*\*[^*]+\*\*)/g).forEach((seg, si) => {
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      out.push(<strong key={`${keyPrefix}-b${si}`}>{seg.slice(2, -2)}</strong>);
      return;
    }
    seg.split(PROSE_NUM_RE).forEach((piece, pi) => {
      if (!piece) return;
      // `g` bayrakli regex'te `.test()` lastIndex'i ILERLETIR ve sonraki
      // parca yanlis sonuc alir; test icin bayraksiz ikizi kullaniliyor.
      if (PROSE_NUM_TEST.test(piece)) {
        out.push(<b className="aic-num" key={`${keyPrefix}-n${si}-${pi}`}>{piece}</b>);
      } else {
        out.push(
          <span key={`${keyPrefix}-t${si}-${pi}`}>
            {highlightNames(piece, names, `${keyPrefix}-${si}-${pi}`)}
          </span>,
        );
      }
    });
  });
  return out;
}

// Model bazen tek blok, bazen boş satırlı paragraf, bazen "### başlık" yazıyor.
// Üçünü de aynı şekle indir: [{kind, text}].
export function proseBlocks(text) {
  const raw = String(text || '').replace(/```[a-z]*\s*/gi, '').trim();
  if (!raw) return [];
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks = [];
  lines.forEach((line) => {
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ kind: 'head', text: line.replace(/^#{1,6}\s+/, '').replace(/[:：]\s*$/, '') });
      return;
    }
    if (/^[-•*]\s+/.test(line)) {
      blocks.push({ kind: 'bullet', text: line.replace(/^[-•*]\s+/, '') });
      return;
    }
    blocks.push({ kind: 'p', text: line.replace(/^>\s+/, '') });
  });
  // TEK NEFESTE YAZILMIŞ METİN. Model kimi zaman 600 kelimeyi tek satırda
  // döndürüyor; o hâlde paragraf ritmi diye bir şey kalmıyor. Cümlelere böl,
  // üçerli paragraflara topla.
  if (blocks.length === 1 && blocks[0].kind === 'p' && blocks[0].text.length > 640) {
    const sents = blocks[0].text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const packed = [];
    for (let i = 0; i < sents.length; i += 3) packed.push({ kind: 'p', text: sents.slice(i, i + 3).join(' ') });
    return packed;
  }
  return blocks;
}

/* KONU CUMLESININ TONU — SIYAH KALAN CUMLE YOK.
   Kural basit: iyi yazilan sey YESIL, elestiri/olumsuzluk KIRMIZI.

   Ilk surumde TAM KELIME araniyordu ve Turkce'de bu calismiyor: "guclu"
   listede vardi ama cumlede "guclendirilmis" geciyordu, eslesmedi ve cumle
   SIYAH kaldi. Artik KOK araniyor ("gucl" -> guclu, guclendirilmis) ve iki
   taraf da SAYILIYOR; agir basan taraf rengi belirler.

   Berabere kalinca bile siyah birakilmaz: cumlede bir DONUS baglaci varsa
   ("ancak", "fakat") hukum olumsuza doner, yoksa olumlu sayilir. Boylece
   her konu cumlesi bir yon tasir. */
const TONE_HEAD = '(?<![A-Za-zğüşıöçĞÜŞİÖÇ])';
const POS_KOK = [
  'memnuniyet', 'övgü', 'ovgu', 'beğen', 'begen', 'başarı', 'basari',
  // 'gucl' ASCII 'c' ile yazilmis ve "GUCLU" kelimesinde 'c' DEGIL 'c'
  // var — yani 'guclu' hicbir zaman olumlu sayilmiyordu. Diakritikli
  // hali de listede.
  'güçl', 'gücl', 'gucl',
  'mükemmel', 'mukemmel', 'etkileyici', 'üstün', 'ustun', 'avantaj', 'olumlu', 'takdir',
  'lider', 'rakipsiz', 'ideal', 'zirve', 'öne çık', 'one cik', 'tavsiye', 'iyi',
  'yeterli', 'akıcı', 'akici', 'sorunsuz', 'kolaylık', 'kolaylik', 'geniş', 'genis',
  // 'yüksek' LİSTEDEN ÇIKARILDI (2026-09-01). Bir HÜKÜM değil BÜYÜKLÜK
  // bildiriyor: "yüksek yük", "yüksek sıcaklık", "yüksek fiyat", "yüksek ses"
  // hepsi olumsuz. Ölçüldü canlı RTX 4060 kaydında: "…YÜKSEK yük altında
  // HDD benzeri bir tıkırtı … rapor etmiştir" cümlesi yalnız bu kök yüzünden
  // YEŞİL çıkıyordu — bir şikâyet, olumlu diye boyanmış.
  'uzun ömür', 'uzun omur', 'sağlam', 'saglam', 'dayanıklı',
  // 'zengin' ÇIKARILDI: "görsel zenginliğe önem veren kullanıcılar için bir
  // DEZAVANTAJ" cümlesinde kullanıcı tercihini tarif ediyor, ürün hakkında
  // hüküm bildirmiyordu — olumsuz hükmü dengeleyip cümleyi renksiz bırakıyordu.
  'dayanikli', 'hızlı', 'hizli', 'premium', 'şık', 'net ',
  // YOKLUK EKİ = OLUMLU. Bunlar listede yoktu ve "Kusursuz bir ekran ve
  // sınırsız depolama sunar" cümlesi hiçbir köke eşleşmeyip RENKSİZ
  // kalıyordu. ('sorunsuz' zaten yukarıda.)
  'kusursuz', 'sınırsız', 'sinirsiz', 'hatasız', 'hatasiz', 'arızasız', 'arizasiz',
  // Tek anlamlı kalite sıfatları. ('kalite' TEK BAŞINA alınmadı — "kamera
  // kalitesi düşük" cümlesinde olumsuzu dengelerdi; sıfat hâli güvenli.)
  'kaliteli', 'rahatça', 'rahatca', 'verimli', 'keskin',
  'praise', 'excellent', 'outstanding', 'strong', 'impressive', 'leading',
  'recommend', 'great', 'best', 'smooth', 'reliable', 'durable', 'fast',
];
const NEG_KOK = [
  'sorun', 'şikayet', 'sikayet', 'kusur', 'arıza', 'ariza', 'hayal kırık', 'hayal kirik',
  'zayıf', 'zayif', 'düşük', 'dusuk', 'eksik', 'geride kal', 'dezavantaj', 'risk',
  'olumsuz', 'başarısız', 'basarisiz', 'yetersiz', 'pahalı', 'pahali', 'kısıt', 'kisit',
  'sınırl', 'sinirl', 'ısınma', 'isinma', 'donma', 'gecikme', 'şarj kayb', 'sarj kayb',
  'hata', 'çökme', 'cokme', 'bozul', 'aşınma', 'asinma', 'endişe', 'endise',
  'problem', 'complaint', 'issue', 'weak', 'poor', 'lacks', 'disappoint',
  'drawback', 'fail', 'expensive', 'limited', 'overheat', 'defect',
  // Olculdu 2026-08-30: "40W hizli sarj, rakiplerine gore daha YAVASTIR"
  // cumlesi yesil cikiyordu — 'yavas' listede yoktu, 'hizli' ise SPEC ADI
  // icinde gecip olumlu sayiliyordu.
  'yavaş', 'yavas', 'gerisinde', 'kısa süre', 'kisa sure', 'slower', 'behind',
  // "yuksek fiyat" tuzagi: 'yuksek' olumlu kok, ama fiyatla birlikte
  // olumsuz. Ifade olarak listede, tek basina 'yuksek' olumlu kalir.
  'engel', 'yüksek fiyat', 'yuksek fiyat', 'pahalı fiyat', 'barrier', 'high price',
  // Donanım şikâyetlerinin SÖZLÜĞÜ eksikti: bobin sesi/coil whine bildiren
  // cümlelerde tek bir olumsuz kök bile eşleşmiyordu.
  'tıkırtı', 'tikirti', 'vızıltı', 'vizilti', 'uğultu', 'ugultu', 'gürültü', 'gurultu',
  'bobin sesi', 'coil whine', 'titreşim', 'titresim', 'aşırı ısın', 'asiri isin',
  'rahatsız', 'rahatsiz', 'tepki süresi', 'noisy', 'rattle', 'buzzing', 'throttl',
];
const TONE_DONUS = new RegExp(TONE_HEAD + '(ancak|fakat|ama |ne var ki|buna karşın|buna karsin|rağmen|ragmen|however|but |although|yet )', 'i');
// Kok listesindeki tek ozel karakter bosluk; yine de kacis guvenligi icin
// regex-anlamli karakterler kacisliyor.
const ESC = /[.*+?^${}()|[\]\\]/g;
const kokRe = (list, kuyruk = '') => new RegExp(
  `${TONE_HEAD}(?:${list.map((w) => w.replace(ESC, '\\$&')).join('|')})${kuyruk}`,
  'gi',
);
const POS_RE = kokRe(POS_KOK);
// YOKLUK EKİ KÖKÜ İPTAL EDER: "sorunsuz" olumsuz DEĞİLDİR, "sorunları"
// olumsuzdur. `sorun` kökü `sorunsuz` içinde de eşleşiyordu ve cümle hem
// olumlu hem olumsuz sayılıp RENKSİZ kalıyordu (ölçüldü: "…sorunsuz bir
// deneyim sunar"). Ek, kökün hemen ardından (en çok iki harf sonra)
// geliyorsa eşleşme düşer. Aynısı kusursuz/sınırsız/hatasız için de geçerli.
const NEG_RE = kokRe(NEG_KOK, '(?![a-zçğıöşü]{0,2}s[uüıi]z)');

function sayKok(re, text) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n += 1;
  re.lastIndex = 0;
  return n;
}

/* INKAR ISARETI TERS CEVIRIR — ve cevirmeyi unutunca hukum yanlis renge
   duser. Olculdu 2026-08-30 (canli S26/iPhone/Xiaomi kaydi):

     "Ancak bu, genel deneyimi OLUMSUZ etkileyecek kritik bir nokta DEGILDIR."

   Bu cumle guven veriyor ama sayfada KIRMIZI cikiyordu: "olumsuz" koku
   sayiliyor, "degildir" hic bakilmiyordu. Ayni kor nokta ters yonde de var:
   "kamera IYI DEGIL" yesil cikardi.

   Cozum kelime saymadan once CUMLECIKLERE bolmek: inkar eki tasiyan
   cumlecikte pozitif ve negatif sayimlar YER DEGISTIRIR. Bolme noktalari
   virgul, noktali virgul ve baglaclar — Turkcede inkar eki fiilin sonunda,
   yani ait oldugu cumlecigin icinde kalir. */
/* IKI AYRI KALIP, IKI AYRI SINIR — ve bu ayrimi atlamak fonksiyonu
   TAMAMEN calismaz yapiyordu. `TONE_HEAD` bir "kelime basi" lookbehind'i
   (onunde harf olmasin). Ek kaliplari ONA baglayinca "cikMADI" hic
   eslesmiyordu: "madi"nin onunde 'k' var. Sonuc: inkar tespiti sifir vaka
   yakaliyordu.
     · KELIME olarak gecenler (degil, yok...) -> kelime basi sarti VAR
     · EK olarak gecenler (-madi, -maz, -mayabilir) -> kelime SONU sarti var,
       basta harf olmasi zaten beklenen sey. */
const NEG_INKAR = new RegExp(
  '(?:'
  + TONE_HEAD + "(?:degil|değil|yok|bulunmuyor|gerektirmez|not |isn't|aren't|no longer|without)"
  + '|m[ae](?:dı|di|du|dü)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])'
  + '|m[ae]z(?![a-zA-ZçğıöşüÇĞİÖŞÜ])'
  // Yalniz TEK ANLAMLI olanlar: "-mayabilir" / "-mayacak" inkardir. Duz
  // "-maya" ALINMADI — "saymaya basladi" da ayni yuzeye sahip ve inkar degil.
  + '|m[ae]yabil|m[ae]yacak'
  + ')',
  'i',
);
const CUMLECIK_RE = /[,;]|\bve\b|\bama\b|\bancak\b|\bfakat\b|\bbut\b|\bhowever\b|\balthough\b/i;

/* OLUMSUZ KOKUN OLUMSUZ OLMADIGI YERLER. "dusuk isik kosullarinda bile canli
   fotograflar" cumlesi 'dusuk' koku yuzunden KIRMIZI cikiyordu — oysa cumle
   olumlu ve "dusuk isik" bir cekim kosulu, kusur degil. Bu tamlamalar sayim
   oncesi metinden dusurulur; koku listeden cikarmak olmazdi, cunku "dusuk
   depolama" gercekten olumsuz. */
// "hızlı şarj" EKLENDİ (2026-09-01): bir spec ADI, hüküm değil. Ölçüldü:
// "40W HIZLI ŞARJ, rakiplerine göre daha yavaştır" cümlesinde baştaki spec
// adı olumlu sayılıp asıl hükmü (yavaştır) dengeliyor ve cümle renksiz
// kalıyordu. 'hızlı' tek başına olumlu kalır ("hızlı açılıyor").
// "kısa sürede" EKLENDİ: `kısa süre` olumsuz kök ("kısa süre dayanıyor") ama
// "-de" hâliyle SÜREYİ değil HIZI anlatıyor ve olumludur — ölçüldü:
// "…kısa sürede tam dolum imkânı sunar" cümlesi KIRMIZI çıkıyordu.
const TONE_MUAF = /(d[uü][sş][uü]k [iı][sş][iı][kğ]|low[- ]light|d[uü][sş][uü]k gecikme|low latency|d[uü][sş][uü]k [iı]s[iı] ?[uü]retimi|h[iı]zl[iı] [sş]arj|fast charging|k[iı]sa s[uü]rede)/gi;

function leadTone(text) {
  const t = String(text || '');
  if (!t) return '';
  let pos = 0;
  let neg = 0;
  // HUKUM SONDA VERILIR. Turkce cumlede yuklem sonda; "40W hizli sarj,
  // rakiplerine gore daha yavastir" cumlesinde bas olumlu bir SPEC ADI
  // ("hizli sarj"), hukum ise son cumlecikte. Esit sayimda bas kazanip cumle
  // yesile duruyordu. Son cumlecik iki kat sayilir.
  const cumlecikler = t.split(CUMLECIK_RE).filter(Boolean);
  cumlecikler.forEach((cumlecik, i) => {
    const agirlik = i === cumlecikler.length - 1 ? 2 : 1;
    const temiz = cumlecik.replace(TONE_MUAF, ' ');
    const p = sayKok(POS_RE, temiz) * agirlik;
    const n = sayKok(NEG_RE, temiz) * agirlik;
    // Inkar varsa isaretler yer degistirir: "olumsuz ... degildir" = olumlu,
    // "iyi degil" = olumsuz.
    if (NEG_INKAR.test(cumlecik)) { pos += n; neg += p; } else { pos += p; neg += n; }
  });
  // KANIT YOKSA RENK YOK (2026-09-01). Önceki sürüm HER cümleyi yeşil ya da
  // kırmızı yapmak zorundaydı ve eşitlikte 'pos' dönüyordu — yani TAHMİN
  // ediyordu. Tahminle renk vermek renk vermemekten kötü: kullanıcı canlı
  // sayfada olumsuz bir şikâyeti yeşil, olumlu bir hükmü kırmızı gördü.
  //
  // Üç çıkış: 'pos' · 'neg' · '' (nötr, sınıf basılmaz → metin kendi rengini
  // korur, sayı da öyle). Nötr iki durumda oluşur:
  //   1. hiçbir kök eşleşmedi   → söyleyecek bir şey yok
  //   2. iki taraf da doluysa ve baskın taraf ötekinin İKİ KATINDAN fazla
  //      değilse → cümle gerçekten KARIŞIK ("…olumlu seyretmektedir, ancak
  //      kısıtlamalar ve sorunlar da dile getirilmektedir"). Böyle bir cümleyi
  //      tek renge zorlamak okuyucuya yanlış hüküm okutuyordu.
  if (pos === 0 && neg === 0) return '';
  if (pos > 0 && neg > 0 && Math.max(pos, neg) <= 2 * Math.min(pos, neg)) return '';
  return pos > neg ? 'pos' : 'neg';
}

// Ton sınıfı — nötrde HİÇBİR sınıf basılmaz (boş `aic-tone-` üretmemek için).
function toneClass(text) {
  const t = leadTone(text);
  return t ? ` aic-tone-${t}` : '';
}

// Paragrafın konu cümlesi: ilk cümle, makul uzunluktaysa.
//
// NOKTA HER ZAMAN CÜMLE SONU DEĞİL. Ölçüldü: "…detay ve F1.4 diyafram
// açıklığı…" cümlesi "F1."den bölünüyor, konu cümlesi ürünün ortasında
// kesiliyordu. Cümle sonu sayılması için noktadan sonra BOŞLUK + BÜYÜK HARF
// gelmeli ve noktadan önceki jeton tek harf + rakam (F1, v2, M4) olmamalı.
const SENT_END_RE = /[.!?]+(?=\s)/g;
const ABBR_TAIL_RE = /(?:^|[\s(])[A-Za-zÇĞİÖŞÜ]\d+$/;

function splitLead(text) {
  const s = String(text || '').trim();
  SENT_END_RE.lastIndex = 0;
  let m = SENT_END_RE.exec(s);
  while (m) {
    const end = m.index + m[0].length;
    const next = s.slice(end).replace(/^\s+/, '').charAt(0);
    const okNext = next && (next === next.toLocaleUpperCase('tr') && /[A-Za-zÇĞİÖŞÜ"“(]/.test(next));
    if (end >= 20 && end <= 190 && okNext && !ABBR_TAIL_RE.test(s.slice(0, m.index))) {
      const lead = s.slice(0, end);
      const rest = s.slice(end).trim();
      return rest.length > 40 ? [lead, rest] : [null, s];
    }
    if (end > 190) break;
    m = SENT_END_RE.exec(s);
  }
  return [null, s];
}

/* ── CÜMLEYİ İKİYE BÖL: "ne" ve "ne demek" ────────────────────────────────
   Karşılaştırma kartlarındaki artı/eksi maddeleri TEK CÜMLE geliyor ve uzun:
   ölçüldü (canlı S26 Ultra / iPhone 17 Pro Max / Xiaomi 17 Ultra kaydı) 11
   maddenin 9'u 95 karakterin üstünde. Alt alta beşi gri bir duvar oluyordu ve
   kullanıcının "çok uzun cümleler var, ayırt edici kısımlar yok" dediği yer
   tam olarak burası.

   Model bu cümleleri hep aynı kalıpta yazıyor: ÖNCE ölçülebilir olan
   ("2600 nit parlaklığa sahip 6.9 inç Dynamic AMOLED 2X ekran"), SONRA hüküm
   ("açık havada bile mükemmel görünürlük sağlar"). Ayraç ya ilk üst-seviye
   virgül ya da " ile / sayesinde " bağlacı. Oradan bölününce ilk parça KOYU
   bir tutamak, ikincisi açıklama olur.

   UYDURMA YOK: bölme cümlenin İÇİNDE kalır, iki parça da aynı cümleye aittir
   — paragrafı bir ürüne ATAYAN eski yöntemle akrabalığı yok (o yol yanlış
   atıf üretmişti, bkz. HeadToHead). Kalıp tutmazsa cümle bölünmez.
   Ölçüm: aynı kayıtta 11 maddenin 11'i doğru bölündü. */
const CLAUSE_CONN = /\s(?:ile|sayesinde|with|thanks to)\s/i;

export function splitClause(text) {
  const s = String(text || '').trim();
  if (s.length < 62) return [null, s];
  // Parantez İÇİNDEKİ virgül ayraç değildir: "(12 GB, 512 GB)".
  let derinlik = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '(' || ch === '[') derinlik += 1;
    else if (ch === ')' || ch === ']') derinlik = Math.max(0, derinlik - 1);
    else if (ch === ',' && derinlik === 0 && s[i + 1] === ' ') {
      // Ondalık virgül ("1,5 mm") ayraç değil; ayraç virgülünden sonra boşluk
      // gelir ve iki yanı rakam olmaz.
      if (/\d/.test(s[i - 1] || '') && /\d/.test(s[i + 2] || '')) continue;
      // Virgül BAŞTA kalır: metin olduğu gibi korunsun, yalnızca ağırlığı değişsin.
      if (i >= 12 && i <= 84 && s.length - i >= 28) return [s.slice(0, i + 1), s.slice(i + 1).trim()];
      break; // İLK üst-seviye virgül ayraçtır; sonrakiler yüklemin içinde.
    }
  }
  const m = s.match(CLAUSE_CONN);
  if (m && m.index >= 12 && m.index <= 84 && s.length - m.index >= 28) {
    return [s.slice(0, m.index), s.slice(m.index + 1).trim()];
  }
  return [null, s];
}

/* ── FARKI İKİ TARAFA AYIR ────────────────────────────────────────────────
   "Kararı belirleyen farklar" maddeleri iki ürünü TEK cümlede karşılaştırıyor
   ve dönüş noktası hep aynı ek: "…sunarken, iPhone…" / "…sunsa da, 40W…".
   Ölçüldü: canlı kayıttaki 6 farkın 5'inde bu dönüş var.

   Hiçbir yarı bir ürüne ATANMIYOR — cümle yalnızca kendi bağlacından ikiye
   ayrılıyor, adları zaten `highlightNames` işaretliyor. Kalıp yoksa cümle
   bölünmeden döner. */
const PIVOT_TR = /(rken|ken|sa da|se de|masına rağmen|mesine rağmen|rağmen|karşın)\s*,\s+/;
const PIVOT_EN = /\s(?:while|whereas|although|though|but)\s/i;

export function splitPivot(text) {
  const s = String(text || '').trim();
  if (s.length < 90) return [s, ''];
  const m = s.match(PIVOT_TR);
  if (m && m.index > 24 && s.length - (m.index + m[0].length) > 24) {
    return [s.slice(0, m.index + m[1].length), s.slice(m.index + m[0].length).trim()];
  }
  const e = s.match(PIVOT_EN);
  if (e && e.index > 24 && s.length - (e.index + e[0].length) > 24) {
    return [s.slice(0, e.index).replace(/[,;]\s*$/, ''), s.slice(e.index + 1).trim()];
  }
  return [s, ''];
}

// Uzun bir "kime uygun" metnini cümlelere ayırır — her cümle kendi satırında
// okunur. Bölme noktası cümle sonu, yani metin bozulmuyor.
export function sentencesOf(text) {
  return String(text || '').trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ"“(])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* TEK SATIRLIK metnin OKUNUR hâli: tutamak + açıklama.
   `ProseLine` cümleyi tek parça basar; kart içindeki uzun artı/eksi maddesi
   için bu yetmiyordu. `ProseClause` aynı vurguları (sayı, ürün adı, ton)
   korur ama cümleyi `splitClause` ile ikiye ayırıp ilk parçayı KOYU yapar. */
export function ProseClause({ text, names = null, keyPrefix = 'pc', tone = true }) {
  const t = String(text || '').trim();
  if (!t) return null;
  const cls = tone ? toneClass(t) : '';
  const [bas, kalan] = splitClause(t);
  if (!bas) return <span className={`aic-tone${cls}`}>{proseParts(t, keyPrefix, names)}</span>;
  return (
    <span className={`aic-tone${cls}`}>
      <b className="aic-clause">{proseParts(bas, `${keyPrefix}-h`, names)}</b>{' '}
      <span className="aic-clause-rest">{proseParts(kalan, `${keyPrefix}-r`, names)}</span>
    </span>
  );
}

/**
 * ZENGİN RAPOR METNİ — `AiText` + okuma katmanı.
 *
 * @param text     ham AI metni
 * @param clamp    kaç paragraf açık başlasın (0 = hepsi). Gerisi katlanır.
 */
/* TEK SATIRLIK metin icin okuma katmani. `RichProse` paragraf bloklari
   kurar (konu cumlesi, katlama, madde isareti); kart icindeki tek satirlik
   arti/eksi maddesi ve kunye cumlesi icin fazla. Ama sayi ve urun adi
   vurgusu ORADA DA olmali — olmayinca ayni sayi sayfanin bir yerinde altin,
   otekinde duz metin cikiyordu (olculdu: karsilastirma kartlarinda "2600
   nit" duz, hemen altindaki farklar kartinda altin). */
export function ProseLine({ text, names = null, keyPrefix = 'pl', tone = true }) {
  const t = String(text || '').trim();
  if (!t) return null;
  // SAYI, ICINDE GECTIGI CUMLENIN YONUNU ALIR. Sabit bir "olcu rengi"
  // denendi (once kehribar, sonra mavi) ama okuyucu icin bilgi tasimiyordu:
  // "40W ... daha yavastir" cumlesindeki 40W ile "90W hizli sarj" cumlesindeki
  // 90W ayni renkteydi. Ton zaten hesaplaniyor (leadTone); sayi da ondan
  // besleniyor. Notr baglam yok — leadTone daima pos ya da neg dondurur.
  const cls = tone ? toneClass(t) : '';
  return <span className={`aic-tone${cls}`}>{proseParts(t, keyPrefix, names)}</span>;
}

export function RichProse({ text, clamp = 3, L = (en) => en, names = null }) {
  const [open, setOpen] = useState(false);
  const blocks = proseBlocks(text);
  if (!blocks.length) return null;
  const limit = clamp > 0 && !open ? clamp : blocks.length;
  const hidden = Math.max(0, blocks.length - limit);

  // KATLANAN PARAGRAFLAR DOM'DA KALIR, yalnizca `display` kapanir. Ilk surum
  // onlari hic render ETMIYORDU; bu, tam da indekslenmeye calisan /analiz
  // sayfalarinin metninin dortte ucunu JS calistiran crawler'dan saklamak
  // demekti. Gizli metin DOM'da oldugu surece indekslenir; hic basilmayan
  // metin indekslenemez.
  const draw = (b, i) => {
    const hid = i >= limit;
    if (b.kind === 'head') {
      return <h5 className={`aic-prose-head${hid ? ' hid' : ''}`} key={`h-${i}`}>{proseParts(b.text, `h${i}`, names)}</h5>;
    }
    if (b.kind === 'bullet') {
      return (
        <li className={`aic-prose-li aic-tone${toneClass(b.text)}${hid ? ' hid' : ''}`} key={`l-${i}`}>
          {proseParts(b.text, `l${i}`, names)}
        </li>
      );
    }
    const [lead, rest] = splitLead(b.text);
    return (
      <p className={`aic-prose-p aic-tone${toneClass(b.text)}${hid ? ' hid' : ''}`}
        key={`p-${i}`} style={{ '--i': Math.min(i, 6) }}>
        {lead ? (
          <strong className={`aic-prose-lead${leadTone(lead) ? ` ${leadTone(lead)}` : ''}`}>
            {proseParts(lead, `pl${i}`, names)}
          </strong>
        ) : null}
        {lead ? ' ' : null}
        {proseParts(rest, `pr${i}`, names)}
      </p>
    );
  };

  return (
    <div className={`aic-prose${open ? ' open' : ''}`}>
      {blocks.map(draw)}
      {hidden > 0 && (
        <button type="button" className="aic-prose-more" onClick={() => setOpen(true)}>
          {L(`Read the rest (${hidden} more paragraphs)`, `Devamını oku (${hidden} paragraf daha)`)}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Bölüm başlığındaki ölçü — sayı yerine OKUNAN bir çubuk ────────────────
// "Topluluk yorumu · 89/100" satırındaki 89 tek başına ölçeksizdi. Aynı sayı
// artık bandın neresinde olduğunu da gösteriyor.
export function ScoreMeter({ value, label = '', L = (en) => en, hint = '' }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const shown = useCountUp(v, { duration: 850 });
  const { drawn, reduced } = useDrawn();
  const col = scoreColor(v);
  if (!Number.isFinite(v) || v <= 0) return null;
  return (
    <div className="aic-meter">
      <div className="aic-meter-top">
        {label ? <span>{label}</span> : <span />}
        <b style={{ color: col }}>{Math.round(shown)}<i>/100</i></b>
      </div>
      <div className="aic-meter-track" role="img" aria-label={`${v}/100`}>
        <span className="aic-meter-tick" style={{ left: '50%' }} />
        <span className="aic-meter-tick" style={{ left: '70%' }} />
        <i style={{
          width: `${drawn ? v : 0}%`,
          background: col,
          transition: reduced ? 'none' : 'width .8s cubic-bezier(.22,.61,.36,1)',
        }} />
      </div>
      {hint ? <small className="aic-meter-hint">{hint}</small> : <small className="aic-meter-hint">
        {v >= 70 ? L('strong', 'güçlü') : v >= 50 ? L('mixed', 'karışık') : L('weak', 'zayıf')}
      </small>}
    </div>
  );
}

/* ── FİYAT PROJEKSİYONU ────────────────────────────────────────────────────
   "Zamanlama ve değer" bölümü üç metin satırı + bir paragraf yığınıydı:
   yön (yükseliş/düşüş), beklenen değişim ("%5-10") ve en iyi alım penceresi
   hep CÜMLE içinde saklıydı. Aynı üç veri bir eğri olarak tek bakışta okunur.

   VERİ UYDURULMUYOR: eğri yalnızca raporun KENDİ alanlarından türer —
   `trend` yönü verir, `expectedChange` içindeki yüzde büyüklüğü, `bestTime`
   içindeki ay adı işareti. Yüzde yazmıyorsa yönün tipik büyüklüğü kullanılır
   ve kart bunu "tahmin" diye ETİKETLER. Fiyat biliniyorsa eksende gerçek para
   birimi, bilinmiyorsa bugün = 100 endeksi gösterilir. */

const MONTHS_TR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function parseChangeRange(text) {
  const s = String(text || '').replace(/–|—/g, '-');
  const both = s.match(/%\s?(\d{1,2})\s?-\s?(\d{1,2})|(\d{1,2})\s?-\s?(\d{1,2})\s?%/);
  if (both) {
    const a = Number(both[1] ?? both[3]);
    const b = Number(both[2] ?? both[4]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
  }
  const one = s.match(/%\s?(\d{1,2})|(\d{1,2})\s?%/);
  if (one) {
    const a = Number(one[1] ?? one[2]);
    if (Number.isFinite(a) && a > 0) return [Math.max(1, a - 3), a + 3];
  }
  return null;
}

function monthIndexIn(text, lang) {
  const s = String(text || '').toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en');
  const table = lang === 'tr' ? MONTHS_TR : MONTHS_EN;
  const now = new Date().getMonth();
  for (let i = 0; i < 12; i += 1) {
    if (s.includes(table[i].slice(0, 4))) {
      const diff = (i - now + 12) % 12;
      if (diff <= 5) return diff;
    }
  }
  return -1;
}

export function PriceProjection({
  outlook = {}, price = 0, currency = '', lang = 'en', L = (en) => en,
}) {
  const reduced = usePrefersReducedMotion();
  const trend = ['up', 'down', 'stable'].includes(outlook.trend) ? outlook.trend : '';
  const parsed = parseChangeRange(outlook.expectedChange || outlook.note);
  if (!trend && !parsed) return null;
  const sign = trend === 'up' ? 1 : trend === 'down' ? -1 : 0;
  // Yüzde yazmıyorsa yönün tipik büyüklüğü: yükseliş dar, düşüş geniş
  // (elektronikte fiyat aşağı doğru daha hızlı hareket eder), sabit ±2.
  const [lo, hi] = parsed || (sign > 0 ? [2, 6] : sign < 0 ? [4, 12] : [1, 3]);
  const N = 7;
  const now = new Date();
  const ayAdi = (i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    try {
      return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' }).format(d);
    } catch { return String(d.getMonth() + 1); }
  };
  // Eğri: ilk aylar yavaş, sonra hızlanır (kampanya/model döngüsü etkisi).
  const ease = (i) => Math.pow(i / (N - 1), 0.82);
  // SABİT = DÜZ ÇİZGİ DEĞİL: orta çizgi %0'da kalır, bant iki yana açılır.
  const data = Array.from({ length: N }, (_, i) => {
    const k = ease(i);
    const orta = sign * ((lo + hi) / 2) * k;
    const bant = sign === 0
      ? [-hi * k, hi * k]
      : sign > 0 ? [lo * k, hi * k] : [-hi * k, -lo * k];
    return { ay: ayAdi(i), orta, bant };
  });

  const col = sign < 0 ? CHART_COLORS.strong : sign > 0 ? CHART_COLORS.weak : CHART_COLORS.balanced;
  const bestIdx = monthIndexIn(outlook.bestTime, lang);
  const yuzde = (v) => {
    const d = Math.round(v * 10) / 10;
    if (Math.abs(d) < 0.05) return '0%';
    return `${d > 0 ? '+' : '−'}%${Math.abs(d) % 1 === 0 ? Math.abs(d) : Math.abs(d).toFixed(1)}`;
  };
  const bugunFiyat = price > 0
    ? (() => {
      try {
        return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
          style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0,
        }).format(Math.round(price));
      } catch { return `${Math.round(price)}`; }
    })()
    : '';
  const dir = sign < 0
    ? L('Prices are expected to ease', 'Fiyatların gerilemesi bekleniyor')
    : sign > 0
      ? L('Prices are expected to climb', 'Fiyatların yükselmesi bekleniyor')
      : L('Prices look flat', 'Fiyat yatay görünüyor');
  const wait = String(outlook.buyOrWait || '').toLowerCase();
  const waitLabel = wait === 'buy' ? L('Buy now', 'Şimdi al')
    : wait === 'wait' ? L('Wait', 'Bekle')
      : wait === 'watch' ? L('Keep watching', 'Takip et') : '';
  const son = data[N - 1];

  return (
    <div className="aic-price">
      <div className="aic-price-top">
        <div className="aic-price-dir" style={{ color: col }}>
          <span aria-hidden="true">{sign < 0 ? '↘' : sign > 0 ? '↗' : '→'}</span>
          <strong>{dir}</strong>
          <em>
            {sign === 0 ? '±' : sign < 0 ? '−' : '+'}
            {lo === hi ? `${lo}%` : `${lo}–${hi}%`} · {L('next 6 months', 'önümüzdeki 6 ay')}
          </em>
        </div>
        {waitLabel && <span className={`aic-price-cta ${wait}`}>{waitLabel}</span>}
      </div>

      {/* Grafik TEMBEL: recharts yalnizca fiyat grafigi gercekten cizilen
          sayfalarda inar (bkz. components/PriceChart.jsx). */}
      <Suspense fallback={<div className="aic-rc aic-rc-loading" aria-hidden="true" />}>
        <PriceChart data={data} color={col} bestIndex={bestIdx} L={L} reduced={reduced} />
      </Suspense>

      <div className="aic-price-facts">
        <span className="aic-price-range">
          <i aria-hidden="true">🎯</i>{L('In 6 months', '6 ay sonra')}
          <b style={{ color: col }}>{`${yuzde(son.bant[0])} … ${yuzde(son.bant[1])}`}</b>
        </span>
        {outlook.bestTime && (
          <span><i aria-hidden="true">🗓</i>{L('Best window', 'En iyi pencere')}<b>{outlook.bestTime}</b></span>
        )}
        {outlook.expectedChange && (
          <span><i aria-hidden="true">📉</i>{L('Expected change', 'Beklenen değişim')}<b>{outlook.expectedChange}</b></span>
        )}
      </div>
      <p className="aic-price-note">
        {bugunFiyat
          ? `${L('Today', 'Bugün')}: ${bugunFiyat} · ${L('the curve shows percentage change, not a per-month price.', 'eğri yüzde değişimi gösterir, aylık fiyat değil.')} `
          : ''}
        {L('An AI estimate, not a price guarantee.', 'AI tahminidir, fiyat garantisi değildir.')}
      </p>
    </div>
  );
}
