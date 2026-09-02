// ═══════════════════════════════════════════════════════════════════════════
// FİYAT GÖRÜNÜMÜ — tahmin zaman çizgisi
//
// ÇİZGİ GRAFİK KALDIRILDI VE GERİ GELMEYECEK. Önceki sürüm (PriceChart.jsx,
// önce recharts sonra elle SVG) yedi aylık nokta çiziyordu — ama elimizde
// AYLIK FİYAT SERİSİ YOK. Rapor tek bir şey söylüyor: bir yön, bir yüzde
// aralığı, bir zaman ufku ve bir "en iyi pencere". O yedi nokta uydurmaydı:
// gerçek bir fiyat geçmişi varmış gibi görünüyor, aslında `ease(i)` ile
// üretilmiş bir eğriydi. Sahte veriyi güzel çizmek, kötü çizmekten kötüdür.
//
// YENİ BİÇİM: tahmin zaman çizgisi. Okuyucunun 2-3 saniyede alması gereken
// üç şey var ve görsel hiyerarşi tam olarak o sırada:
//   1. bugünkü fiyat        (en büyük, mono/tabular)
//   2. beklenen değişim     (aynı büyüklükte, anlam rengiyle)
//   3. ne zaman             (zaman çizgisi: şimdi → olay → en iyi pencere)
// Sonunda tek cümlelik hüküm: beklemek mi, almak mı.
//
// UYDURMA YOK: ara kilometre taşı ancak `drivers` içinde ZAMAN BİLDİREN bir
// sürücü varsa çizilir (yeni nesil duyurusu, sezon indirimi…). Yoksa çizgi
// iki duraklı kalır. `bestTimeToBuy` boşsa pencere işareti de yoktur.
//
// EKSEN YOK, IZGARA YOK, BOŞ ÇİZİM ALANI YOK. Ayrım hairline'dan, vurgu
// tipografiden gelir (proje tasarım kaydı + ~/.claude/CLAUDE.md).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';

/* Zaman bildiren sürücüyü yakala. Sıra ÖNEMLİ: en somut olay önce.
   Eşleşme yoksa `null` döner ve zaman çizgisi iki duraklı kalır. */
const OLAY_DESENLERI = [
  { re: /(successor|next[- ]gen\w*|yeni nesil|bir sonraki nesil|iphone\s*\d+|galaxy s\d+)/i,
    en: 'Successor announcement', tr: 'Yeni nesil duyurusu' },
  { re: /(black friday|kara cuma|holiday|y[ıi]l ?sonu|seasonal|sezon)/i,
    en: 'Seasonal sales', tr: 'Sezon indirimleri' },
  { re: /(trade-?in|promotion|indirim|kampanya|retailer)/i,
    en: 'Retailer promotions', tr: 'Perakende kampanyaları' },
];

function olayBul(drivers, lang) {
  const liste = Array.isArray(drivers) ? drivers : [];
  for (const d of OLAY_DESENLERI) {
    const bulunan = liste.find((x) => d.re.test(String(x || '')));
    if (bulunan) return lang === 'tr' ? d.tr : d.en;
  }
  return null;
}

/* "Late Q1 2027 or after the successor announcement" ya da
   "Eylül-Ekim 2026 (Yeni model tanıtımından sonra)" gibi uzun bir metinden
   ROZETE SIĞACAK kısmı al.
   Sıra: parantezli açıklamayı at → ilk bağlaçta böl → hâlâ uzunsa KELİME
   SINIRINDA kes. Ham `slice` yarım kelime bırakıyordu ("…tanıtımından s"). */
function pencereKisalt(metin) {
  const t = String(metin || '').trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!t) return '';
  const ilk = t.split(/\s+(?:or|ya da|veya|and|ve)\s+/i)[0].trim();
  if (ilk.length > 2 && ilk.length <= 34) return ilk;
  const kaynak = ilk.length > 2 ? ilk : t;
  if (kaynak.length <= 34) return kaynak;
  const kesik = kaynak.slice(0, 34);
  const bosluk = kesik.lastIndexOf(' ');
  return (bosluk > 12 ? kesik.slice(0, bosluk) : kesik).trim() + '…';
}

function useGorunur(ref) {
  const [g, setG] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') { setG(true); return undefined; }
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) { setG(true); io.disconnect(); }
    }, { threshold: 0 });
    io.observe(el);
    // Gözlemci hiç ateşlemezse (sayfa yeniden yerleşirse) animasyon
    // kaybolur — ama İÇERİK KAYBOLMAZ: dinlenme durumu zaten son hâl.
    return () => io.disconnect();
  }, [ref]);
  return g;
}

export default function PriceOutlook({
  outlook = {}, price = 0, currency = '', lang = 'en', L = (en) => en,
  lo = 0, hi = 0, color = '#22c55e', trend = '',
}) {
  const kap = useRef(null);
  const gorunur = useGorunur(kap);

  const dusus = trend === 'down';
  const yukselis = trend === 'up';
  const durum = dusus ? L('Falling', 'Geriliyor')
    : yukselis ? L('Rising', 'Yükseliyor') : L('Flat', 'Yatay');

  const bugun = price > 0
    ? (() => {
      try {
        return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
          style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0,
        }).format(Math.round(price));
      } catch { return String(Math.round(price)); }
    })()
    : '';

  // ARALIK BİÇİMİ: işaret BİR KEZ, aralık kısa çizgiyle.
  // Önce "−%5 … −%10" idi; mono/tabular yüzde işaretleri tekrarlanınca
  // sayı gereksiz genişliyor ve kartın en önemli rakamı dağılıyordu.
  // TR yüzde işaretini önde ister (%5), EN arkada (5%).
  const isaret = dusus ? '−' : yukselis ? '+' : '±';
  const degisim = lo === hi
    ? (lang === 'tr' ? `${isaret}%${lo}` : `${isaret}${lo}%`)
    : (lang === 'tr' ? `${isaret}%${lo}–${hi}` : `${isaret}${lo}–${hi}%`);

  // Zaman ufku: `expectedChange` metninde varsa oradan, yoksa 6 ay.
  const ufukEsl = String(outlook.expectedChange || outlook.note || '')
    .match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(months?|ay)/i);
  const ufuk = ufukEsl
    ? `${ufukEsl[1]}–${ufukEsl[2]} ${L('months', 'ay')}`
    : L('next 6 months', 'önümüzdeki 6 ay');

  const olay = olayBul(outlook.drivers, lang);
  // Ortak şekilde alan adı `bestTime` (bkz. lib/reportAdapters.js).
  const pencere = pencereKisalt(outlook.bestTime || outlook.bestTimeToBuy);
  const bekle = String(outlook.buyOrWait || '').toLowerCase();

  const hukum = bekle === 'wait'
    ? L('Waiting is the better call — a drop is expected.',
      'Beklemek daha mantıklı — düşüş bekleniyor.')
    : bekle === 'buy'
      ? L('Buying now is reasonable — no meaningful drop expected.',
        'Şimdi almak makul — kayda değer bir düşüş beklenmiyor.')
      : dusus
        ? L('If you can wait, waiting pays — a drop is expected.',
          'Beklemeye tahammülün varsa beklemek kazandırır — düşüş bekleniyor.')
        : L('Keep an eye on it — the window can shift.',
          'Takipte kal — pencere kayabilir.');

  // ŞİMDİ durağının altına FİYAT YAZILMAZ: aynı sayı kartın en üstünde
  // zaten en büyük punto ile duruyordu, zaman çizgisinde tekrarlamak hem
  // yer harcıyor hem "bu ayrı bir sayı mı?" sorusunu doğuruyordu. Yerine
  // zaman referansı: içinde bulunduğumuz ay.
  const buAy = (() => {
    try {
      return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US',
        { month: 'short', year: 'numeric' }).format(new Date());
    } catch { return ''; }
  })();

  // Duraklar: ŞİMDİ her zaman var; olay ve pencere veriye bağlı.
  const duraklar = [
    { k: 'now', ad: L('Now', 'Şimdi'), alt: buAy, tip: 'now' },
    ...(olay ? [{ k: 'olay', ad: olay, alt: L('expected', 'bekleniyor'), tip: 'olay' }] : []),
    ...(pencere ? [{ k: 'pencere', ad: L('Best window', 'En iyi pencere'), alt: pencere, tip: 'hedef' }] : []),
  ];

  return (
    <div className={`po${gorunur ? ' po-in' : ''}`} ref={kap} style={{ '--po-renk': color }}>
      <div className="po-head">
        <span className="po-baslik">{L('Price outlook', 'Fiyat görünümü')}</span>
        <span className={`po-rozet ${dusus ? 'dus' : yukselis ? 'yuk' : 'duz'}`}>
          <i aria-hidden="true">{dusus ? '↓' : yukselis ? '↑' : '→'}</i>{durum}
          {Number(outlook.confidence) > 0 && (
            <b>{Math.round(outlook.confidence)}%</b>
          )}
        </span>
      </div>

      {/* ANA HÜKÜM — kartın en büyük iki sayısı yan yana. */}
      <div className="po-ana">
        {bugun && (
          <div className="po-blok">
            <span className="po-buyuk">{bugun}</span>
            <span className="po-etiket">{L('Today', 'Bugün')}</span>
          </div>
        )}
        <span className="po-ok" aria-hidden="true">→</span>
        <div className="po-blok">
          <span className="po-buyuk po-degisim">{degisim}</span>
          <span className="po-etiket">
            {dusus ? L('Expected decrease', 'Beklenen düşüş')
              : yukselis ? L('Expected increase', 'Beklenen artış')
                : L('Expected range', 'Beklenen aralık')}
            {' · '}{ufuk}
          </span>
        </div>
      </div>

      {/* ZAMAN ÇİZGİSİ — eksen değil, RAY. "Bekleme bölgesi" şimdi ile en iyi
          pencere arasını doldurur; okuyucu beklemenin ne kadar sürdüğünü
          sayı okumadan görür. */}
      {duraklar.length > 1 && (
        <div className="po-hat" role="group"
          aria-label={L('Price forecast timeline', 'Fiyat tahmini zaman çizgisi')}>
          <div className="po-ray" aria-hidden="true">
            <span className="po-bolge" />
          </div>
          <ol className="po-duraklar">
            {duraklar.map((d) => (
              <li key={d.k} className={`po-durak ${d.tip}`}>
                <span className="po-nokta" aria-hidden="true" />
                <span className="po-ad">{d.ad}</span>
                <span className="po-alt">{d.alt}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="po-hukum"><span aria-hidden="true">▸</span>{hukum}</p>
      <p className="po-not">
        {L('An AI estimate from product age, release cycle and retailer behaviour — not a price guarantee.',
          'Ürün yaşı, model döngüsü ve perakende davranışından çıkarılmış AI tahminidir — fiyat garantisi değildir.')}
      </p>
    </div>
  );
}
