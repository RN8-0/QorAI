import './PageHero.css';

// Araç sayfalarının (Link Analizi, Abonelikler…) üst başlığı.
//
// Premium sayfasıyla AYNI HİYERARŞİ: küçük etiket (kicker) → başlık → sayfayı
// tanımlayan kısa açıklama. Farkı renk ve ölçü: Premium'un moru yerine sitenin
// kendi mavi marka tokenları kullanılır ve başlık Premium'dakinden BİR TIK
// KÜÇÜKTÜR — bu sayfalarda asıl iş başlığın hemen altındaki formda.
//
// `lead` sayfanın ne yaptığını bir cümlede anlatır; iki satırı geçmemelidir.
export default function PageHero({
  icon,
  title,
  titleAfter,
  subtitle,
  lead,
  kicker,
  accent,
  animated = false,
}) {
  // Yalnız başlık verildiğinde (eski kullanım) ağır gradyan bant sayfadan kopuk
  // bir "levha" gibi duruyordu; o durumda bant kalkar.
  const description = lead || subtitle;
  const titleOnly = !description && !icon && !kicker;
  // `aurora` iki büyük bulanık lekeyi hero'nun İÇİNE koyar ve `overflow:hidden`
  // ile kırpar. Hero kısaldığında lekeler tam ortasından kesiliyor ve sayfa
  // boyunca uzanan SERT bir yatay dikiş bırakıyordu (ölçüldü: has-lead hero
  // 164 px, leke çapı 480 px). Tanımlayıcı hero'da leke yok — zemin sitenin
  // kendi orb'larından geliyor, geçiş yumuşak kalıyor.
  const cls = [
    'page-hero',
    description ? '' : 'aurora',
    titleOnly ? 'title-only' : '',
    description ? 'has-lead' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={cls}>
      <div className="container page-hero-inner fade-up">
        {kicker && <span className="page-hero-kicker">{kicker}</span>}
        {icon && <div className="page-hero-icon" aria-hidden="true">{icon}</div>}
        <h1 className={animated ? 'page-hero-anim' : undefined}>
          {accent ? (
            <>
              {title}
              <span className="grad-anim page-hero-accent">{accent}</span>
              {titleAfter}
            </>
          ) : (
            title
          )}
        </h1>
        {description && <p className="page-hero-lead">{description}</p>}
      </div>
    </section>
  );
}
