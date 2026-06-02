import { useEffect, useState } from 'react';

// Circular score ring — the app's signature Tech Score / Your Match gauge.
export default function Gauge({ value, size = 56, stroke = 5, color, track, fontSize }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [draw, setDraw] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setDraw(v), 60);
    return () => clearTimeout(id);
  }, [v]);
  const off = c - (draw / 100) * c;
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track || 'var(--surface-3)'} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <span className="gv" style={{ color, fontSize: fontSize || size * 0.32 }}>{Math.round(v)}</span>
    </div>
  );
}

// Tech score → ring colour (cyan family).
export function techColor(s) {
  const v = Number(s) || 0;
  return v >= 95 ? 'var(--brand-cyan)' : v >= 80 ? 'var(--brand-blue)' : 'var(--score-average)';
}
