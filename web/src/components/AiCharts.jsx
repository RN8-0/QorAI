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
export function HeatMatrix({ products = [], L = (en) => en, labelOf = (p) => p.name }) {
  const rows = Array.isArray(products) ? products.filter((p) => p && p.name) : [];
  const labels = [...new Set(rows.flatMap((p) => (Array.isArray(p.factors) ? p.factors : []).map((f) => f?.label).filter(Boolean)))];
  if (!labels.length || rows.length < 2) return null;
  // Eski hâli düz renk bloklarından oluşuyordu: sütunlar içeriğe göre farklı
  // genişlikte, sayı kocaman bir bloğun ortasında kayboluyor, büyüklük farkı
  // hiç okunmuyordu ("fazla çirkin"). Artık her hücre HİZALI bir mini çubuk:
  // dolgu uzunluğu = puan, renk = güç bandı, kazanan işaretli.
  return (
    <section className="aic-heat">
      <div className="aic-card-title">🧭 {L('Factor by factor', 'Faktör faktör karşılaştırma')}</div>
      <div className="aic-heat-scroll">
        <table className="aic-heat-table" style={{ '--cols': rows.length }}>
          <thead>
            <tr>
              <th className="aic-heat-corner" />
              {rows.map((p) => (
                <th key={p.name} className="aic-heat-col"><span>{labelOf(p)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => {
              const vals = rows.map((p) => Number((p.factors || []).find((f) => f?.label === label)?.score) || 0);
              const best = Math.max(...vals);
              const tied = vals.filter((v) => v === best).length > 1;
              return (
                <tr key={label}>
                  <th scope="row" className="aic-heat-label">{label}</th>
                  {vals.map((v, i) => {
                    const col = scoreColor(v);
                    const isBest = !tied && v === best && best > 0;
                    return (
                      <td key={`${label}-${i}`}>
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
        </table>
      </div>
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
export function ForumFindings({ loved = [], chronic = [], L = (en) => en }) {
  const norm = (v) => (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string'
      ? { title: x, detail: '', frequency: '' }
      : { title: x?.title || x?.label || '', detail: x?.detail || '', frequency: x?.frequency || '' }))
    .filter((x) => x.title || x.detail);
  const iyi = norm(loved);
  const kotu = norm(chronic);
  if (!iyi.length && !kotu.length) return null;
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
