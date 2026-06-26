import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import './Legal.css';
import { META, COPY, CONTACT_EMAIL, legalTextFor as textFor } from '../lib/legalContent.js';

export default function LegalPage({ kind }) {
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const common = copy.common;
  const [title, desc] = textFor(lang, kind);
  const sections = copy[kind] || COPY.en[kind] || [];
  const meta = META[kind] || META.terms;

  useSeo({
    title: `${title} - Qor AI`,
    description: desc,
    path: meta.path,
    type: 'article',
  });

  return (
    <div className="legal-page">
      <section className="container legal-shell">
        <aside className="legal-toc">
          <strong>{common.onThisPage}</strong>
          {sections.map(([sectionTitle], index) => (
            <a key={sectionTitle} href={`#s${index + 1}`}>{index + 1}. {sectionTitle}</a>
          ))}
        </aside>

        <article className="legal-doc">
          <header className="legal-doc-head">
            <h1>{title}</h1>
            <p>{desc}</p>
            <span className="legal-updated">{common.updated}</span>
          </header>

          <div className="legal-note">
            <strong>Qor AI</strong>
            <p>{common.legalBrand}</p>
          </div>

          {sections.map(([sectionTitle, paragraphs], index) => (
            <section className="legal-section" id={`s${index + 1}`} key={sectionTitle}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h2>{sectionTitle}</h2>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}

          <div className="legal-actions">
            <Link className="btn btn-ghost" to="/">{common.home}</Link>
            <Link className="btn btn-grad" to="/premium">{common.premium}</Link>
            <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>{common.contact}</a>
          </div>
        </article>

        <aside className="legal-related">
          <strong>{common.quickLinks}</strong>
          <Link to="/terms">{textFor(lang, 'terms')[0]}</Link>
          <Link to="/privacy">{textFor(lang, 'privacy')[0]}</Link>
          <Link to="/refund">{textFor(lang, 'refund')[0]}</Link>
          <Link to="/cookies">{textFor(lang, 'cookies')[0]}</Link>
          <Link to="/about">{textFor(lang, 'about')[0]}</Link>
          <Link to="/faq">{textFor(lang, 'faq')[0]}</Link>
          <Link to="/contact">{textFor(lang, 'contact')[0]}</Link>
        </aside>
      </section>
    </div>
  );
}
