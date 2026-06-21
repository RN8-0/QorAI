import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL } from '../lib/seo';
import { productPath } from '../lib/routes';
import { amazonGoPath } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import './Blog.css';

export default function BlogPost() {
  const { slug } = useParams();
  const { lang } = useI18n();
  const geoCountry = useGeoCountry();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState('loading');

  const pick = (a, f) => (a ? (a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '') : '');

  useEffect(() => {
    let live = true;
    setStatus('loading');
    pb.collection('articles').getFirstListItem(`slug="${slug}" && status="published"`)
      .then((rec) => { if (live) { setPost(rec); setStatus('ok'); } })
      .catch(() => { if (live) setStatus('notfound'); });
    return () => { live = false; };
  }, [slug]);

  const title = pick(post, 'title');
  const lead = pick(post, 'lead');
  const body = pick(post, 'body');
  const cover = post?.cover || '';
  const products = Array.isArray(post?.products) ? post.products.filter((p) => p && p.id && p.name) : [];
  const url = `${SITE_URL}/blog/${slug}`;
  const pdesc = (p) => p[`desc_${lang}`] || p.desc_tr || p.desc_en || '';

  useSeo({
    title: title ? `${title} | Qor AI` : 'Qor AI Blog',
    description: lead,
    image: cover || undefined,
    path: `/blog/${slug}`,
    type: 'article',
    noindex: status === 'notfound',
    jsonLd: post ? {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: title,
      description: lead,
      ...(cover ? { image: [cover] } : {}),
      datePublished: post.created,
      dateModified: post.updated,
      author: { '@type': 'Organization', name: 'Qor AI' },
      publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/qor_logo_512.png?v=20260605a` } },
      mainEntityOfPage: url,
    } : null,
  });

  if (status === 'notfound') {
    return (
      <div className="container blog-page">
        <div className="blog-hero"><h1>{L('Article not found', 'Yazı bulunamadı', 'Artikel nicht gefunden')}</h1></div>
        <Link to="/blog" className="btn btn-primary">{L('All guides', 'Tüm rehberler', 'Alle Ratgeber')}</Link>
      </div>
    );
  }
  if (status === 'loading') {
    return <div className="container blog-page"><div className="blog-article"><div className="blog-card-skel" style={{ minHeight: 360, borderRadius: 18 }} /></div></div>;
  }

  return (
    <div className="container blog-page">
      <article className="blog-article">
        <nav className="blog-crumb">
          <Link to="/">Qor AI</Link> › <Link to="/blog">{L('Blog', 'Blog', 'Blog')}</Link>
        </nav>
        <h1>{title}</h1>
        {lead ? <p className="blog-lead">{lead}</p> : null}
        {body ? <div className="blog-body" dangerouslySetInnerHTML={{ __html: body }} /> : null}

        {products.length > 0 && (
          <section className="blog-rank">
            {products.map((p, i) => {
              const to = productPath({ id: p.id, slug: p.slug, name: p.name });
              return (
                <div className="rank-item" key={p.id}>
                  <div className="rank-num">{i + 1}</div>
                  <Link to={to} className="rank-media">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" /> : null}
                  </Link>
                  <div className="rank-body">
                    <div className="rank-head">
                      {p.brand ? <span className="rank-brand">{p.brand}</span> : null}
                      {p.techScore ? <span className="rank-score">{p.techScore}/100</span> : null}
                    </div>
                    <Link to={to} className="rank-title">{p.name}</Link>
                    {pdesc(p) ? <p className="rank-desc">{pdesc(p)}</p> : null}
                    <div className="rank-actions">
                      <Link to={`${to}?ai=1`} className="rank-btn rank-btn-ai">
                        ✨ {L('Analyze with AI', 'AI ile Analiz Et', 'Mit KI analysieren')}
                      </Link>
                      <a href={amazonGoPath(p, geoCountry || 'TR')} target="_blank" rel="sponsored noopener nofollow" className="rank-btn rank-btn-buy">
                        🛒 {L('Buy', 'Satın Al', 'Kaufen')}
                      </a>
                      <Link to={to} className="rank-btn rank-btn-ghost">
                        {L('Details', 'İncele', 'Details')}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <div className="blog-foot">
          <Link to="/blog" className="btn btn-ghost">{L('← All guides', '← Tüm rehberler', '← Alle Ratgeber')}</Link>
        </div>
      </article>
    </div>
  );
}
