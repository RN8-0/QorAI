import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL } from '../lib/seo';
import './Blog.css';

export default function Blog() {
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const pick = (a, f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';

  useSeo({
    title: L('Buying Guides & Blog — Qor AI', 'Alım Rehberleri & Blog — Qor AI', 'Kaufratgeber & Blog — Qor AI'),
    description: L(
      'In-depth buying guides for phones, laptops, headphones, TVs and more — the best models of 2026, scored and compared by Qor AI.',
      'Telefon, laptop, kulaklık, TV ve daha fazlası için derinlemesine alım rehberleri — 2026\'nın en iyi modelleri, Qor AI ile puanlandı ve karşılaştırıldı.',
      'Ausführliche Kaufratgeber für Handys, Laptops, Kopfhörer, TVs und mehr — die besten Modelle 2026, von Qor AI bewertet und verglichen.',
    ),
    path: '/blog',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      '@id': `${SITE_URL}/blog#blog`,
      name: 'Qor AI Blog',
      url: `${SITE_URL}/blog`,
    },
  });

  useEffect(() => {
    let live = true;
    pb.collection('articles').getList(1, 60, {
      filter: 'status="published"',
      sort: '-publishedAt',
      fields: 'slug,category,cover,publishedAt,created,likes,title_tr,title_en,title_de,lead_tr,lead_en,lead_de',
    }).then((res) => { if (live) setPosts(res.items || []); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  return (
    <div className="container blog-page">
      <div className="blog-hero">
        <h1>{L('Buying Guides', 'Alım Rehberleri', 'Kaufratgeber')}</h1>
        <p>{L(
          'The best models of 2026 — scored, compared and explained.',
          '2026\'nın en iyi modelleri — puanlandı, karşılaştırıldı ve anlatıldı.',
          'Die besten Modelle 2026 — bewertet, verglichen und erklärt.',
        )}</p>
      </div>

      {loading ? (
        <div className="blog-list">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="blog-row blog-card-skel" style={{ height: 120 }} />)}
        </div>
      ) : (
        <div className="blog-list">
          {posts.map((a) => (
            <Link key={a.slug} to={`/blog/${a.slug}`} className="blog-row">
              {a.cover ? <div className="blog-row-img"><img src={a.cover} alt={pick(a, 'title')} loading="lazy" /></div> : null}
              <div className="blog-row-body">
                <h2>{pick(a, 'title')}</h2>
                <div className="blog-row-meta">
                  {(a.publishedAt || a.created) ? <span>📅 {new Date(a.publishedAt || a.created).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span> : null}
                  {Number(a.likes) ? <span>❤ {a.likes}</span> : null}
                </div>
                <p>{pick(a, 'lead')}</p>
                <span className="blog-row-link">{L('Read guide →', 'Rehberi oku →', 'Ratgeber lesen →')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
