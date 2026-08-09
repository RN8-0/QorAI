import './PageHero.css';

// Full-bleed gradient hero band used at the top of tool pages (Link Analysis,
// Subscriptions, …). Gives every page a clear, modern header with real
// breathing room under the sticky app bar and a consistent visual hierarchy:
// floating gradient icon → big title → subtitle.
// `animated`: ikonsuz sayfalarda (link analizi, abonelikler) başlığın KENDİSİ
// hareketli gradyan olur — ekranın üstünde tek bir odak kalsın diye.
export default function PageHero({ icon, title, subtitle, kicker, accent, animated = false }) {
  // Yalnız başlık verildiğinde (link analizi, abonelikler) ağır gradyan bant
  // sayfadan kopuk bir "levha" gibi duruyordu. O durumda bant kalkar, geriye
  // sadece başlık kalır — sayfayla aynı zemine oturur, sırıtmaz.
  const titleOnly = !subtitle && !icon && !kicker;
  return (
    <section className={'page-hero aurora' + (titleOnly ? ' title-only' : '')}>
      <div className="container page-hero-inner fade-up">
        {kicker && <span className="page-hero-kicker">{kicker}</span>}
        {icon && <div className="page-hero-icon" aria-hidden="true">{icon}</div>}
        <h1 className={animated ? 'page-hero-anim' : undefined}>{accent
          ? <>{title} <span className="grad-anim">{accent}</span></>
          : title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </section>
  );
}
