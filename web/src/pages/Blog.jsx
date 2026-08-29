import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { pb, fileUrl } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL, hreflangAlternates } from '../lib/seo';
import { articlePath } from '../lib/routes';
import './Blog.css';

// Same deterministic baseline as BlogPost so listing counts match the article.
function seedCount(slug, min, max) {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 16777619); }
  return min + (Math.abs(h) % (max - min + 1));
}

export default function Blog() {
  const { lang } = useI18n();
  const [sp] = useSearchParams();
  const tag = (sp.get('tag') || '').trim().toLowerCase();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const nf = (n) => Number(n || 0).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');

  const pick = (a, f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const firstProdImg = (a) => { const p = (Array.isArray(a.products) ? a.products : [])[0] || {}; return p.image || p.imageUrl || ''; };
  // Cover priority: explicit URL/picked image > uploaded file > first product image.
  const coverOf = (a) => (a.cover || (a.coverFile ? fileUrl(a, a.coverFile) : firstProdImg(a)));
  const viewsOf = (a) => seedCount(a.slug, 180, 520) + (stats[a.slug]?.view || 0);
  const likesOf = (a) => seedCount(a.slug + '·l', 5, 22) + (stats[a.slug]?.like || 0);

  useSeo({
    title: L('Buying Guides & Blog — Qor AI', 'Alım Rehberleri & Blog — Qor AI'),
    description: L(
      'In-depth buying guides for phones, laptops, headphones, TVs and more — the best models of 2026, scored and compared by Qor AI.',
      'Telefon, laptop, kulaklık, TV ve daha fazlası için derinlemesine alım rehberleri — 2026\'nın en iyi modelleri, Qor AI ile puanlandı ve karşılaştırıldı.',
    ),
    path: '/blog',
    htmlLang: lang,
    alternates: hreflangAlternates('/blog'),
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
      fields: 'slug,slug_tr,slug_en,category,tags,tags_tr,tags_en,cover,coverFile,products,collectionId,collectionName,publishedAt,created,title_tr,title_en,lead_tr,lead_en',
    }).then((res) => { if (live) setPosts(res.items || []); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    // aggregate view/like counts from the public article_events collection
    pb.collection('article_events').getFullList({ fields: 'slug,type', batch: 2000 })
      .then((evs) => {
        if (!live) return;
        const agg = {};
        for (const e of evs) { const s = agg[e.slug] || (agg[e.slug] = { view: 0, like: 0 }); if (s[e.type] != null) s[e.type] += 1; }
        setStats(agg);
      }).catch(() => {});
    return () => { live = false; };
  }, []);

  return (
    <div className="container blog-page">
      <div className="blog-hero">
        <h1>{L('Buying Guides', 'Alım Rehberleri')}</h1>
        <p>{L(
          'The best models of 2026 — scored, compared and explained.',
          '2026\'nın en iyi modelleri — puanlandı, karşılaştırıldı ve anlatıldı.',
        )}</p>
      </div>

      {loading ? (
        <div className="blog-list">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="blog-row blog-card-skel" style={{ height: 120 }} />)}
        </div>
      ) : (
        <div className="blog-list">
          {tag ? (
            <div className="blog-tagfilter">
              {L('Tag', 'Etiket')}: <b>#{tag}</b> · <Link to="/blog">{L('clear', 'temizle')}</Link>
            </div>
          ) : null}
          {posts
            .filter((a) => !tag || String(pick(a, 'tags') || a.tags || '').toLowerCase().split(',').map((s) => s.trim()).includes(tag))
            .map((a) => (
            <a key={a.slug} href={articlePath(a, lang)} className="blog-row">
              {coverOf(a) ? <div className="blog-row-img"><img src={coverOf(a)} alt={pick(a, 'title')} loading="lazy" /></div> : null}
              <div className="blog-row-body">
                <h2>{pick(a, 'title')}</h2>
                <div className="blog-row-meta">
                  {(a.publishedAt || a.created) ? <span>📅 {new Date(a.publishedAt || a.created).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span> : null}
                  <span>👁 {nf(viewsOf(a))}</span>
                  <span>❤ {nf(likesOf(a))}</span>
                </div>
                <p>{pick(a, 'lead')}</p>
                <span className="blog-row-link">{L('Read guide →', 'Rehberi oku →')}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
