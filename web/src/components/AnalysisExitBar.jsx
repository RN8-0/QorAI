import './AnalysisExitBar.css';

// Analiz akışlarının ÜST çıkış çubuğu.
//
// Neden: quiz / yükleme / sonuç ekranlarında "yeni analiz" ya da "vazgeç"
// düğmesi yalnızca sayfanın EN ALTINDA vardı. Uzun bir raporun ya da 6 adımlı
// bir yükleme ekranının altına inmeden akıştan çıkmak mümkün değildi.
// Bu çubuk tüm analiz akışlarında (link, abonelik, ürün, karşılaştırma)
// içeriğin ÜSTÜNDE durur ve aynı davranışı verir.
export default function AnalysisExitBar({
  lang = 'en', onExit, context = '', busy = false, label = null, hint = '',
}) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (a) => (code === 'tr' ? a[1] : code === 'de' ? a[2] : a[0]);
  const text = label || L(['New analysis', 'Yeni analiz', 'Neue Analyse']);
  return (
    <div className="axbar">
      <button type="button" className="axbar-back" onClick={onExit}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        <span>{text}</span>
      </button>
      {context ? <span className="axbar-ctx" title={context}>{context}</span> : <span />}
      {busy ? (
        <span className="axbar-busy">
          <i aria-hidden="true" />
          {hint || L(['Running in the background', 'Arka planda sürüyor', 'Läuft im Hintergrund'])}
        </span>
      ) : null}
    </div>
  );
}
