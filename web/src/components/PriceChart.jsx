// ═══════════════════════════════════════════════════════════════════════════
// FİYAT SEYRİ GRAFİĞİ — elle yazılmış SVG
//
// RECHARTS'TAN GERİ DÖNÜLDÜ (2026-09-01) ve bu, bu dosyanın önceki notunda
// yazılı kararın BİLEREK tersine çevrilmesidir. O not haklıydı ama gerekçesi
// bu grafiğe uymuyor:
//
//   · "eksen, ızgara, tooltip, animasyon, responsive ölçüm elde kurulamadı"
//     — burada TOOLTIP GEREKMİYOR: aynı sayılar grafiğin hemen altındaki
//     "6 ay sonra / En iyi pencere / Beklenen değişim" satırında zaten
//     yazılı. Dinamik ölçüm de gerekmiyor: 7 SABİT nokta, `viewBox` +
//     `preserveAspectRatio` ile ölçekleniyor.
//   · Bedeli ölçüldü: recharts paketi 382 KB ve sitenin EN ÇOK OKUNAN
//     sayfasında (analiz) duruyor. Yedi veri noktası için kabul edilemez.
//
// TASARIM KARARLARI (proje tokenları + ~/.claude/CLAUDE.md kuralları):
//   · Biçim: belirsizlik BANDI + orta çizgi + vurgulanmış son nokta. Bant
//     mesajın kendisi — bu bir tahmin, tek bir çizgi olduğundan fazlasını
//     iddia eder.
//   · Renk: anlam taşır. Düşüş = yeşil (alıcı için iyi), yükseliş = kırmızı,
//     yatay = kehribar. Gradyan YOK, kutu/gölge YOK.
//   · Izgara: kutulu ızgara yerine tek noktalı %0 taban çizgisi + soluk
//     yatay kılavuzlar. Ayrım hairline'dan gelir.
//   · Tipografi: ay etiketleri ve yüzdeler mono/tabular.
//   · Hareket: TEK orkestre anı — görünür olunca çizgi soldan sağa çizilir
//     (stroke-dasharray), bant arkasından açılır, son nokta en sonda oturur.
//     `prefers-reduced-motion` ile tamamen kapanır.
//
// VERİ UYDURULMAZ: eksen YÜZDE DEĞİŞİM gösterir. Rapor bir yön ve bir aralık
// veriyor; aylık kesin tutar hiçbir yerde yok, grafik de tutar basmaz.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';

const W = 720;          // viewBox genişliği — ekranda genişliğe göre ölçeklenir
const H = 190;          // viewBox yüksekliği
const PAD_L = 46;       // sol: yüzde etiketleri
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 30;       // alt: ay etiketleri

/** Görünür olunca bir kez `true` olur. Animasyon SAYFA AÇILIRKEN değil,
 *  kullanıcı grafiğe geldiğinde başlasın diye.
 *
 *  EŞİK 0.25 DEĞİL 0 (ölçüldü 2026-09-01): analiz sayfası derin ve tembel
 *  içerik yüklendikçe YENİDEN YERLEŞİYOR; grafik görüş alanına girip hemen
 *  çıkıyordu ve %25 eşiği hiç dolmuyordu — animasyon HİÇ başlamıyor, grafik
 *  boş (bant genişliği 0) kalıyordu. Sıfır eşik ilk pikselde ateşler.
 *
 *  İKİNCİ SAVUNMA: gözlemci hiç ateşlemezse grafik SONSUZA KADAR boş kalır.
 *  Bu, animasyonun kaybolmasından çok daha kötü. Bir saniye sonra konum
 *  elle kontrol edilir; ekrandaysa animasyon başlar. */
function useGorunur(ref) {
  const [gorunur, setGorunur] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== 'function') { setGorunur(true); return undefined; }
    let bitti = false;
    const ac = () => { if (!bitti) { bitti = true; setGorunur(true); } };
    const io = new IntersectionObserver((girisler) => {
      if (girisler.some((g) => g.isIntersecting)) { ac(); io.disconnect(); }
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    const yedek = setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) { ac(); io.disconnect(); }
    }, 1000);
    return () => { clearTimeout(yedek); io.disconnect(); };
  }, [ref]);
  return gorunur;
}

const yuzdeEtiket = (v) => {
  const d = Math.round(v * 10) / 10;
  if (Math.abs(d) < 0.05) return '0%';
  return `${d > 0 ? '+' : '−'}%${Math.abs(d) % 1 === 0 ? Math.abs(d) : Math.abs(d).toFixed(1)}`;
};

export default function PriceChart({
  data = [], color = '#22c55e', bestIndex = -1, L = (en) => en, reduced = false,
}) {
  const kap = useRef(null);
  const gorunur = useGorunur(kap);
  if (!data.length) return null;

  // ── Ölçek. Bandın iki ucu ve orta çizgi birlikte sınırları belirler;
  //    %0 her zaman eksende kalır ki "değişim yok" çizgisi okunabilsin.
  const hepsi = data.flatMap((d) => [d.orta, d.bant[0], d.bant[1]]);
  const hamMin = Math.min(0, ...hepsi);
  const hamMax = Math.max(0, ...hepsi);
  const pay = Math.max(0.6, (hamMax - hamMin) * 0.14);
  const yMin = hamMin - pay;
  const yMax = hamMax + pay;
  const x = (i) => PAD_L + (i * (W - PAD_L - PAD_R)) / Math.max(1, data.length - 1);
  const y = (v) => PAD_T + ((yMax - v) / (yMax - yMin || 1)) * (H - PAD_T - PAD_B);

  const cizgi = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.orta).toFixed(1)}`).join(' ');
  const bant = [
    ...data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.bant[1]).toFixed(1)}`),
    ...data.slice().reverse().map((d, i) => `L${x(data.length - 1 - i).toFixed(1)},${y(d.bant[0]).toFixed(1)}`),
    'Z',
  ].join(' ');

  // Yatay kılavuzlar: %0 + üst/alt uçlar. Üçten fazlası gürültü.
  const kilavuzlar = [...new Set([0, hamMax, hamMin].map((v) => Math.round(v * 10) / 10))]
    .filter((v) => v >= yMin && v <= yMax);

  const sonI = data.length - 1;
  const sonY = y(data[sonI].orta);
  const uzunluk = 1400;   // dasharray için kaba yol uzunluğu; fazlası zararsız
  const kapaliOrtam = reduced;
  const oynat = gorunur && !kapaliOrtam;

  return (
    <div className="aic-pc" ref={kap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={`aic-pc-svg${oynat ? ' oynat' : ''}${kapaliOrtam ? ' sabit' : ''}`}
        role="img"
        aria-label={L('Expected price change over the next six months',
          'Önümüzdeki altı ayda beklenen fiyat değişimi')}
      >
        {/* Bant soldan sağa açılır: clip dikdörtgeni genişler. */}
        <defs>
          <clipPath id="aicPcClip">
            <rect className="aic-pc-clip" x="0" y="0" width={W} height={H} />
          </clipPath>
        </defs>

        {/* Yatay kılavuzlar — hairline, kutu yok. */}
        {kilavuzlar.map((v) => (
          <g key={`k${v}`}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)}
              className={v === 0 ? 'aic-pc-taban' : 'aic-pc-kilavuz'}
            />
            <text x={PAD_L - 8} y={y(v) + 3.5} className="aic-pc-yetiket" textAnchor="end">
              {yuzdeEtiket(v)}
            </text>
          </g>
        ))}

        {/* En iyi pencere: dikey işaret. Ayrı bir açıklama satırı yerine
            doğrudan eksende — okuyucu ayı grafikte görür. */}
        {bestIndex >= 0 && bestIndex < data.length && (
          <line
            x1={x(bestIndex)} x2={x(bestIndex)} y1={PAD_T} y2={H - PAD_B}
            className="aic-pc-pencere" style={{ stroke: color }}
          />
        )}

        <g clipPath="url(#aicPcClip)">
          <path d={bant} className="aic-pc-bant" style={{ fill: color }} />
          <path
            d={cizgi} className="aic-pc-cizgi" style={{ stroke: color }}
            strokeDasharray={uzunluk}
          />
        </g>

        {/* Ara noktalar sönük, SON nokta vurgulu: hüküm oradadır. */}
        {data.map((d, i) => (
          <circle
            key={`n${d.ay}-${i}`} cx={x(i)} cy={y(d.orta)} r={i === sonI ? 4.5 : 2.6}
            className={`aic-pc-nokta${i === sonI ? ' son' : ''}`}
            style={{ fill: color, animationDelay: `${340 + i * 60}ms` }}
          />
        ))}
        <circle cx={x(sonI)} cy={sonY} r="9" className="aic-pc-halka" style={{ stroke: color }} />

        {/* Ay etiketleri */}
        {data.map((d, i) => (
          <text
            key={`a${d.ay}-${i}`} x={x(i)} y={H - 10}
            className={`aic-pc-ay${i === bestIndex ? ' iyi' : ''}`} textAnchor="middle"
          >
            {d.ay}
          </text>
        ))}
      </svg>
    </div>
  );
}
