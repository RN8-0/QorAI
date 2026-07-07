// ─────────────────────────────────────────────────────────────────────────
//  AiCharts — analiz sonuçlarının paylaşılan animasyonlu grafik atomları.
//  Spec: web+app senkron 3 grafik tipi (faktör çubukları, sentiment donut,
//  faktör dağılım çubuğu) + karar rozeti + "Detaylı analiz" collapsible.
//  Renk dili: güçlü/pozitif #22c55e, orta/nötr #f59e0b, zayıf/negatif #f43f5e,
//  marka mavi #3b82f6. prefers-reduced-motion'a saygı gösterir.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import './AiCharts.css';

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
    return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
  }, [reduced]);
  return { drawn, reduced };
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
    ? L('Buy', 'Al', 'Kaufen')
    : kind === 'consider'
      ? L('Consider', 'Düşün', 'Überlegen')
      : L('Skip', 'Geç', 'Überspringen');
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
    { label: L('Positive', 'Olumlu', 'Positiv'), value: bd.positive, color: CHART_COLORS.strong },
    { label: L('Neutral', 'Nötr', 'Neutral'), value: bd.neutral, color: CHART_COLORS.balanced },
    { label: L('Negative', 'Olumsuz', 'Negativ'), value: bd.negative, color: CHART_COLORS.weak },
  ];
  return (
    <div className="aic-card aic-sentiment">
      <div className="aic-card-title">💬 {L('Community satisfaction', 'Topluluk memnuniyeti', 'Community-Zufriedenheit')}</div>
      <div className="aic-donut">
        <DonutChart
          segments={rows}
          centerValue={`${Math.round(bd.positive)}%`}
          centerLabel={L('positive', 'olumlu', 'positiv')}
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
      <div className="aic-card-title">⚖️ {L('Factor balance', 'Faktör dengesi', 'Faktor-Balance')}</div>
      <div className="aic-dist-track" role="img" aria-label={L('Factor balance', 'Faktör dengesi', 'Faktor-Balance')}>
        {seg(strong, CHART_COLORS.strong, 0)}
        {seg(balanced, CHART_COLORS.balanced, 120)}
        {seg(weak, CHART_COLORS.weak, 240)}
      </div>
      <div className="aic-dist-legend">
        <span><i style={{ background: CHART_COLORS.strong }} />{strong} {L('strong', 'güçlü', 'stark')}</span>
        <span><i style={{ background: CHART_COLORS.balanced }} />{balanced} {L('balanced', 'dengeli', 'ausgewogen')}</span>
        <span><i style={{ background: CHART_COLORS.weak }} />{weak} {L('weak', 'zayıf', 'schwach')}</span>
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
