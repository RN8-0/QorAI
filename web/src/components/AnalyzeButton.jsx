// ═══════════════════════════════════════════════════════════════════════════
//  "Analiz Et" — urun ve karsilastirma ekranlarinin ust eylem satirindaki
//  dikkat cekici birincil eylem.
//
//  NEDEN: AI analizini baslatmanin TEK yolu sayfanin cok asagisindaki
//  "Özellikler / AI Analizi" sekmesine inip oradaki dugmeye basmakti. Urun
//  sayfasi mobilde ~16 bin px; kullanicilarin coğu o sekmeyi hic gormuyor.
//  Buton artik ilk ekranda, "Karsilastir"in yaninda: tiklayinca sekmeyi AI'ya
//  cevirir, oraya yumusak kaydirir ve analizi BASLATIR.
//
//  Iki sayfa da AYNI bileseni kullanir — gorunum ve davranis birebir ayni
//  kalsin diye (iki ayri kopya kacinilmaz olarak birbirinden ayrisiyor).
// ═══════════════════════════════════════════════════════════════════════════
import { useI18n } from '../i18n/index.jsx';
import './AnalyzeButton.css';

// Sabit ust bar yuksekligi (--header-h) + nefes payi: `scrollIntoView` hedefi
// tam ust bara yaslayip basligi bandin ALTINDA birakiyordu.
const UST_BOSLUK = 84;

// HEDEF YERINDE DURMUYOR, o yuzden TEK BIR kaydirma yetmiyor: sekme
// "Ozellikler"den "AI Analizi"ne gecince uzun ozellik tablosu kisa AI paneliyle
// yer degistiriyor ve sayfa boyu ~14.000 px'ten 4.456 px'e dusuyor; tarayici
// kaydirmayi kirpiyor. Olculdu (canli, 390x844): tek gecisle sekme seridi
// +89 px'ten -75 px'e kayiyor, yani basliklar bandin ustunde kaliyordu.
// Duzeltme: yerlesme oturana kadar kisa araliklarla HEDEFI YENIDEN olcup
// duzeltmek. Sapma esigin altina dusunce durur (gereksiz kaydirma yok).
export function analizeKaydir(el) {
  if (!el) return;
  let azalt = false;
  try { azalt = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* yoksay */ }
  const git = (yumusak) => {
    const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - UST_BOSLUK);
    const sapma = Math.abs(y - window.scrollY);
    if (sapma < 8) return false;
    window.scrollTo({ top: y, behavior: yumusak && !azalt ? 'smooth' : 'instant' });
    return true;
  };
  git(true);
  // Yerlesme adimlari: React sekmeyi basar, panel yuklenir, resimler oturur.
  [420, 900, 1500].forEach((ms) => setTimeout(() => git(false), ms));
}

export default function AnalyzeButton({ onClick, busy = false, disabled = false, title }) {
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const etiket = busy
    ? L('Analyzing…', 'Analiz ediliyor…', 'Analysiere…')
    : L('Analyze', 'Analiz Et', 'Analysieren');

  return (
    <button
      type="button"
      className={'qai-btn' + (busy ? ' busy' : '')}
      onClick={onClick}
      disabled={disabled || busy}
      title={title || etiket}
      aria-label={etiket}
    >
      {/* IKON YOK (kullanici karari 2026-08-18). Kutu "Karsilastir" ile ayni;
          ayirt edici olan tek sey yazinin ust bardaki "Premium" animasyonu. */}
      <span className="qai-btn-txt">{etiket}</span>
    </button>
  );
}
