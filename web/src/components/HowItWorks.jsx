import './HowItWorks.css';

// "How it works" explainer — numbered cards with a gradient icon pill, a bold
// title and a short description. Mirrors the mobile app's section so the web and
// app read identically (same copy, same step order).
export default function HowItWorks({ title, steps }) {
  if (!steps || !steps.length) return null;
  return (
    <section className="hiw">
      <div className="hiw-head"><span className="hiw-bar" aria-hidden="true" />{title}</div>
      <div className="hiw-list">
        {steps.map((s, i) => (
          <div className="hiw-card" key={i}>
            <span className="hiw-no">{String(i + 1).padStart(2, '0')}</span>
            <span className="hiw-icon" style={s.grad ? { background: s.grad } : undefined} aria-hidden="true">{s.icon}</span>
            <div className="hiw-text">
              <strong>{s.title}</strong>
              <span>{s.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
