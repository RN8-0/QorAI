import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productPath } from '../lib/routes';
import './CategoryGuide.css';

// Renders the AI-written buying guide for a category (fetched from the static
// /guides/<cat>.json baked by web/scripts/gen-guides.mjs). This MUST render in
// the SPA — Google reads the post-JS DOM, so guide text baked only into the
// static shell (which React wipes on mount) wouldn't count. seo.mjs also bakes
// the same guide into the static shell for non-JS crawlers + first paint.
export default function CategoryGuide({ cat }) {
  const [guide, setGuide] = useState(null);
  useEffect(() => {
    let live = true;
    setGuide(null);
    if (!cat) return undefined;
    fetch(`/guides/${cat}.json`, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => { if (live) setGuide(g); })
      .catch(() => {});
    return () => { live = false; };
  }, [cat]);

  if (!guide || !guide.lead) return null;

  return (
    <section className="cguide" aria-label={guide.title}>
      <div className="cguide-inner">
        <h2 className="cguide-title">{guide.title}</h2>
        <p className="cguide-lead">{guide.lead}</p>

        {Array.isArray(guide.sections) && guide.sections.map((s, i) => (
          <div className="cguide-sec" key={i}>
            <h3>{s.h}</h3>
            <p>{s.body}</p>
          </div>
        ))}

        {Array.isArray(guide.picks) && guide.picks.length > 0 && (
          <div className="cguide-picks">
            <h3>{`Öne çıkan ${guide.label} modelleri`}</h3>
            <ul>
              {guide.picks.map((p) => (
                <li key={p.id}>
                  <Link to={productPath({ id: p.id, slug: p.slug, name: p.name })}>{p.name}</Link>
                  {p.why ? <span className="cguide-why"> — {p.why}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(guide.faq) && guide.faq.length > 0 && (
          <div className="cguide-faq">
            <h3>Sık sorulan sorular</h3>
            {guide.faq.map((f, i) => (
              <details key={i}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
