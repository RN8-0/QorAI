// ─────────────────────────────────────────────────────────────────────────
//  AiCharts — analiz sonuçlarının paylaşılan animasyonlu grafik atomları.
//  Spec: web+app senkron 3 grafik tipi (faktör çubukları, sentiment donut,
//  faktör dağılım çubuğu) + karar rozeti + "Detaylı analiz" collapsible.
//  Renk dili: güçlü/pozitif #22c55e, orta/nötr #f59e0b, zayıf/negatif #f43f5e,
//  marka mavi #3b82f6. prefers-reduced-motion'a saygı gösterir.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import './AiCharts.css';
// Faktor tablosunun satir kumesi TEK KAYNAK — on-render (Node) da ayni
// modulu kosar; bkz. lib/factorRows.js.
import { factorColumnAverages, factorColumnWins, factorMatrixRows } from '../lib/factorRows.js';

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
  const cols = Array.isArray(products) ? products.filter((p) => p && p.name) : [];
  if (cols.length < 2) return null;
  const rows = factorMatrixRows(cols, matrix);
  if (!rows.length) return null;

  const partial = rows.some((r) => r.filled < cols.length);
  // Ürün başına ortalama — sütun altındaki tek sayı, "kim genel olarak önde".
  const avg = factorColumnAverages(rows, cols.length);
  const wins = factorColumnWins(rows, cols.length);

  return (
    <section className="aic-heat">
      <div className="aic-card-title">🧭 {L('Factor by factor', 'Faktör faktör karşılaştırma')}</div>
      <div className="aic-heat-scroll">
        <table className="aic-heat-table" style={{ '--cols': cols.length }}>
          <thead>
            <tr>
              <th className="aic-heat-corner" />
              {cols.map((p, i) => (
                <th key={`${p.name}-${i}`} className="aic-heat-col">
                  <span>{labelOf(p)}</span>
                  {wins[i] > 0 && (
                    <em className="aic-heat-wins">
                      {wins[i]} {L('leads', 'faktörde önde')}
                    </em>
                  )}
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
                        <td key={`${row.label}-${i}`}>
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
                      <td key={`${row.label}-${i}`}>
                        {/* Dolgu genişliği VERİDİR; animasyona bağlanmaz (arka
                            plandaki sekmede transition donunca boş kalıyordu). */}
                        <span className={'aic-heat-cell' + (isBest ? ' best' : '')}>
                          <i style={{ width: `${Math.max(4, Math.min(100, v))}%`, background: col }} />
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
          <tfoot>
            <tr>
              <th scope="row" className="aic-heat-label">{L('Average', 'Ortalama')}</th>
              {avg.map((v, i) => (
                <td key={`avg-${i}`}>
                  <span className="aic-heat-avg" style={v != null ? { color: scoreColor(v) } : undefined}>
                    {v == null ? '—' : v}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
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

const PROSE_NUM_RE = new RegExp(
  '('
  + '%\\s?\\d[\\d.,]*'                                   // %15
  + '|[₺$€£]\\s?\\d[\\d.,]*'                             // ₺45.000
  + '|\\d[\\d.,]*\\s?/\\s?100'                           // 89/100
  + '|\\d[\\d.,]*\\s?(?:%|mAh|GB|TB|MB|MP|GHz|MHz|Hz|nit|nits|Wh|W|mm|cm|kg|inç|inch|fps|dB|ms|TL|USD|EUR)' + WORD_END
  + '|\\d[\\d.,]*\\s?(?:yıl|yil|ay|gün|gun|saat|year|years|month|months|day|days|hour|hours)' + WORD_END
  + ')',
  'gi',
);

const PROSE_NUM_TEST = new RegExp(`^(?:${PROSE_NUM_RE.source.slice(1, -1)})$`, 'i');

function proseParts(text, keyPrefix) {
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
        out.push(<span key={`${keyPrefix}-t${si}-${pi}`}>{piece}</span>);
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

/**
 * ZENGİN RAPOR METNİ — `AiText` + okuma katmanı.
 *
 * @param text     ham AI metni
 * @param clamp    kaç paragraf açık başlasın (0 = hepsi). Gerisi katlanır.
 */
export function RichProse({ text, clamp = 3, L = (en) => en }) {
  const [open, setOpen] = useState(false);
  const blocks = proseBlocks(text);
  if (!blocks.length) return null;
  const limit = clamp > 0 && !open ? clamp : blocks.length;
  const shown = blocks.slice(0, limit);
  const hidden = blocks.length - shown.length;

  const draw = (b, i) => {
    if (b.kind === 'head') {
      return <h5 className="aic-prose-head" key={`h-${i}`}>{proseParts(b.text, `h${i}`)}</h5>;
    }
    if (b.kind === 'bullet') {
      return <li className="aic-prose-li" key={`l-${i}`}>{proseParts(b.text, `l${i}`)}</li>;
    }
    const [lead, rest] = splitLead(b.text);
    return (
      <p className="aic-prose-p" key={`p-${i}`} style={{ '--i': Math.min(i, 6) }}>
        {lead ? <strong className="aic-prose-lead">{proseParts(lead, `pl${i}`)}</strong> : null}
        {lead ? ' ' : null}
        {proseParts(rest, `pr${i}`)}
      </p>
    );
  };

  return (
    <div className={`aic-prose${open ? ' open' : ''}`}>
      {shown.map(draw)}
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
  const p = useDrawProgress({ duration: 950 });
  const trend = ['up', 'down', 'stable'].includes(outlook.trend) ? outlook.trend : '';
  const parsed = parseChangeRange(outlook.expectedChange || outlook.note);
  if (!trend && !parsed) return null;
  const sign = trend === 'up' ? 1 : trend === 'down' ? -1 : 0;
  // Yüzde yazmıyorsa yönün tipik büyüklüğü: yükseliş dar, düşüş geniş
  // (elektronikte fiyat aşağı doğru daha hızlı hareket eder), sabit ±2.
  const [lo, hi] = parsed || (sign > 0 ? [2, 6] : sign < 0 ? [4, 12] : [1, 3]);
  const N = 7;
  const now = new Date();
  const fmtMonth = (i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    try {
      return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' }).format(d);
    } catch { return String(d.getMonth() + 1); }
  };
  // Eğri: ilk aylar yavaş, sonra hızlanır (kampanya/model döngüsü etkisi).
  const ease = (i) => Math.pow(i / (N - 1), 0.82);
  const curve = (pct) => Array.from({ length: N }, (_, i) => 100 + pct * ease(i));
  // SABİT = DÜZ ÇİZGİ DEĞİL. İlk sürümde `trend: stable` olduğunda üç eğri de
  // tam 100'e oturuyordu: başlıkta "±2–8%" yazarken grafik dümdüz ve bomboş
  // çiziliyordu (ölçüldü — bu kayıtta tam olarak öyleydi). Sabit trend bir
  // KORİDORDUR: orta çizgi 100'de kalır, bant iki yana açılır.
  const mid = curve(sign * ((lo + hi) / 2));
  const band = sign === 0
    ? { lo: curve(-hi), hi: curve(hi) }
    : { lo: curve(sign > 0 ? lo : -hi), hi: curve(sign > 0 ? hi : -lo) };

  const W = 560;
  const H = 150;
  const padX = 40;
  const padTop = 14;
  const padBottom = 28;
  const all = [...band.lo, ...band.hi, 100];
  const pad = Math.max(1.5, (Math.max(...all) - Math.min(...all)) * 0.18);
  const minV = Math.min(...all) - pad;
  const maxV = Math.max(...all) + pad;
  const x = (i) => padX + (i * (W - padX * 2)) / (N - 1);
  const y = (v) => padTop + (1 - (v - minV) / Math.max(1, maxV - minV)) * (H - padTop - padBottom);
  const lineOf = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPath = `${lineOf(band.hi)} L${x(N - 1).toFixed(1)},${y(band.lo[N - 1]).toFixed(1)} ${band.lo.slice().reverse().map((v, i) => `L${x(N - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} Z`;

  const col = sign < 0 ? CHART_COLORS.strong : sign > 0 ? CHART_COLORS.weak : CHART_COLORS.balanced;
  const bestIdx = monthIndexIn(outlook.bestTime, lang);
  const money = (v) => {
    if (!(price > 0)) return `${Math.round(v)}`;
    const abs = Math.round((price * v) / 100);
    try {
      return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
        style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0,
      }).format(abs);
    } catch { return `${abs}`; }
  };
  const dir = sign < 0
    ? L('Prices are expected to ease', 'Fiyatların gerilemesi bekleniyor')
    : sign > 0
      ? L('Prices are expected to climb', 'Fiyatların yükselmesi bekleniyor')
      : L('Prices look flat', 'Fiyat yatay görünüyor');
  const wait = String(outlook.buyOrWait || '').toLowerCase();
  const waitLabel = wait === 'buy' ? L('Buy now', 'Şimdi al')
    : wait === 'wait' ? L('Wait', 'Bekle')
      : wait === 'watch' ? L('Keep watching', 'Takip et') : '';

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

      <svg className="aic-price-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        role="img" aria-label={L('Estimated price trajectory', 'Tahmini fiyat seyri')}>
        <line className="aic-price-base" x1={padX} x2={W - padX} y1={y(100)} y2={y(100)} />
        <path className="aic-price-band" d={areaPath} fill={col}
          style={{ opacity: 0.14 * p }} />
        <path className="aic-price-line" d={lineOf(mid)} stroke={col} fill="none"
          strokeDasharray="1000" strokeDashoffset={1000 * (1 - p)} />
        {bestIdx >= 0 && (
          <g className="aic-price-mark" style={{ opacity: p }}>
            <line x1={x(bestIdx)} x2={x(bestIdx)} y1={padTop} y2={H - padBottom} />
            <circle cx={x(bestIdx)} cy={y(mid[bestIdx])} r="5" fill={col} />
          </g>
        )}
        {mid.map((v, i) => (
          <text key={`x-${i}`} className="aic-price-x" x={x(i)} y={H - 10} textAnchor="middle">
            {fmtMonth(i)}
          </text>
        ))}
        <text className="aic-price-y" x={padX} y={y(100) - 8}>
          {price > 0 ? money(100) : L('today', 'bugün')}
        </text>
        {/* Bant SINIRI da çizilir: %14 opaklıktaki dolgu tek başına açık
            temada neredeyse görünmüyordu. */}
        <path className="aic-price-edge" d={lineOf(band.hi)} stroke={col} fill="none" style={{ opacity: 0.45 * p }} />
        <path className="aic-price-edge" d={lineOf(band.lo)} stroke={col} fill="none" style={{ opacity: 0.45 * p }} />
        {/* Bitiş aralığı SVG'DE DEĞİL, altındaki olgu şeridinde. İki uç
            etiketi (üst/alt bant) ay satırının üstüne düşüp çakışıyordu ve
            sağ kenar boşluğu "2.350 – 2.560 ₺" gibi bir metne yetmiyor. */}
      </svg>

      <div className="aic-price-facts">
        <span className="aic-price-range">
          <i aria-hidden="true">🎯</i>{L('In 6 months', '6 ay sonra')}
          <b style={{ color: col }}>{`${money(band.lo[N - 1])} – ${money(band.hi[N - 1])}`}</b>
        </span>
        {outlook.bestTime && (
          <span><i aria-hidden="true">🗓</i>{L('Best window', 'En iyi pencere')}<b>{outlook.bestTime}</b></span>
        )}
        {outlook.expectedChange && (
          <span><i aria-hidden="true">📉</i>{L('Expected change', 'Beklenen değişim')}<b>{outlook.expectedChange}</b></span>
        )}
      </div>
      <p className="aic-price-note">
        {price > 0
          ? L('Modelled from the current catalog price. An AI estimate, not a price guarantee.',
            'Güncel katalog fiyatı üzerinden modellendi. AI tahminidir, fiyat garantisi değildir.')
          : L('Indexed to today = 100. An AI estimate, not a price guarantee.',
            'Bugün = 100 endekslenmiştir. AI tahminidir, fiyat garantisi değildir.')}
      </p>
    </div>
  );
}
