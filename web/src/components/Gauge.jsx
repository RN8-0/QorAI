import { useEffect, useState } from 'react';

// Circular score ring — the app's signature Tech Score / Your Match gauge.
//
// `animate` plays the 0→value fill on mount. Hero gauges (product detail, link
// analysis, subscriptions, compare) keep it on by default. But list CARDS turn it
// OFF (ProductCard passes animate={false}): the home/category feeds render dozens
// of these tiny gauges at once, and the animation was a real scroll-jank source —
// each gauge scheduled a post-mount setState (a second full re-render wave across
// all cards) and then ran a `stroke-dashoffset` CSS transition, which is NOT
// GPU-composited, so every ring repainted on the main thread each frame for ~1.1 s
// right after load. Static card gauges paint once.
// HALKA rengi ile RAKAM rengi ayrıldı. Rakam halkanın rengini birebir
// kullanıyordu ve açık zeminde okunmuyordu (ölçüldü: cyan #00E5FF → 1.54:1,
// mavi #2196F3 → 3.12:1; gerekli 4.5). Halka bir GRAFİK, kontrast kuralına tabi
// değil ve canlı tonunu koruyor; rakam METİN olduğu için okunabilir karşılığına
// eşleniyor. Eşleme burada yapıldığı için çağıran hiçbir yeri değiştirmek
// gerekmedi — tanınmayan renkler olduğu gibi geçer.
const INK = {
  'var(--brand-cyan)': 'var(--ink-cyan)',
  'var(--brand-blue)': 'var(--ink-blue)',
  'var(--score-average)': 'var(--ink-amber)',
};

export default function Gauge({ value, size = 56, stroke = 5, color, track, fontSize, animate = true }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [drawState, setDrawState] = useState(0);
  useEffect(() => {
    if (!animate) return undefined;
    const id = setTimeout(() => setDrawState(v), 60);
    return () => clearTimeout(id);
  }, [v, animate]);
  const draw = animate ? drawState : v;
  const off = c - (draw / 100) * c;
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track || 'var(--surface-3)'} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={animate ? { transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' } : undefined}
        />
      </svg>
      <span className="gv" style={{ color: INK[color] || color, fontSize: fontSize || size * 0.32 }}>{Math.round(v)}</span>
    </div>
  );
}

// Tech score → ring colour (cyan family).
export function techColor(s) {
  const v = Number(s) || 0;
  return v >= 95 ? 'var(--brand-cyan)' : v >= 80 ? 'var(--brand-blue)' : 'var(--score-average)';
}
