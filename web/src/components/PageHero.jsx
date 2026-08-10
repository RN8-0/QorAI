import './PageHero.css';

// Araç sayfalarının (Link Analizi, Abonelikler…) üst başlığı.
//
// Premium sayfasıyla AYNI HİYERARŞİ: küçük etiket (kicker) → başlık → sayfayı
// tanımlayan kısa açıklama. Fark: renk. Premium'un moru yerine her sayfa kendi
// `variant` rengini alır ve başlık Premium'dakinden BİR TIK KÜÇÜKTÜR — bu
// sayfalarda asıl iş başlığın hemen altındaki formda, başlık ekranı yemesin.
//
// `lead` SEO içindir: sayfanın ne yaptığını, hangi kaynakları kullandığını ve
// kullanıcının ne elde edeceğini düz metinle anlatır (crawler bunu okur).
export default function PageHero({
  icon,
  title,
  titleAfter,
  subtitle,
  lead,
  kicker,
  accent,
  animated = false,
  variant,
}) {
  // Yalnız başlık verildiğinde (eski kullanım) ağır gradyan bant sayfadan kopuk
  // bir "levha" gibi duruyordu; o durumda bant kalkar.
  const description = lead || subtitle;
  const titleOnly = !description && !icon && !kicker;
  const cls = [
    'page-hero',
    'aurora',
    titleOnly ? 'title-only' : '',
    description ? 'has-lead' : '',
    variant ? `page-hero-${variant}` : '',
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
