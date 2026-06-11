import './PageHero.css';

// Full-bleed gradient hero band used at the top of tool pages (Link Analysis,
// Subscriptions, …). Gives every page a clear, modern header with real
// breathing room under the sticky app bar and a consistent visual hierarchy:
// floating gradient icon → big title → subtitle.
export default function PageHero({ icon, title, subtitle, kicker, accent }) {
  return (
    <section className="page-hero aurora">
      <div className="container page-hero-inner fade-up">
        {kicker && <span className="page-hero-kicker">{kicker}</span>}
        {icon && <div className="page-hero-icon" aria-hidden="true">{icon}</div>}
        <h1>{accent
          ? <>{title} <span className="grad-anim">{accent}</span></>
          : title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </section>
  );
}
