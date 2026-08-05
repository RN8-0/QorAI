// ═══════════════════════════════════════════════════════════════
//  Yuvarlak butonların içindeki kapat / ok ikonları
//
//  NEDEN SVG: bu ikonlar önceden metin glifiydi (× ‹ ›). CSS tarafında
//  `display:grid; place-items:center` var ama o SATIR KUTUSUNU ortalar,
//  glifin mürekkebini değil. `×` (U+00D7) matematik ekseninde durduğu için
//  kutunun üst yarısına, `‹ ›` (U+2039/203A) ise asimetrik yan boşlukları
//  yüzünden yana kaçıyordu — kullanıcı "çemberin tam ortasında değil" diye
//  bildirdi ve haklıydı. Ayrıca glif metrikleri fonta/işletim sistemine göre
//  değiştiği için sorun her cihazda farklı görünüyordu.
//
//  SVG'de geometri viewBox'a göre simetriktir: her boyutta, her fontta,
//  her platformda tam ortada durur. `currentColor` sayesinde renk mevcut
//  CSS'ten gelmeye devam eder — buton stillerine dokunmak gerekmez.
// ═══════════════════════════════════════════════════════════════

// stroke-width'i kasıtlı olarak dışarıdan alıyoruz: kapat düğmeleri ince,
// galeri okları kalın görünsün diye (eski font-weight:900 karşılığı).
function Svg({ size = '1em', width = 2, children, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // Satır kutusu artıklarını sıfırla: buton içinde tek çocuk olduğunda
      // inline hizalama yüzünden 1-2px aşağı kayabiliyor.
      style={{ display: 'block' }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconX(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconChevronLeft(props) {
  // 14 → 10: uçlar viewBox'ta simetrik, yani okun görsel ağırlık merkezi
  // tam 12,12'de kalıyor.
  return (
    <Svg {...props}>
      <path d="M14.5 5.5L8 12l6.5 6.5" />
    </Svg>
  );
}

export function IconChevronRight(props) {
  return (
    <Svg {...props}>
      <path d="M9.5 5.5L16 12l-6.5 6.5" />
    </Svg>
  );
}

export default { IconX, IconChevronLeft, IconChevronRight };
