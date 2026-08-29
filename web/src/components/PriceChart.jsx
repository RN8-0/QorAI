// ═══════════════════════════════════════════════════════════════════════════
// FİYAT SEYRİ GRAFİĞİ — Recharts
//
// NEDEN KÜTÜPHANE: bu grafik daha önce elle yazılmış SVG'ydi. Eksen, ızgara,
// tooltip, animasyon, responsive ölçüm — hepsi tek tek elde kuruluyordu ve
// hiçbiri kütüphane kalitesine ulaşmadı. Recharts React için fiili standart
// (haftalık ~50M indirme), SVG tabanlı, animasyon yerleşik ve Tailwind
// gerektirmiyor — bu proje token tabanlı kendi CSS'ini kullandığı için bu
// son madde belirleyiciydi (react-bits / shadcn-extras Tailwind istiyor).
//
// TEMBEL YÜKLENİR: `AiCharts.jsx` bunu `React.lazy` ile çağırır, böylece
// recharts yalnızca fiyat grafiği GERÇEKTEN çizilen sayfalarda inar.
//
// VERİ UYDURULMAZ: eksen YÜZDE DEĞİŞİM gösterir. Rapor bir yön (düşüş/yükseliş)
// ve bir aralık (%10-15) veriyor; aylık kesin tutar hiçbir yerde yok, o yüzden
// grafik de tutar basmaz.
// ═══════════════════════════════════════════════════════════════════════════
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

function TipKutusu({ active, payload, label, color, L }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const fmt = (v) => {
    const d = Math.round(v * 10) / 10;
    if (Math.abs(d) < 0.05) return '0%';
    return `${d > 0 ? '+' : '−'}%${Math.abs(d) % 1 === 0 ? Math.abs(d) : Math.abs(d).toFixed(1)}`;
  };
  return (
    <div className="aic-rc-tip">
      <strong>{label}</strong>
      <b style={{ color }}>{fmt(row.orta)}</b>
      <small>{L('range', 'aralık')} {fmt(row.bant[0])} … {fmt(row.bant[1])}</small>
    </div>
  );
}

export default function PriceChart({
  data = [], color = '#22c55e', bestIndex = -1, L = (en) => en, reduced = false,
}) {
  if (!data.length) return null;
  const tick = (v) => {
    const d = Math.round(v * 10) / 10;
    if (Math.abs(d) < 0.05) return '0%';
    return `${d > 0 ? '+' : '−'}%${Math.abs(d)}`;
  };
  const bestAy = bestIndex >= 0 && data[bestIndex] ? data[bestIndex].ay : null;
  return (
    <div className="aic-rc">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 18, right: 26, left: 6, bottom: 4 }}>
          <defs>
            <linearGradient id="aicPriceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.34} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="ay"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text3)', fontSize: 12, fontWeight: 700 }}
            dy={6}
          />
          <YAxis
            tickFormatter={tick}
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: 'var(--text3)', fontSize: 11, fontWeight: 700 }}
          />
          {/* Bugün = %0 referansı */}
          <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="5 5" />
          {bestAy && (
            <ReferenceLine
              x={bestAy}
              stroke={color}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: L('best window', 'en iyi pencere'),
                position: 'insideTopLeft',
                fill: color,
                fontSize: 11,
                fontWeight: 800,
              }}
            />
          )}
          <Tooltip
            cursor={{ stroke: 'var(--text3)', strokeDasharray: '3 3' }}
            content={<TipKutusu color={color} L={L} />}
          />
          {/* Belirsizlik bandı — aralığın alt ve üst ucu */}
          <Area
            type="monotone"
            dataKey="bant"
            stroke="none"
            fill="url(#aicPriceFill)"
            isAnimationActive={!reduced}
            animationDuration={900}
          />
          {/* Orta eğri */}
          <Line
            type="monotone"
            dataKey="orta"
            stroke={color}
            strokeWidth={3}
            dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: color, stroke: 'var(--surface-2)', strokeWidth: 2.5 }}
            isAnimationActive={!reduced}
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
